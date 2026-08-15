// Turning UK postcodes into coordinates, via postcodes.io (free, no key).
//
// Results are cached because the same handful of blocks is looked up every time
// the list is ordered, and a field agent's data is not free. Confirmed misses
// are cached too: a postcode postcodes.io cannot resolve today will not resolve
// tomorrow either, and re-asking on every launch is a request nobody benefits
// from. A network failure is NOT cached, so it retries.
//
// Never blocks anything: if this fails the list simply keeps its own order.

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { LatLng } from "./geo";

const CACHE_KEY = "fa.geocode.v1";
/** postcodes.io's bulk endpoint takes 100 per request. */
const CHUNK = 100;

type Cache = Record<string, LatLng | null>;

async function loadCache(): Promise<Cache> {
	try {
		return JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? "{}") as Cache;
	} catch {
		return {};
	}
}

async function saveCache(cache: Cache): Promise<void> {
	try {
		await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
	} catch {
		/* best effort - a missed cache costs a lookup, never a screen */
	}
}

/** Canonical form, so the same postcode hits the cache whatever the spacing. */
export function normalizePostcode(postcode: string): string {
	return postcode.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Geocode the given postcodes, keyed by the NORMALISED postcode. A value of
 * null means "asked, and it does not resolve"; an absent key means "not known
 * yet", which callers treat as location unknown.
 */
export async function geocodePostcodes(postcodes: string[]): Promise<Map<string, LatLng | null>> {
	const cache = await loadCache();
	const out = new Map<string, LatLng | null>();
	const need: string[] = [];
	const seen = new Set<string>();

	for (const raw of postcodes) {
		const postcode = normalizePostcode(raw);
		if (!postcode || seen.has(postcode)) continue;
		seen.add(postcode);
		if (postcode in cache) out.set(postcode, cache[postcode]);
		else need.push(postcode);
	}

	for (let i = 0; i < need.length; i += CHUNK) {
		const chunk = need.slice(i, i + CHUNK);
		try {
			const res = await fetch("https://api.postcodes.io/postcodes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ postcodes: chunk }),
			});
			if (!res.ok) throw new Error(`postcodes.io ${res.status}`);
			const json = (await res.json()) as { result?: { query: string; result: { latitude: number; longitude: number } | null }[] };
			for (const item of json.result ?? []) {
				const key = normalizePostcode(item.query ?? "");
				const found = item.result;
				const coord = found && typeof found.latitude === "number" ? { lat: found.latitude, lng: found.longitude } : null;
				cache[key] = coord;
				out.set(key, coord);
			}
		} catch {
			// Not cached: a network failure should be retried, unlike a confirmed
			// miss. Absent from `out` means the caller treats it as unknown.
		}
	}

	await saveCache(cache);
	return out;
}
