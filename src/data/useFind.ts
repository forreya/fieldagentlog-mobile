// Drives the blocks list: the search box, and the "Nearest" ordering.
//
// Location is asked for only when it buys something. If permission has already
// been given, the list orders itself on arrival with no prompt; otherwise
// nothing happens until Nearest is tapped, so opening the app never throws up
// a dialog nobody asked for. A fix that fails - no signal, indoors, refused -
// leaves the list in its own order with the reason shown, because a list in the
// wrong order still beats no list.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LatLng } from "@/lib/geo";
import { geocodePostcodes, normalizePostcode } from "@/lib/geocode";
import { byDistance, distancesFrom, matches, postcodeOf, type Findable } from "@/lib/nearby";
import { capturePosition, locationAlreadyGranted, positionMessage } from "@/lib/position";

export type NearStatus = "off" | "locating" | "on" | "error";

export interface FindView<T> {
	query: string;
	setQuery: (query: string) => void;
	/** What to render: filtered, and ordered by distance when Nearest is on. */
	results: T[];
	/** Km from the user, for the items that could be placed. */
	distances: Map<string, number>;
	near: NearStatus;
	toggleNear: () => void;
	error: string | null;
}

/** Geocode a set of items, keyed by item id. Items with no postcode are absent. */
async function locate(items: Findable[]): Promise<Map<string, LatLng>> {
	const postcodeById = new Map<string, string>();
	for (const item of items) {
		const postcode = postcodeOf(item);
		if (postcode) postcodeById.set(item.id, postcode);
	}
	const coords = await geocodePostcodes([...postcodeById.values()]);

	const out = new Map<string, LatLng>();
	for (const [id, postcode] of postcodeById) {
		const coord = coords.get(normalizePostcode(postcode));
		if (coord) out.set(id, coord);
	}
	return out;
}

export function useFind<T extends Findable>(items: T[]): FindView<T> {
	const [query, setQuery] = useState("");
	const [near, setNear] = useState<NearStatus>("off");
	const [here, setHere] = useState<LatLng | null>(null);
	const [located, setLocated] = useState<Map<string, LatLng>>(new Map());
	const [error, setError] = useState<string | null>(null);

	// Keyed on WHICH items, not the array identity: a dashboard refresh that
	// returns the same blocks must not re-run the lookup.
	const itemsKey = items
		.map((item) => item.id)
		.sort()
		.join(",");
	const geocodedKey = useRef("");

	const enable = useCallback(async () => {
		setNear("locating");
		setError(null);

		const [outcome] = await Promise.all([
			capturePosition(),
			(async () => {
				if (geocodedKey.current === itemsKey) return;
				geocodedKey.current = itemsKey;
				setLocated(await locate(items));
			})(),
		]);

		if (outcome.status !== "ok") {
			setHere(null);
			setNear("error");
			setError(positionMessage(outcome));
			return;
		}
		setHere(outcome.point);
		setNear("on");
	}, [itemsKey, items]);

	// Order by distance from the start, but only when it costs no prompt.
	const autoTried = useRef(false);
	useEffect(() => {
		if (autoTried.current || items.length === 0) return;
		autoTried.current = true;
		void locationAlreadyGranted().then((granted) => {
			if (granted) void enable();
		});
	}, [items.length, enable]);

	const toggleNear = useCallback(() => {
		// Anything other than off turns off, including error. Retrying a
		// permission the OS has refused just fails again, and leaving the message
		// on screen with no way to dismiss it is worse than useless - turning it
		// off and on again is how someone retries after changing Settings.
		if (near !== "off") {
			setNear("off");
			setError(null);
			return;
		}
		void enable();
	}, [near, enable]);

	const distances = useMemo(() => (here ? distancesFrom(here, located) : new Map<string, number>()), [here, located]);

	const results = useMemo(() => {
		const found = items.filter((item) => matches(item, query));
		return near === "on" && distances.size > 0 ? byDistance(found, distances) : found;
	}, [items, query, near, distances]);

	return { query, setQuery, results, distances, near, toggleNear, error };
}
