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

import type { GeoPoint } from "@/db/types";

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
function withTimeout<T>(promise: Promise<T>, ms: number, error?: Error): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_resolve, reject) => setTimeout(() => reject(error ?? new Error("Location is taking too long. Try again outside.")), ms)),
	]);
}

// ── The check-in fix ────────────────────────────────────────────────────────
//
// A different job from sorting by distance, and deliberately a different
// function rather than a flag on the one above.
//
//   - High accuracy, because this is evidence of where somebody was. Sorting a
//     list tolerates a few hundred metres; an attendance record does not.
//   - It returns the accuracy radius, which the broker requires and rejects the
//     whole payload without.
//   - No cached fix. A check-in stamped with a position from the last site is
//     worse than no check-in at all.
//
// Copy ported from the web's `lib/geo.ts`, changed only where it named the
// browser: a cleaner on a phone has Settings, not browser settings.

/** Long enough for a cold high-accuracy fix, short enough not to feel broken. */
const FIX_TIMEOUT_MS = 15_000;

export type FixOutcome =
	{ status: "ok"; fix: GeoPoint } | { status: "denied" } | { status: "unavailable" } | { status: "timeout" } | { status: "failed"; message: string };

export async function captureFix(): Promise<FixOutcome> {
	try {
		if (!(await Location.hasServicesEnabledAsync())) return { status: "unavailable" };

		const { granted } = await Location.requestForegroundPermissionsAsync();
		if (!granted) return { status: "denied" };

		const position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), FIX_TIMEOUT_MS, new TimeoutError());
		return {
			status: "ok",
			fix: {
				lat: position.coords.latitude,
				lng: position.coords.longitude,
				// Android can report a null accuracy. The broker rejects a payload
				// without a finite one, so an honest large radius beats losing the
				// check-in over a missing field.
				accuracy: Number.isFinite(position.coords.accuracy) ? (position.coords.accuracy as number) : 9999,
				at: position.timestamp || Date.now(),
			},
		};
	} catch (err) {
		if (err instanceof TimeoutError) return { status: "timeout" };
		return { status: "failed", message: err instanceof Error ? err.message : "Couldn't get your location." };
	}
}

class TimeoutError extends Error {}

/** What to tell a cleaner standing at a door when the fix does not come. */
export function fixMessage(outcome: FixOutcome): string | null {
	switch (outcome.status) {
		case "ok":
			return null;
		case "denied":
			return "Location is blocked. Turn on location for this app in Settings, then try again.";
		case "unavailable":
			return "Location services are switched off on this phone. Turn them on, then try again.";
		case "timeout":
			return "Getting your location took too long - try again.";
		case "failed":
			return outcome.message;
	}
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

// ── The report fix ──────────────────────────────────────────────────────────

/** Short: a bin store rarely has a fix, and nobody should wait in one. */
const REPORT_FIX_TIMEOUT_MS = 8_000;

/**
 * A position for a site report, if one happens to be available.
 *
 * Best-effort in the strongest sense: this never throws, never blocks for long,
 * and returns null rather than delaying the report. Location corroborates that
 * the reporter was where they say, which is useful - but a report is worth far
 * more than its geotag, and the person has usually walked away from the problem
 * by the time they are typing.
 *
 * Low accuracy on purpose. "Which building" is the question; metre-level
 * precision would cost battery and time to answer something nobody asked.
 */
export async function captureReportFix(): Promise<GeoPoint | null> {
	try {
		if (!(await Location.hasServicesEnabledAsync())) return null;
		const { granted } = await Location.requestForegroundPermissionsAsync();
		if (!granted) return null;

		const position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), REPORT_FIX_TIMEOUT_MS);
		return {
			lat: position.coords.latitude,
			lng: position.coords.longitude,
			accuracy: Number.isFinite(position.coords.accuracy) ? (position.coords.accuracy as number) : 9999,
			at: position.timestamp || Date.now(),
		};
	} catch {
		// Denied, switched off, indoors, or simply slow. The report goes without.
		return null;
	}
}
