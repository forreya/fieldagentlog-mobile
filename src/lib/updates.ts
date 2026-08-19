// When a new build is allowed to take over.
//
// The web's rule (see fieldagent/src/lib/pwa.ts): download in the background,
// and only swap while the app is out of sight - never under someone's thumb,
// and never during a visit. A field app that reloads itself mid-inspection is
// worse than one running last week's build for another hour.
//
// Native gets there differently, and more safely. expo-updates downloads a new
// bundle in the background and applies it at the NEXT COLD START. Nothing has
// to decide when it is safe, because there is no moment at which the running
// app is swapped out from under anyone - unless something calls reloadAsync(),
// which is why nothing in this app does. There is no code here to apply an
// update, and that absence is the policy.
//
// Two settings carry the rest of it, both in app.json:
//
//   fallbackToCacheTimeout: 0  Launch from the bundle already on the phone,
//                              always. Never make somebody standing at a door
//                              wait on a network check to open the app.
//   checkAutomatically: ON_LOAD  Look for a new one after launch, not before.
//
// And runtimeVersion uses the fingerprint policy, so a JavaScript-only update
// can never land on a binary whose native side is different.

import * as Updates from "expo-updates";

export interface UpdateState {
	/** A newer bundle is on the phone and will be used from the next launch. */
	pending: boolean;
	/** The bundle running now: an update id, or "embedded" for the shipped one. */
	running: string;
	/** The runtime this binary accepts updates for. */
	runtimeVersion: string;
	/** The release track this binary listens to: production, preview, ... */
	channel: string;
	/** False in Expo Go and in development, where OTA does not apply. */
	enabled: boolean;
}

/**
 * What the Diagnostics screen reports.
 *
 * The question this answers is asked down a phone line: "it is still doing the
 * thing I told you about" - is the phone actually running the fix? A pending
 * update means yes, but not until they close and reopen the app, which is a
 * sentence somebody can act on.
 *
 * `pending` only exists on the hook, so it is passed in: everything else is a
 * module constant and readable anywhere.
 */
export function updateState(pending = false): UpdateState {
	// isEnabled alone is not enough, and neither is a non-null channel. Expo Go
	// reports isEnabled true, hands back an updateId of its own, and gives the
	// channel as "" rather than null - so the row read "Up to date" on a phone
	// that cannot receive an update at all, which is the one answer a diagnostic
	// must never give. Only a build actually wired to a track can receive one.
	const channel = Updates.channel ?? "";

	return {
		pending,
		running: Updates.isEmbeddedLaunch ? "embedded" : (Updates.updateId ?? "embedded"),
		runtimeVersion: Updates.runtimeVersion ?? "",
		channel,
		enabled: Updates.isEnabled && channel.length > 0,
	};
}

/** The same thing, wired to the live flag. */
export function useUpdateState(): UpdateState {
	const { isUpdatePending } = Updates.useUpdates();
	return updateState(isUpdatePending);
}

/** Plain English for the same thing. */
export function updateLabel(state: UpdateState): string {
	if (!state.enabled) return "Not used in this build";
	if (state.pending) return "An update is ready - it starts next time the app is opened";
	const track = ` (${state.channel})`;
	return state.running === "embedded" ? `Running the version that was installed${track}` : `Up to date${track}`;
}
