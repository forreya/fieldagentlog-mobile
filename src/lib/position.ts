// One location fix, asked for only when it buys the user something.
//
// The rule this file exists to enforce: the app NEVER prompts for location on
// launch. An inspector opening a visit link has no reason to be asked where
// they are, and a permission dialog on first open is how people learn to say
// no. Ordering by distance is the only thing that wants a fix, and it asks at
// the moment they tap for it.
//
// Milestone E's check-in is a different matter - that records where someone
// was, needs high accuracy, and is worth its own prompt at its own moment.

import * as Location from "expo-location";

import type { LatLng } from "./geo";

/** Long enough for a cold GPS fix outdoors, short enough not to feel broken. */
const TIMEOUT_MS = 12_000;

export type PositionOutcome =
	| { status: "ok"; point: LatLng }
	| { status: "denied" }
	/** Services off at the OS level - a different fix from a refused app. */
	| { status: "unavailable" }
	| { status: "failed"; message: string };

/** True when a fix can be taken without showing anybody a dialog. */
export async function locationAlreadyGranted(): Promise<boolean> {
	try {
		const { granted } = await Location.getForegroundPermissionsAsync();
		return granted;
	} catch {
		return false;
	}
}

/**
 * A single coarse fix. Balanced accuracy on purpose: ordering a list by
 * distance does not need the metre-level fix that drains a battery, and a
 * rough position arrives far sooner.
 */
export async function capturePosition(): Promise<PositionOutcome> {
	try {
		if (!(await Location.hasServicesEnabledAsync())) return { status: "unavailable" };

		const { granted } = await Location.requestForegroundPermissionsAsync();
		if (!granted) return { status: "denied" };

		const position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), TIMEOUT_MS);
		return { status: "ok", point: { lat: position.coords.latitude, lng: position.coords.longitude } };
	} catch (err) {
		return { status: "failed", message: err instanceof Error ? err.message : "Couldn't get your location." };
	}
}

/** Indoors, a fix can simply never arrive; waiting forever is not an answer. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error("Location is taking too long. Try again outside.")), ms)),
	]);
}

/** Plain-English copy for each way a fix can fail. */
export function positionMessage(outcome: PositionOutcome): string | null {
	switch (outcome.status) {
		case "ok":
			return null;
		case "denied":
			return "Location is off for this app. Turn it on in Settings to sort by distance.";
		case "unavailable":
			return "Location services are switched off on this phone.";
		case "failed":
			return outcome.message;
	}
}
