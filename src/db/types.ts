// What the offline queues hold. These mirror the web app's src/lib/types.ts in
// meaning but not in shape, which is why that file is not byte-mirrored:
// the web keeps photo bytes as a Blob inside the record, and this app keeps
// them as a file on disk with only the path in the row. Ten full-resolution
// photos live comfortably on a filesystem and not at all in a database row.

import type { LocalFile, Severity, Verdict } from "@/api/contract";

/** One GPS reading, taken at a check-in, check-out, or report. */
export interface GeoPoint {
	lat: number;
	lng: number;
	/** Device-reported accuracy radius in metres; smaller is better. */
	accuracy: number;
	/** When the fix was taken (epoch ms). */
	at: number;
}

/** The inspector's answer to one check, as held mid-visit. */
export interface CheckResult {
	verdict: Verdict | null;
	note: string;
	severity: Severity | null;
	/** Server ref, once the photo has uploaded. */
	photo_ref: string | null;
	/** Local queue id while the photo is still only on this device. */
	photo_local_id: string | null;
}

export interface FraUpdate {
	status: "outstanding" | "resolved";
	note: string;
}

/** Everything for one visit, keyed by its token. */
export interface VisitRecord {
	token: string;
	/** The packet exactly as the server sent it (rendered verbatim). */
	packet: unknown;
	inspector: { name: string; email: string };
	results: Record<string, CheckResult>;
	fra_updates: Record<string, FraUpdate>;
	/** Stamped when the visit is first opened; the true start time for the logbook. */
	started_at: number;
	updated_at: number;
	/** Set when the inspector hits submit. Persisted rather than held in memory
	 *  so a submit queued underground still goes after the app is killed. */
	submit_requested_at?: number;
	/** Set when a submit failed in a way retrying cannot fix (the link expired
	 *  or was revoked mid-visit). Persisted so the app can say so after a
	 *  restart, and so the queue stops offering a task that can only fail. */
	submit_error?: { message: string; at: number };
	/** Present once submitted - the visit is then locked. */
	submitted: { visit_id: string; logbook_pdf_url: string; completed_at: string } | null;
	/** True when a cleaner launched this visit from their own app. */
	cleaner_handoff?: boolean;
}

/** A photo taken on site, queued until it has a server ref. */
export interface PendingPhoto {
	local_id: string;
	token: string;
	check_id: string;
	/** The file on disk. Bytes never enter the database or JS memory. */
	file: LocalFile;
	ref: string | null;
	created_at: number;
}

/** One cleaning visit: a geo-stamped arrival, and a departure once they leave. */
export interface AttendanceSession {
	/** Idempotency key, sent as `client_id`; the server upserts on it. */
	local_id: string;
	site_id: string;
	site_name: string;
	cleaner_email: string | null;
	check_in: GeoPoint;
	/** Null while the cleaner is still on site. */
	check_out: GeoPoint | null;
	/** Server id once the check-in has been accepted. */
	server_id: string | null;
	synced_in: boolean;
	synced_out: boolean;
	/** Set when a push failed in a way retrying cannot fix - the block was
	 *  deleted out from under an open session, or the cleaner was unassigned
	 *  mid-shift. Persisted so the queue stops offering a task that can only
	 *  fail, exactly as `submit_error` does for a visit. */
	sync_error?: { message: string; at: number };
}

/** Coarse routing hint chosen on the phone. Mirrors the server's CHECK constraint. */
export type ReportCategory = "cleaning" | "repairs" | "safety" | "security" | "grounds" | "waste" | "antisocial" | "other";

/** Order and labels for the picker; the first is the default. */
export const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
	{ value: "repairs", label: "Repair" },
	{ value: "cleaning", label: "Cleaning" },
	{ value: "waste", label: "Waste" },
	{ value: "safety", label: "Safety" },
	{ value: "security", label: "Security" },
	{ value: "grounds", label: "Grounds" },
	{ value: "antisocial", label: "Antisocial" },
	{ value: "other", label: "Other" },
];

/** A photo the server has accepted - the shape stored on the report row. */
export interface ReportPhotoRef {
	path: string;
	file_name: string;
	content_type: string;
}

/** One photo on a report, with its file kept until the upload lands. */
export interface ReportPhoto {
	local_id: string;
	file: LocalFile;
	ref: ReportPhotoRef | null;
}

/** A report captured on site, queued until every part of it has synced. */
export interface PendingReport {
	/** Idempotency key, sent as `client_id`; UNIQUE server-side. */
	local_id: string;
	site_id: string;
	site_name: string;
	category: ReportCategory;
	note: string;
	photos: ReportPhoto[];
	/** When the reporter raised it (epoch ms) - not when it synced. */
	at: number;
	/** Where they were, when the device would say. */
	point: GeoPoint | null;
	/** The cleaning visit this was raised during, when there was one. */
	attendance_client_id: string | null;
	/** Set when a push failed in a way retrying cannot fix - the reporter was
	 *  unassigned from the block, or the block was deleted. Persisted so the
	 *  queue stops offering a task that can only fail. */
	sync_error?: { message: string; at: number };
}

/** How many photos on a report still hold bytes that have not uploaded. */
export function unsyncedPhotoCount(report: PendingReport): number {
	return report.photos.filter((p) => p.ref === null).length;
}

/** Whole seconds the cleaner has been (or was) on site. */
export function sessionDurationSeconds(session: AttendanceSession, nowMs: number): number {
	const end = session.check_out?.at ?? nowMs;
	return Math.max(0, Math.round((end - session.check_in.at) / 1000));
}
