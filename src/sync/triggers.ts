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
// WHICH SIGNAL MEANS "ONLINE" - decided by watching a real device.
//
// The obvious choice is `isInternetReachable`, since a phone attached to an
// access point with no route out is a classic false positive. But NetInfo
// establishes that with its own probe, and once it believes there is no
// internet it only re-probes every 60 seconds. Measured on a device: airplane
// mode off, ping succeeding, and the app still reporting offline a minute
// later. For someone walking out of a basement wanting their morning's work to
// leave the phone, that is a bad trade.
//
// So `isConnected` decides: the moment the OS says there is a network, the
// queue may try. Our own request is a better reachability test than a probe to
// a third party, and the cost of being wrong is bounded - a failed attempt,
// then jittered backoff. The cost of being slow is a field worker standing in
// a car park waiting for a spinner.
//
// A shorter reachability interval is configured too, so the finer-grained
// signal is at least current when something else consults it.

import NetInfo from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";

import { syncEngine, type SyncEngine } from "./engine";

NetInfo.configure({
	// Default is 60s once unreachable, which is the delay described above.
	reachabilityLongTimeout: 10_000,
	reachabilityShortTimeout: 5_000,
	reachabilityRequestTimeout: 10_000,
});

/**
 * Start listening. Returns a teardown for tests and for sign-out.
 */
export function startSyncTriggers(engine: SyncEngine = syncEngine): () => void {
	const unsubscribeNet = NetInfo.addEventListener((state) => {
		// isConnected, not isInternetReachable - see the note at the top.
		// null means "not yet determined": treat that as online rather than
		// blocking the queue on an unknown.
		engine.setOnline(state.isConnected ?? true);
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
