// The one subscription to the sync engine that screens use.
//
// Shaped for the pill deliberately: `StatusPill` is a presentational primitive
// and must not know the engine exists, so the translation happens here rather
// than being repeated at every call site.

import { useEffect, useState } from "react";

import type { SyncState as PillState } from "@/components/StatusPill";

import { syncEngine } from "./engine";

/** Engine state as the pill wants it. Exported for screens that already hold
 *  the full state and should not open a second subscription for the pill. */
export function pillState(state: { online: boolean; status: "idle" | "syncing"; pending: number }): PillState {
	return { online: state.online, syncing: state.status === "syncing", pending: state.pending };
}

function same(a: PillState, b: PillState): boolean {
	return a.online === b.online && a.syncing === b.syncing && a.pending === b.pending;
}

/** Live connection and queue state, for the app bar. */
export function useSyncStatus(): PillState {
	const [state, setState] = useState<PillState>(() => pillState(syncEngine.getState()));

	useEffect(() => {
		// subscribe() delivers the current state immediately, so a screen that
		// mounts mid-pass shows the pass rather than a stale "Online". Returning
		// the previous object when nothing the pill shows has changed lets React
		// bail out: the engine emits on every pass, and `lastError` or `failures`
		// moving is not a reason to re-render a screen.
		return syncEngine.subscribe((next) => setState((prev) => (same(prev, pillState(next)) ? prev : pillState(next))));
	}, []);

	return state;
}
