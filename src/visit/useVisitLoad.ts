// Loading a visit: read what the device holds, ask the server, decide.
//
// The hook does the I/O and nothing else; the decision lives in load.ts, which
// is pure and where the tests are. Nothing needs registering with the sync
// engine: the moment a record is saved it is in the database, and the database
// is what the engine reads.

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchPacket } from "@/api/visit";
import { loadVisit, saveVisit } from "@/db/visits";

import { decideLoad, lockedRecord, type FetchOutcome, type VisitLoad } from "./load";

export interface VisitLoadView {
	state: VisitLoad;
	/** Re-attempt. Only offered on the retryable states. */
	retry: () => void;
}

export function useVisitLoad(token: string): VisitLoadView {
	const [state, setState] = useState<VisitLoad>({ status: "loading" });
	const live = useRef(true);

	// No synchronous setState here: the initial state is already "loading", so
	// setting it again on mount would be a wasted cascading render. A retry is
	// the only case that needs it, and does it itself.
	const load = useCallback(async () => {
		const cached = await loadVisit(token);
		// A locked visit needs no request, which is what makes reopening a
		// finished visit work with no signal at all.
		const locked = lockedRecord(cached);
		if (locked) {
			if (live.current) setState({ status: "submitted", record: locked });
			return;
		}

		let outcome: FetchOutcome;
		try {
			outcome = { ok: true, packet: await fetchPacket(token) };
		} catch (error) {
			outcome = { ok: false, error };
		}

		const next = decideLoad(token, cached, outcome);
		// Persist as soon as there is something to persist: from here on the
		// visit survives the app being killed, which is the whole promise.
		if (next.status === "ready") await saveVisit(next.record);
		if (live.current) setState(next);
	}, [token]);

	useEffect(() => {
		live.current = true;
		void load();
		return () => {
			live.current = false;
		};
	}, [load]);

	const retry = useCallback(() => {
		setState({ status: "loading" });
		void load();
	}, [load]);

	return { state, retry };
}
