// What wakes the sync engine up. Kept apart from the engine so the engine
// stays testable without a device: it knows "online or not" and "please run",
// and nothing about NetInfo or the app lifecycle.
//
// Three triggers, because a phone offers more than a browser's `online` event:
//   - connectivity changes  - the obvious one
//   - returning to the foreground - iOS suspends a backgrounded app, so a queue
//     that drained "in the background" often did not; the app coming back is
//     the real moment work can move
//   - an explicit nudge after a capture, so a photo taken with signal uploads
//     now rather than at the next lifecycle event
//
// `isInternetReachable` rather than `isConnected`: a phone attached to a wifi
// access point with no route out is the classic false positive, and on a site
// with a captive portal it is common.

import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";

import { syncEngine, type SyncEngine } from "./engine";

/**
 * Start listening. Returns a teardown for tests and for sign-out.
 */
export function startSyncTriggers(engine: SyncEngine = syncEngine): () => void {
	const unsubscribeNet = NetInfo.addEventListener((state) => {
		// null means "not yet determined" - treat it as online rather than
		// blocking the queue on an unknown.
		engine.setOnline(state.isInternetReachable ?? state.isConnected ?? true);
	});

	// currentState can be null before the native module has reported in
	// (Android, and in tests), so this must not assume a string.
	let previous: AppStateStatus | null = AppState.currentState;
	const appStateSub = AppState.addEventListener("change", (next) => {
		const wasAway = previous === "background" || previous === "inactive";
		previous = next;
		if (wasAway && next === "active") void engine.sync("app foregrounded");
	});

	return () => {
		unsubscribeNet();
		appStateSub.remove();
	};
}

/** Nudge the engine after capturing something. Safe to call as often as you like. */
export function requestSync(reason: string, engine: SyncEngine = syncEngine): void {
	void engine.sync(reason);
}
