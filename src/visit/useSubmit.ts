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
	const [phase, setPhase] = useState<SubmitPhase>({ kind: "idle" });
	const [submitted, setSubmitted] = useState(record.submitted);

	// Mirrors `phase` for the async paths, which need the value as it is now and
	// not as it was when their closure was made.
	const phaseRef = useRef<SubmitPhase>({ kind: "idle" });
	const advance = useCallback((next: SubmitPhase) => {
		phaseRef.current = next;
		setPhase(next);
	}, []);

	/** Read the record back; the engine writes the result there, not to us. */
	const landed = useCallback(async (): Promise<boolean> => {
		const saved = await loadVisit(token);
		if (!saved?.submitted) return false;
		setSubmitted(saved.submitted);
		advance({ kind: "idle" });
		return true;
	}, [token, advance]);

	useEffect(() => {
		// Every completed pass is a chance the queued submit landed - including
		// the automatic one when signal returns, which is how a visit queued in a
		// basement finishes itself with the summary still on screen.
		return syncEngine.subscribe((state) => {
			if (state.status !== "idle") return;
			if (phaseRef.current.kind !== "queued") return;
			void landed();
		});
	}, [landed]);

	const submit = useCallback(async () => {
		if (phaseRef.current.kind === "submitting") return;
		const at = Date.now();
		advance({ kind: "submitting" });

		// Dispatched so the in-memory record matches, and saved here rather than
		// left to the wizard's save effect because the engine reads the record
		// from the database - the request has to be on disk before the pass runs.
		dispatch({ type: "REQUEST_SUBMIT", at });
		await saveVisit({ ...record, submit_requested_at: at, updated_at: at });

		const pass = await syncEngine.sync("submit requested");
		if (await landed()) return;

		// A permanent failure means the token is spent, expired or revoked: no
		// amount of waiting will change it, so saying "waiting for signal" would
		// be a lie. Read by task id, never from the engine's single lastError,
		// which belongs to whichever queue failed last. Only the pass this call
		// awaited is inspected; a later pass failing this way leaves the queued
		// copy, which D's sync status covers.
		const permanent = pass?.permanentErrors[visitTaskId(token)];
		if (permanent !== undefined) {
			advance({ kind: "blocked", message: permanent || BLOCKED_FALLBACK });
			return;
		}
		advance({ kind: "queued", online: syncEngine.isOnline() });
	}, [record, token, dispatch, advance, landed]);

	return { phase, submitted, submit };
}
