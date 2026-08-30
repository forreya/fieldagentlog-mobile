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

// ── Duties ──────────────────────────────────────────────────────────────────
//
// Not every fire check at a site is a cleaner's job. The broker filters out the
// contractor-owned ones and the ones that are not due yet, so this list is
// already "what you should do while you are here" rather than the block's whole
// schedule.

// What the broker's dueStatus actually sends ("ok" is filtered out before the
// wire). Not the dashboard's DueLevel - that one has "soon", this one "due".
export type DutyStatus = "overdue" | "due";

export interface CleanerDuty {
	id: string;
	title: string;
	/** "Weekly", "Monthly" - the cadence, in the words the catalogue uses. */
	freq_label: string;
	status: DutyStatus;
	status_label: string;
}

export async function loadSiteDuties(siteId: string): Promise<CleanerDuty[]> {
	const res = await callBroker<{ duties?: CleanerDuty[] }>("cleaner", { action: "site-duties", site_id: siteId });
	return res.duties ?? [];
}

/**
 * Mint a visit for the checks due at this site and hand the token back.
 *
 * `attendanceClientId` links the fire visit to the cleaning visit it happened
 * during. It is best-effort by design: the broker looks the session up by
 * client_id, so a check-in still sitting in the queue cannot be linked yet. The
 * checks are worth more than the link, so an unlinked visit is the right
 * trade - not a refusal.
 */
export async function startFireChecks(siteId: string, attendanceClientId?: string): Promise<string> {
	const res = await callBroker<{ token: string }>("cleaner", {
		action: "start-fire-checks",
		site_id: siteId,
		attendance_client_id: attendanceClientId,
	});
	return res.token;
}
