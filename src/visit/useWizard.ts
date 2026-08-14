// The wizard hook: the reducer plus the one side effect that matters -
// getting every keystroke onto disk.
//
// Writes are serialised rather than fired in parallel. Two overlapping saves
// can land out of order, and the loser is whichever finishes last, so a fast
// typist could persist a stale note over a newer one. One writer at a time,
// always writing the newest record, removes that entirely.

import { useCallback, useEffect, useReducer, useRef } from "react";

import { saveVisit } from "@/db/visits";
import type { VisitRecord } from "@/db/types";

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

export function useWizard(initial: VisitRecord): Wizard {
	const [state, dispatch] = useReducer(reduce, initial, initialWizardState);
	const persist = usePersister();
	const firstRender = useRef(true);

	useEffect(() => {
		// Nothing to write on mount: the record came from storage (or was just
		// saved by the loader), so re-saving it would be a pointless write.
		if (firstRender.current) {
			firstRender.current = false;
			return;
		}
		persist(state.record);
	}, [state.record, persist]);

	return { state, dispatch };
}
