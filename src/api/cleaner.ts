// The cleaner's half of the broker.
//
// A cleaner has no database access at all, the same as an agent, but the
// scoping rule is different and worth stating: assignments belong to the
// cleaning COMPANY, not the person. Everyone at Example Cleaning Co sees the
// same sites. Nothing here filters by user, and adding such a filter would
// quietly diverge from how BalanceBuddy actually models the relationship.

import { callBroker } from "./broker";

export interface CleanerSite {
	id: string;
	name: string;
	/** Composed server-side from the structured address columns. */
	address: string | null;
	/** Fire checks this site's cleaners are responsible for and that are due
	 *  now. Not every check is a cleaner's job, and a check due next month is
	 *  not a duty yet, so this is smaller than the block's total. */
	duties_due: number;
}

export async function loadCleanerSites(): Promise<CleanerSite[]> {
	const res = await callBroker<{ sites?: CleanerSite[] }>("cleaner", { action: "my-sites" });
	return res.sites ?? [];
}

// ── Attendance ──────────────────────────────────────────────────────────────
//
// Both ends are keyed on `client_id`, which is our local_id, and both are
// replay-safe at the server: a repeated check-in returns the existing session
// id, and a repeated check-out returns the stored duration. That is what lets
// the queue retry blindly without a cleaner ever appearing twice on a site.
//
// The accuracy radius is not optional. The broker validates lat, lng, accuracy
// and `at` together and rejects the payload if any is missing or out of range,
// so a fix without an accuracy figure cannot be sent at all.

/** The wire shape of a geo stamp. `at` is ISO, not epoch ms. */
interface GeoBody {
	at: string;
	lat: number;
	lng: number;
	accuracy: number;
}

function geoBody(point: { at: number; lat: number; lng: number; accuracy: number }): GeoBody {
	return { at: new Date(point.at).toISOString(), lat: point.lat, lng: point.lng, accuracy: point.accuracy };
}

/** Start a visit. Returns the server's session id, new or existing. */
export async function checkIn(clientId: string, siteId: string, point: { at: number; lat: number; lng: number; accuracy: number }): Promise<string> {
	const res = await callBroker<{ session_id: string }>("cleaner", {
		action: "check-in",
		client_id: clientId,
		site_id: siteId,
		...geoBody(point),
	});
	return res.session_id;
}

/** End it. Returns the duration the server recorded, which is the one that
 *  counts - the phone's clock is not evidence. */
export async function checkOut(clientId: string, point: { at: number; lat: number; lng: number; accuracy: number }): Promise<number> {
	const res = await callBroker<{ duration_seconds?: number }>("cleaner", {
		action: "check-out",
		client_id: clientId,
		...geoBody(point),
	});
	return res.duration_seconds ?? 0;
}
