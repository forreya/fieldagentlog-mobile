// The wire contract for the token-gated visit endpoints, as BalanceBuddy's
// Edge Functions define them (supabase/functions/visit-{packet,photo,submit}).
//
// These shapes are identical to the web app's src/lib/types.ts, but that file
// also carries browser storage types (Blob-bearing queues), so it cannot be
// mirrored wholesale - see shared-mirror.json. Change nothing here without
// changing it there.
//
// FieldAgentLog owns no catalogue, due-date or scheduling logic. The server
// computes `status` and `status_label`; we render them verbatim.

export type Verdict = "pass" | "fail" | "na";

/** UI vocabulary. Mapped to the wire values at the submit boundary. */
export type Severity = "low" | "medium" | "high" | "intolerable";
export type FraActionStatus = "outstanding" | "resolved";

/** What the database's CHECK constraints actually accept. */
export type WireSeverity = "low" | "medium" | "high" | "critical";
export type WireFraStatus = "open" | "in_progress" | "done";

export interface VisitInfo {
	id: string;
	status: string;
	block_name: string;
	block_address: string;
	due_date: string;
}

export interface PacketCheck {
	id: string;
	code: string;
	title: string;
	todo: string;
	freq_label: string;
	standard_ref: string;
	responsibility: string;
	/** Server-computed due state, e.g. "overdue". */
	status: string;
	/** Server-computed human label, e.g. "Overdue by 12 days". Rendered as-is. */
	status_label: string;
}

export interface FraAction {
	id: string;
	title: string;
	detail: string;
	severity: string;
}

export interface VisitPacket {
	visit: VisitInfo;
	profile: unknown[];
	inspector: { name?: string; email?: string };
	checks: PacketCheck[];
	fra_actions: FraAction[];
}

export interface SubmitResult {
	check_id: string;
	status: Verdict;
	note?: string;
	severity?: WireSeverity;
	photo_ref?: string;
}

export interface SubmitBody {
	inspector: { name: string; email: string };
	/** When the visit was opened - the inspector's true start time for the logbook. */
	started_at: string;
	completed_at: string;
	results: SubmitResult[];
	fra_action_updates: { id: string; status: WireFraStatus; note?: string }[];
}

export interface SubmitResponse {
	ok: true;
	visit_id: string;
	logbook_pdf_url: string;
}

export interface PhotoRef {
	ref: string;
}

/** A photo to upload, as the OS hands it to us: a local file, not bytes in memory. */
export interface LocalFile {
	uri: string;
	name: string;
	type: string;
}
