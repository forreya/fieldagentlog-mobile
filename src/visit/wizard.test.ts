import type { PacketCheck, VisitPacket } from "@/api/contract";
import type { VisitRecord } from "@/db/types";

import {
	answeredCount,
	checksOf,
	currentCheck,
	failIsComplete,
	incompleteFailures,
	resultFor,
	unansweredChecks,
	wizardReducer,
	type WizardAction,
	type WizardState,
} from "./wizard";

const check = (id: string): PacketCheck => ({
	id,
	code: `CODE_${id}`,
	title: `Check ${id}`,
	todo: "Do the thing",
	freq_label: "Monthly",
	standard_ref: "BS 5266-1",
	responsibility: "Caretaker",
	status: "overdue",
	status_label: "Overdue by 3 days",
});

function stateWith(ids: string[], over: Partial<VisitRecord> = {}): WizardState {
	const packet: VisitPacket = {
		visit: { id: "v1", status: "dispatched", block_name: "Elm Court", block_address: "1 Elm Rd", due_date: "2026-09-01" },
		profile: [],
		inspector: {},
		checks: ids.map(check),
		fra_actions: [],
	};
	const record: VisitRecord = {
		token: "tok",
		packet,
		inspector: { name: "", email: "" },
		results: Object.fromEntries(ids.map((id) => [id, { verdict: null, note: "", severity: null, photo_ref: null, photo_local_id: null }])),
		fra_updates: {},
		started_at: 1_000,
		updated_at: 1_000,
		submitted: null,
		...over,
	};
	return { record, step: "intro", checkIndex: 0 };
}

/** Apply actions in order, with a fixed clock. */
function run(state: WizardState, ...actions: WizardAction[]): WizardState {
	return actions.reduce((s, a) => wizardReducer(s, a, 5_000), state);
}

describe("navigation", () => {
	test("starting checks lands on the first one", () => {
		const next = run(stateWith(["a", "b"]), { type: "START_CHECKS" });
		expect(next).toMatchObject({ step: "checks", checkIndex: 0 });
	});

	test("a visit with nothing due skips straight to the summary", () => {
		// Otherwise the inspector meets an empty checks screen with no way on.
		expect(run(stateWith([]), { type: "START_CHECKS" }).step).toBe("summary");
	});

	test("next walks forward, then falls into the summary at the end", () => {
		let s = run(stateWith(["a", "b"]), { type: "START_CHECKS" });
		s = run(s, { type: "NEXT" });
		expect(s).toMatchObject({ step: "checks", checkIndex: 1 });
		s = run(s, { type: "NEXT" });
		expect(s.step).toBe("summary");
	});

	test("back from the summary returns to the last check, not the first", () => {
		const s = run(stateWith(["a", "b", "c"]), { type: "GO_SUMMARY" }, { type: "BACK" });
		expect(s).toMatchObject({ step: "checks", checkIndex: 2 });
	});

	test("back from the summary of an empty visit goes to the intro", () => {
		expect(run(stateWith([]), { type: "GO_SUMMARY" }, { type: "BACK" }).step).toBe("intro");
	});

	test("back from the first check leaves the checks and returns to the intro", () => {
		const s = run(stateWith(["a", "b"]), { type: "START_CHECKS" }, { type: "BACK" });
		expect(s.step).toBe("intro");
	});

	test("jumping to a check out of range is clamped, never out of bounds", () => {
		expect(run(stateWith(["a", "b"]), { type: "GO_CHECK", index: 99 }).checkIndex).toBe(1);
		expect(run(stateWith(["a", "b"]), { type: "GO_CHECK", index: -5 }).checkIndex).toBe(0);
	});

	test("leaving the checks keeps the answers - nothing is lost by navigating", () => {
		let s = run(stateWith(["a"]), { type: "START_CHECKS" }, { type: "SET_VERDICT", checkId: "a", verdict: "pass" });
		s = run(s, { type: "GO_INTRO" });
		expect(resultFor(s, "a").verdict).toBe("pass");
	});
});

describe("verdicts", () => {
	test("recording a verdict marks the record as touched", () => {
		const s = run(stateWith(["a"]), { type: "SET_VERDICT", checkId: "a", verdict: "pass" });
		expect(s.record.updated_at).toBe(5_000);
	});

	test("moving off Fail clears the fail-only detail", () => {
		// A severity and photo captured for a failure must never ride along with
		// a Pass into the logbook.
		let s = run(
			stateWith(["a"]),
			{ type: "SET_VERDICT", checkId: "a", verdict: "fail" },
			{ type: "SET_SEVERITY", checkId: "a", severity: "high" },
			{ type: "SET_NOTE", checkId: "a", note: "Door blocked" },
			{ type: "SET_PHOTO", checkId: "a", localId: "p1" },
		);
		expect(resultFor(s, "a")).toMatchObject({ severity: "high", note: "Door blocked", photo_local_id: "p1" });

		s = run(s, { type: "SET_VERDICT", checkId: "a", verdict: "pass" });
		expect(resultFor(s, "a")).toEqual({ verdict: "pass", severity: null, note: "", photo_ref: null, photo_local_id: null });
	});

	test("staying on Fail keeps the detail", () => {
		const s = run(
			stateWith(["a"]),
			{ type: "SET_VERDICT", checkId: "a", verdict: "fail" },
			{ type: "SET_NOTE", checkId: "a", note: "Still broken" },
			{ type: "SET_VERDICT", checkId: "a", verdict: "fail" },
		);
		expect(resultFor(s, "a").note).toBe("Still broken");
	});

	test("N/A clears fail detail too", () => {
		const s = run(
			stateWith(["a"]),
			{ type: "SET_VERDICT", checkId: "a", verdict: "fail" },
			{ type: "SET_SEVERITY", checkId: "a", severity: "intolerable" },
			{ type: "SET_VERDICT", checkId: "a", verdict: "na" },
		);
		expect(resultFor(s, "a").severity).toBeNull();
	});
});

describe("photos", () => {
	test("attaching a photo records the local id and no ref yet", () => {
		const s = run(stateWith(["a"]), { type: "SET_PHOTO", checkId: "a", localId: "p1" });
		expect(resultFor(s, "a")).toMatchObject({ photo_local_id: "p1", photo_ref: null });
	});

	test("an upload swaps the local id for the server ref", () => {
		const s = run(stateWith(["a"]), { type: "SET_PHOTO", checkId: "a", localId: "p1" }, { type: "RESOLVE_PHOTO", localId: "p1", ref: "server/p1" });
		expect(resultFor(s, "a")).toMatchObject({ photo_ref: "server/p1", photo_local_id: null });
	});

	test("resolving only touches the check that was waiting for that photo", () => {
		const s = run(
			stateWith(["a", "b"]),
			{ type: "SET_PHOTO", checkId: "a", localId: "p1" },
			{ type: "SET_PHOTO", checkId: "b", localId: "p2" },
			{ type: "RESOLVE_PHOTO", localId: "p1", ref: "server/p1" },
		);
		expect(resultFor(s, "a").photo_ref).toBe("server/p1");
		expect(resultFor(s, "b")).toMatchObject({ photo_local_id: "p2", photo_ref: null });
	});

	test("retaking replaces the queued photo rather than keeping both", () => {
		const s = run(stateWith(["a"]), { type: "SET_PHOTO", checkId: "a", localId: "p1" }, { type: "SET_PHOTO", checkId: "a", localId: "p2" });
		expect(resultFor(s, "a").photo_local_id).toBe("p2");
	});

	test("clearing removes both the queued photo and any ref", () => {
		const s = run(
			stateWith(["a"]),
			{ type: "SET_PHOTO", checkId: "a", localId: "p1" },
			{ type: "RESOLVE_PHOTO", localId: "p1", ref: "server/p1" },
			{ type: "CLEAR_PHOTO", checkId: "a" },
		);
		expect(resultFor(s, "a")).toMatchObject({ photo_ref: null, photo_local_id: null });
	});
});

describe("FRA actions", () => {
	test("set and clear round-trip", () => {
		let s = run(stateWith(["a"]), { type: "SET_FRA", actionId: "f1", status: "resolved", note: "Done" });
		expect(s.record.fra_updates.f1).toEqual({ status: "resolved", note: "Done" });
		s = run(s, { type: "CLEAR_FRA", actionId: "f1" });
		expect(s.record.fra_updates.f1).toBeUndefined();
	});

	test("only touched actions are recorded, so untouched ones are never submitted", () => {
		const s = run(stateWith(["a"]), { type: "SET_FRA", actionId: "f1", status: "outstanding", note: "" });
		expect(Object.keys(s.record.fra_updates)).toEqual(["f1"]);
	});
});

describe("submit request", () => {
	test("is stamped onto the record so it survives the app being killed", () => {
		const s = run(stateWith(["a"]), { type: "REQUEST_SUBMIT", at: 1_234 });
		expect(s.record.submit_requested_at).toBe(1_234);
	});
});

describe("selectors", () => {
	test("currentCheck follows the index", () => {
		const s = run(stateWith(["a", "b"]), { type: "GO_CHECK", index: 1 });
		expect(currentCheck(s)?.id).toBe("b");
	});

	test("answered counts verdicts, not notes", () => {
		const s = run(stateWith(["a", "b"]), { type: "SET_NOTE", checkId: "a", note: "typed but undecided" });
		expect(answeredCount(s.record)).toBe(0);
		const s2 = run(s, { type: "SET_VERDICT", checkId: "a", verdict: "na" });
		expect(answeredCount(s2.record)).toBe(1);
		expect(unansweredChecks(s2.record).map((c) => c.id)).toEqual(["b"]);
	});

	test("a failure needs a severity and a note to be complete", () => {
		let s = run(stateWith(["a"]), { type: "SET_VERDICT", checkId: "a", verdict: "fail" });
		expect(incompleteFailures(s.record).map((c) => c.id)).toEqual(["a"]);

		s = run(s, { type: "SET_SEVERITY", checkId: "a", severity: "low" });
		expect(incompleteFailures(s.record)).toHaveLength(1); // note still missing

		s = run(s, { type: "SET_NOTE", checkId: "a", note: "Cracked pane" });
		expect(incompleteFailures(s.record)).toHaveLength(0);
	});

	test("whitespace is not a note", () => {
		expect(failIsComplete({ verdict: "fail", severity: "low", note: "   ", photo_ref: null, photo_local_id: null })).toBe(false);
	});

	test("a passed check is never an incomplete failure", () => {
		const s = run(stateWith(["a"]), { type: "SET_VERDICT", checkId: "a", verdict: "pass" });
		expect(incompleteFailures(s.record)).toHaveLength(0);
	});

	test("checksOf reads the packet the record carries", () => {
		expect(checksOf(stateWith(["a", "b"]).record).map((c) => c.id)).toEqual(["a", "b"]);
	});
});
