// The wizard hook: the reducer plus the side effects that matter - getting
// every keystroke onto disk, and staying honest about photos the sync engine
// uploads while the wizard is open.
//
// Writes are serialised rather than fired in parallel. Two overlapping saves
// can land out of order, and the loser is whichever finishes last, so a fast
// typist could persist a stale note over a newer one. One writer at a time,
// always writing the newest record, removes that entirely.

import { useCallback, useEffect, useReducer, useRef } from "react";

import { getPhoto } from "@/db/photos";
import { saveVisit } from "@/db/visits";
import type { VisitRecord } from "@/db/types";
import { syncEngine } from "@/sync/engine";

import { wizardReducer, type WizardAction, type WizardState } from "./wizard";

export function initialWizardState(record: VisitRecord): WizardState {
	return { record, step: "intro", checkIndex: 0 };
}

/** Serialises saves per hook instance; always persists the latest record. */
function usePersister() {
	const pending = useRef<VisitRecord | null>(null);
	const writing = useRef(false);

	return useCallback((record: VisitRecord) => {
		pending.current = record;
		if (writing.current) return;

		writing.current = true;
		void (async () => {
			try {
				while (pending.current) {
					const next = pending.current;
					pending.current = null;
					// saveVisit is best-effort by design: a full or locked database
					// must not interrupt someone mid-check.
					await saveVisit(next);
				}
			} finally {
				writing.current = false;
			}
		})();
	}, []);
}

export interface Wizard {
	state: WizardState;
	dispatch: (action: WizardAction) => void;
}

/** useReducer wants exactly (state, action); the reducer's injectable clock is
 *  for the tests, so the real clock is bound here. */
function reduce(state: WizardState, action: WizardAction): WizardState {
	return wizardReducer(state, action);
}

/** Local ids of the photos the record still points at. */
function pendingPhotoIds(record: VisitRecord): string[] {
	return Object.values(record.results).flatMap((result) => (result.photo_local_id ? [result.photo_local_id] : []));
}

/**
 * Adopt the server ref of any queued photo a pass has already uploaded.
 *
 * The engine records refs in the database as they land, but this hook's record
 * is in memory - and every save it makes is a whole-record overwrite. Without
 * this, a save after a mid-visit upload would clobber the recorded ref and the
 * photo would be silently dropped from the submitted visit.
 */
async function adoptUploadedRefs(record: VisitRecord, dispatch: (action: WizardAction) => void): Promise<void> {
	for (const localId of pendingPhotoIds(record)) {
		try {
			const row = await getPhoto(localId);
			if (row?.ref) dispatch({ type: "RESOLVE_PHOTO", localId, ref: row.ref });
		} catch {
			/* best-effort: the next idle pass tries again */
		}
	}
}

export function useWizard(initial: VisitRecord): Wizard {
	const [state, dispatch] = useReducer(reduce, initial, initialWizardState);
	const persist = usePersister();
	const firstRender = useRef(true);
	const knownPhotoIds = useRef<Set<string>>(new Set(pendingPhotoIds(initial)));

	useEffect(() => {
		const ids = pendingPhotoIds(state.record);
		const captured = ids.some((id) => !knownPhotoIds.current.has(id));
		knownPhotoIds.current = new Set(ids);

		// Nothing to write on mount: the record came from storage (or was just
		// saved by the loader), so re-saving it would be a pointless write.
		if (firstRender.current) {
			firstRender.current = false;
			return;
		}
		persist(state.record);
		// Nudge only after the persist is in flight: the pass reads the record
		// from the database, so the write must be enqueued before the engine
		// starts reading. A photo taken with signal then uploads now rather
		// than in one burst at submit.
		if (captured) void syncEngine.sync("photo captured");
	}, [state.record, persist]);

	// The engine reports upload progress through the database, not to us; every
	// completed pass is a chance a queued photo now has its server ref.
	const recordRef = useRef(state.record);
	useEffect(() => {
		recordRef.current = state.record;
	}, [state.record]);
	useEffect(() => {
		return syncEngine.subscribe((engineState) => {
			if (engineState.status !== "idle") return;
			void adoptUploadedRefs(recordRef.current, dispatch);
		});
	}, []);

	return { state, dispatch };
}
