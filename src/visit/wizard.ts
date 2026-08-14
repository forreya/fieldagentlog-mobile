// The wizard's state machine: where the inspector is, and what they have
// answered. Ported from the web app's src/state/visitStore.tsx, which is
// deliberate - the behaviour is field-proven and the rules below are the
// product, not implementation detail.
//
// Pure. No storage, no network, no React. Persistence and platform belong to
// useWizard; everything worth arguing about is decided here and tested here.

import type { PacketCheck, Severity, Verdict, VisitPacket } from "@/api/contract";
import type { CheckResult, FraUpdate, VisitRecord } from "@/db/types";

export type WizardStep = "intro" | "checks" | "summary";

export interface WizardState {
	record: VisitRecord;
	step: WizardStep;
	/** Index into the packet's checks while on the checks step. */
	checkIndex: number;
}

/** Moving around the wizard. Never changes what was answered. */
export type NavigationAction =
	| { type: "START_CHECKS" }
	| { type: "GO_INTRO" }
	| { type: "GO_SUMMARY" }
	| { type: "GO_CHECK"; index: number }
	| { type: "NEXT" }
	| { type: "BACK" };

/** Changing what the visit says. Always stamps updated_at. */
export type ContentAction =
	| { type: "SET_INSPECTOR"; name: string; email: string }
	| { type: "SET_VERDICT"; checkId: string; verdict: Verdict }
	| { type: "SET_NOTE"; checkId: string; note: string }
	| { type: "SET_SEVERITY"; checkId: string; severity: Severity }
	| { type: "SET_PHOTO"; checkId: string; localId: string }
	| { type: "CLEAR_PHOTO"; checkId: string }
	/** A queued photo finally uploaded; swap its local id for the server ref. */
	| { type: "RESOLVE_PHOTO"; localId: string; ref: string }
	| { type: "SET_FRA"; actionId: string; status: FraUpdate["status"]; note: string }
	| { type: "CLEAR_FRA"; actionId: string }
	| { type: "REQUEST_SUBMIT"; at: number };

export type WizardAction = NavigationAction | ContentAction;

const NAVIGATION = new Set(["START_CHECKS", "GO_INTRO", "GO_SUMMARY", "GO_CHECK", "NEXT", "BACK"]);

function isNavigation(action: WizardAction): action is NavigationAction {
	return NAVIGATION.has(action.type);
}

/** The packet, typed. It is stored as `unknown` because it is the server's
 *  shape rendered verbatim, so every reader would otherwise cast - and one
 *  reader had already invented its own narrower, wrong shape. */
export function packetOf(record: VisitRecord): VisitPacket {
	return record.packet as VisitPacket;
}

export function checksOf(record: VisitRecord): PacketCheck[] {
	return (packetOf(record).checks ?? []) as PacketCheck[];
}

/** What the app bar says on every wizard screen. */
export function blockNameOf(record: VisitRecord): string {
	return packetOf(record).visit?.block_name || "Inspection";
}

function emptyResult(): CheckResult {
	return { verdict: null, note: "", severity: null, photo_ref: null, photo_local_id: null };
}

/** Apply a change to the record and stamp it as touched. */
function withRecord(state: WizardState, mutate: (r: VisitRecord) => VisitRecord, now: number): WizardState {
	return { ...state, record: { ...mutate(state.record), updated_at: now } };
}

function setResult(record: VisitRecord, checkId: string, patch: Partial<CheckResult>): VisitRecord {
	const current = record.results[checkId] ?? emptyResult();
	return { ...record, results: { ...record.results, [checkId]: { ...current, ...patch } } };
}

export function wizardReducer(state: WizardState, action: WizardAction, now: number = Date.now()): WizardState {
	return isNavigation(action) ? navigate(state, action) : edit(state, action, now);
}

/** Where the inspector is. Deliberately cannot touch the answers. */
function navigate(state: WizardState, action: NavigationAction): WizardState {
	switch (action.type) {
		case "START_CHECKS": {
			// A visit with nothing due still needs somewhere to go. Dropping the
			// inspector straight at the summary beats an empty checks screen.
			if (checksOf(state.record).length === 0) return { ...state, step: "summary" };
			return { ...state, step: "checks", checkIndex: 0 };
		}
		case "GO_INTRO":
			return { ...state, step: "intro" };
		case "GO_SUMMARY":
			return { ...state, step: "summary" };
		case "GO_CHECK":
			return { ...state, step: "checks", checkIndex: clamp(action.index, checksOf(state.record).length) };

		case "NEXT": {
			const total = checksOf(state.record).length;
			if (state.checkIndex >= total - 1) return { ...state, step: "summary" };
			return { ...state, checkIndex: state.checkIndex + 1 };
		}
		case "BACK": {
			if (state.step === "summary") {
				const total = checksOf(state.record).length;
				if (total === 0) return { ...state, step: "intro" };
				return { ...state, step: "checks", checkIndex: total - 1 };
			}
			if (state.checkIndex <= 0) return { ...state, step: "intro" };
			return { ...state, checkIndex: state.checkIndex - 1 };
		}
	}
}

/** What the visit says. Every branch stamps the record as touched. */
function edit(state: WizardState, action: ContentAction, now: number): WizardState {
	switch (action.type) {
		case "SET_INSPECTOR":
			return withRecord(state, (r) => ({ ...r, inspector: { name: action.name, email: action.email } }), now);

		case "SET_VERDICT":
			return withRecord(
				state,
				(r) => {
					// Moving away from Fail clears the fail-only detail. Otherwise a
					// severity and photo captured for a failure would ride along with a
					// Pass into the logbook, which is worse than losing them.
					const patch: Partial<CheckResult> =
						action.verdict === "fail"
							? { verdict: "fail" }
							: { verdict: action.verdict, severity: null, note: "", photo_ref: null, photo_local_id: null };
					return setResult(r, action.checkId, patch);
				},
				now,
			);
		case "SET_NOTE":
			return withRecord(state, (r) => setResult(r, action.checkId, { note: action.note }), now);
		case "SET_SEVERITY":
			return withRecord(state, (r) => setResult(r, action.checkId, { severity: action.severity }), now);
		case "SET_PHOTO":
			return withRecord(state, (r) => setResult(r, action.checkId, { photo_local_id: action.localId, photo_ref: null }), now);
		case "CLEAR_PHOTO":
			return withRecord(state, (r) => setResult(r, action.checkId, { photo_local_id: null, photo_ref: null }), now);

		case "RESOLVE_PHOTO":
			return withRecord(
				state,
				(r) => {
					const results = { ...r.results };
					for (const [id, result] of Object.entries(results)) {
						if (result.photo_local_id === action.localId) {
							results[id] = { ...result, photo_ref: action.ref, photo_local_id: null };
						}
					}
					return { ...r, results };
				},
				now,
			);

		case "SET_FRA":
			return withRecord(
				state,
				(r) => ({ ...r, fra_updates: { ...r.fra_updates, [action.actionId]: { status: action.status, note: action.note } } }),
				now,
			);
		case "CLEAR_FRA":
			return withRecord(
				state,
				(r) => {
					const next = { ...r.fra_updates };
					delete next[action.actionId];
					return { ...r, fra_updates: next };
				},
				now,
			);

		case "REQUEST_SUBMIT":
			// Recorded on the record, not in memory: a submit asked for underground
			// must still go after the app is killed and reopened.
			return withRecord(state, (r) => ({ ...r, submit_requested_at: action.at }), now);
	}
}

function clamp(index: number, total: number): number {
	if (total === 0) return 0;
	return Math.min(Math.max(0, index), total - 1);
}

// ── Selectors ───────────────────────────────────────────────────────────────

export function currentCheck(state: WizardState): PacketCheck | undefined {
	return checksOf(state.record)[state.checkIndex];
}

export function resultFor(state: WizardState, checkId: string): CheckResult {
	return state.record.results[checkId] ?? emptyResult();
}

/** A check counts as answered once it has a verdict. */
export function answeredCount(record: VisitRecord): number {
	return checksOf(record).filter((c) => record.results[c.id]?.verdict).length;
}

export function unansweredChecks(record: VisitRecord): PacketCheck[] {
	return checksOf(record).filter((c) => !record.results[c.id]?.verdict);
}

/**
 * Whether a failed check has everything the logbook needs. The server requires
 * a severity and a note on a failure; a photo is encouraged but optional.
 */
export function failIsComplete(result: CheckResult): boolean {
	return result.verdict !== "fail" || Boolean(result.severity && result.note.trim());
}

/** Checks that are failed but still missing their severity or note. */
export function incompleteFailures(record: VisitRecord): PacketCheck[] {
	return checksOf(record).filter((c) => {
		const result = record.results[c.id];
		return result?.verdict === "fail" && !failIsComplete(result);
	});
}
