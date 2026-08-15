// Finding a block on the home screen: free-text search, and ordering by how far
// each one is from where you are standing.
//
// DELIBERATELY NOT MIRRORED from the web app's src/lib/nearby.ts, though it is
// a close port. Mirroring it would mean a refactor in the other repo (its
// `locate` reaches into a localStorage-backed geocode cache), and unlike the
// due-date maths in src/shared, none of this is a compliance surface: two
// clients ordering a list slightly differently is a cosmetic difference, not a
// wrong answer about whether a fire door is overdue. Recorded as a deliberate
// divergence in shared-mirror.json.

import { haversineKm, type LatLng } from "./geo";

/** The least a thing needs to be searchable and locatable on a home screen. */
export interface Findable {
	id: string;
	name: string;
	address: string | null;
	/** Blocks have this directly; for sites it is read out of the address. */
	postcode?: string | null;
}

// UK postcode, tolerant of the missing space people type: SW1A1AA, sw1a 1aa.
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/** The postcode a thing is at - its own, or the one inside its address. */
export function postcodeOf(item: Findable): string | null {
	if (item.postcode?.trim()) return item.postcode.trim();
	const found = item.address?.match(POSTCODE_RE);
	return found ? `${found[1]} ${found[2]}` : null;
}

/**
 * Does this item match the query? Every whitespace-separated term must appear
 * somewhere in the name, address or postcode, so "elm se1" narrows rather than
 * widens. A postcode typed without its space still matches one stored with it.
 */
export function matches(item: Findable, query: string): boolean {
	const wanted = query.trim().toLowerCase();
	if (!wanted) return true;
	const hay = [item.name, item.address, postcodeOf(item)].filter(Boolean).join(" ").toLowerCase();
	const squashed = hay.replace(/\s+/g, "");
	return wanted.split(/\s+/).every((term) => hay.includes(term) || squashed.includes(term.replace(/\s+/g, "")));
}

/**
 * Distance from `from` to each located item, in km. Items that could not be
 * placed are simply missing - callers sort those last rather than guessing.
 */
export function distancesFrom(from: LatLng, located: Map<string, LatLng>): Map<string, number> {
	const out = new Map<string, number>();
	for (const [id, coord] of located) out.set(id, haversineKm(from, coord));
	return out;
}

/** Nearest first; anything without a distance keeps its original order, last. */
export function byDistance<T extends { id: string }>(items: T[], distances: Map<string, number>): T[] {
	const known = items.filter((item) => distances.has(item.id));
	const unknown = items.filter((item) => !distances.has(item.id));
	known.sort((a, z) => (distances.get(a.id) as number) - (distances.get(z.id) as number));
	return [...known, ...unknown];
}

/** "220 m" up close, "1.4 km" further out, "12 km" further still. */
export function formatDistance(km: number): string {
	if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m`;
	if (km < 10) return `${km.toFixed(1)} km`;
	return `${Math.round(km)} km`;
}
