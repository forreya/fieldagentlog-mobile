// The join between the cleaner's app and the inspection wizard.
//
// A cleaner on site taps "Start checks" and lands in the same wizard an
// external inspector uses. Two things have to survive that hop, and they have
// to survive the app being killed in the middle of it:
//
//   1. Which visit was launched from the cleaner app, so the wizard can offer a
//      way back instead of stranding someone mid-shift on a screen whose only
//      exit is a sign-in wall.
//   2. That the checks were submitted, so the cleaner home can say so once.
//
// The web does this with sessionStorage, which dies with the tab. Here it has
// to outlive a force-stop - a cleaner in a stairwell with 3% battery is exactly
// who this is for - so it goes to AsyncStorage.
//
// Keyed by token, not a bare flag. An abandoned handoff must not make the NEXT
// visit, opened cold from a link, offer a way back into somebody's app.

import AsyncStorage from "@react-native-async-storage/async-storage";

const HANDOFF = "fa.cleaner.handoff";
const SUBMITTED = "fa.cleaner.checks-submitted";

export interface Handoff {
	/** The visit token the cleaner was sent into. */
	token: string;
	/** Named on the way back: "Back to Elm Court" beats "Back". */
	siteName: string;
}

function parse(raw: string | null): Handoff | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<Handoff>;
		if (typeof value.token !== "string" || !value.token) return null;
		return { token: value.token, siteName: typeof value.siteName === "string" ? value.siteName : "your site visit" };
	} catch {
		return null;
	}
}

/** Called just before the cleaner app hands off to the wizard. */
export async function markHandoff(handoff: Handoff): Promise<void> {
	try {
		await AsyncStorage.setItem(HANDOFF, JSON.stringify(handoff));
	} catch {
		// Storage refused. The handoff is a convenience; the checks themselves
		// still work, and the cleaner can navigate back by hand.
	}
}

/** The handoff in progress, if any. */
export async function readHandoff(): Promise<Handoff | null> {
	try {
		return parse(await AsyncStorage.getItem(HANDOFF));
	} catch {
		return null;
	}
}

/** True when THIS visit is the one the cleaner was handed off into. */
export async function isHandoffFor(token: string): Promise<boolean> {
	const handoff = await readHandoff();
	return handoff?.token === token;
}

export async function clearHandoff(): Promise<void> {
	try {
		await AsyncStorage.removeItem(HANDOFF);
	} catch {
		/* nothing to do; a stale marker is scoped to one token and harmless */
	}
}

/** Leaving the wizard for the cleaner home. `submitted` shows the confirmation
 *  there, exactly once. */
export async function endHandoff(submitted: boolean): Promise<void> {
	await clearHandoff();
	if (!submitted) return;
	try {
		await AsyncStorage.setItem(SUBMITTED, "1");
	} catch {
		/* the banner is a nicety; the checks are already in the logbook */
	}
}

/** Drop the one-shot banner flag without consuming it. Called on deliberate
 *  sign-out only: the flag announces "YOUR checks landed", and whoever signs
 *  in next on this phone may be somebody else. A restart or an expired
 *  session is still the same person mid-flow, so neither touches it - and
 *  the handoff marker is left alone entirely, being token-scoped. */
export async function clearChecksSubmitted(): Promise<void> {
	try {
		await AsyncStorage.removeItem(SUBMITTED);
	} catch {
		/* a banner that survives is a nicety shown to the wrong person once */
	}
}

/** True exactly once, right after returning from a submitted checks visit. */
export async function consumeChecksSubmitted(): Promise<boolean> {
	try {
		const hit = (await AsyncStorage.getItem(SUBMITTED)) === "1";
		if (hit) await AsyncStorage.removeItem(SUBMITTED);
		return hit;
	} catch {
		return false;
	}
}
