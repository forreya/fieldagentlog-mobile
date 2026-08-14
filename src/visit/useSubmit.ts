// The submit lifecycle: from a tap on the summary to a locked success screen.
//
// The submit is NOT performed here. It goes through the same sync engine as
// everything else: persist the request, ask for a pass, then watch for the
// result landing in the record. One code path means an inspection submitted on
// a rooftop and one queued in a basement take exactly the same route, and the
// replay tests in sync/visitSync.test.ts cover both.
//
// Ownership of the phase is split so the two writers can never fight: while
// `submit()` is awaiting its own pass it owns the phase, and only once it has
// settled on `queued` does the engine subscription take over.

import { useCallback, useEffect, useRef, useState } from "react";

import type { VisitRecord } from "@/db/types";
import { loadVisit, saveVisit } from "@/db/visits";
import { syncEngine } from "@/sync/engine";
import { visitTaskId } from "@/sync/visitSync";

import type { WizardAction } from "./wizard";

export type SubmitPhase =
	| { kind: "idle" }
	/** A pass is in flight for this visit. */
	| { kind: "submitting" }
	/** Saved here, not sent yet. `online` separates no signal from a bad one. */
	| { kind: "queued"; online: boolean }
	/** Retrying cannot help - the link itself is finished. */
	| { kind: "blocked"; message: string };

const BLOCKED_FALLBACK = "This inspection couldn't be sent. The link may have expired.";

export interface Submission {
	phase: SubmitPhase;
	/** Set once the visit is submitted; the wizard then shows the success screen. */
	submitted: VisitRecord["submitted"];
	submit: () => Promise<void>;
}

export function useSubmit(record: VisitRecord, dispatch: (action: WizardAction) => void): Submission {
	const { token } = record;
	// A submit that died permanently is on the record, so reopening the visit
	// after a restart explains itself instead of offering a button that will
	// fail again silently.
	const initial: SubmitPhase = record.submit_error ? { kind: "blocked", message: record.submit_error.message } : { kind: "idle" };
	const [phase, setPhase] = useState<SubmitPhase>(initial);
	const [submitted, setSubmitted] = useState(record.submitted);

	// Mirrors `phase` for the async paths, which need the value as it is now and
	// not as it was when their closure was made.
	const phaseRef = useRef<SubmitPhase>(initial);
	const advance = useCallback((next: SubmitPhase) => {
		phaseRef.current = next;
		setPhase(next);
	}, []);

	/**
	 * Read the record back and adopt whatever the engine wrote there - it
	 * reports through the record, not to us. Returns true once the visit has
	 * reached a state this hook no longer has to wait on.
	 */
	const settle = useCallback(async (): Promise<boolean> => {
		const saved = await loadVisit(token);
		if (saved?.submitted) {
			setSubmitted(saved.submitted);
			advance({ kind: "idle" });
			return true;
		}
		if (saved?.submit_error) {
			advance({ kind: "blocked", message: saved.submit_error.message || BLOCKED_FALLBACK });
			return true;
		}
		return false;
	}, [token, advance]);

	useEffect(() => {
		// Every completed pass is a chance the queued submit landed - including
		// the automatic one when signal returns, which is how a visit queued in a
		// basement finishes itself with the summary still on screen.
		return syncEngine.subscribe((state) => {
			if (state.status !== "idle") return;
			if (phaseRef.current.kind !== "queued") return;
			void settle();
		});
	}, [settle]);

	const submit = useCallback(async () => {
		if (phaseRef.current.kind === "submitting") return;
		const at = Date.now();
		advance({ kind: "submitting" });

		// Dispatched so the in-memory record matches, and saved here rather than
		// left to the wizard's save effect because the engine reads the record
		// from the database - the request has to be on disk before the pass runs.
		dispatch({ type: "REQUEST_SUBMIT", at });
		// Any recorded failure is cleared: pressing Try again is the act that
		// puts the visit back in the queue, and leaving it set would make the
		// source skip the task it was just asked to run.
		await saveVisit({ ...record, submit_requested_at: at, updated_at: at, submit_error: undefined });

		const pass = await syncEngine.sync("submit requested");
		if (await settle()) return;

		// The pass may have reported a permanent failure without the push having
		// got as far as recording one - a photo upload that 403s, say. Read by
		// task id, never from the engine's single lastError, which belongs to
		// whichever queue failed last.
		const permanent = pass?.permanentErrors[visitTaskId(token)];
		if (permanent !== undefined) {
			advance({ kind: "blocked", message: permanent || BLOCKED_FALLBACK });
			return;
		}
		advance({ kind: "queued", online: syncEngine.isOnline() });
	}, [record, token, dispatch, advance, settle]);

	return { phase, submitted, submit };
}
