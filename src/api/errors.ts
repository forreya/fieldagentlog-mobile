// One error taxonomy for both front doors: the keyless visit endpoints and the
// session-JWT brokers. Pure - no fetch, no platform.
//
// The visit wording is ported verbatim from the web app's src/lib/api.ts; it is
// field-tested copy and rewording it would only make it worse.
//
// The kinds exist because the app does something different with each: show a
// terminal screen, send the user to sign in, say "not yours", report a bug,
// queue for later, or back off. `retryable` is derived here so the sync engine
// and the screens cannot end up with two definitions of "worth trying again".

export type ApiErrorKind =
	/** The visit link itself is finished. Terminal screen; never retry. */
	| "dead_end"
	/** The session is gone or invalid. Sign in again; never retry as-is. */
	| "auth"
	/** Signed in, but not allowed this block/site. Not a retry, not a re-login. */
	| "forbidden"
	/** We asked for something the server refused to accept. A bug or bad input. */
	| "invalid"
	/** No answer at all: no signal, DNS, or our own timeout. Queue and retry. */
	| "network"
	/** The server answered badly. Retry, more slowly. */
	| "server";

/** Why a link is finished, used to pick the right dead-end copy. */
export type DeadEndReason = "expired" | "used" | "revoked" | "invalid" | "unknown";

export class ApiError extends Error {
	readonly kind: ApiErrorKind;
	readonly status?: number;
	readonly reason?: DeadEndReason;
	/** The request was aborted by our own timeout, rather than failing outright. */
	readonly timedOut: boolean;

	constructor(kind: ApiErrorKind, message: string, opts: { status?: number; reason?: DeadEndReason; timedOut?: boolean } = {}) {
		super(message);
		this.name = "ApiError";
		this.kind = kind;
		this.status = opts.status;
		this.reason = opts.reason;
		this.timedOut = opts.timedOut ?? false;
		// Downlevelled class extends break `instanceof` without this. Cheap
		// insurance: every call site branches on it.
		Object.setPrototypeOf(this, ApiError.prototype);
	}

	/** Whether trying the same request again could ever succeed. Only a missing
	 *  answer or a struggling server can; a dead link, a bad session, a refusal
	 *  or a malformed request will fail identically forever, and retrying them
	 *  is how a sync queue jams behind one poisoned item. */
	get retryable(): boolean {
		return this.kind === "network" || this.kind === "server";
	}
}

/** Visit statuses that mean the visit is closed, whatever the HTTP status said. */
const TERMINAL_VISIT_STATUSES = new Set([
	"submitted",
	"complete",
	"completed",
	"revoked",
	"expired",
	"cancelled",
	"canceled",
	"used",
	"closed",
	"done",
	"locked",
]);

export function isTerminalVisitStatus(status: string): boolean {
	return TERMINAL_VISIT_STATUSES.has(status.trim().toLowerCase());
}

export function deadEndReasonFromStatus(status: number): DeadEndReason {
	if (status === 409) return "used";
	if (status === 410) return "expired";
	if (status === 401 || status === 403) return "revoked";
	if (status === 404) return "invalid";
	return "unknown";
}

/** The packet can report a closed visit in a 200 body; map that wording too. */
export function deadEndReasonFromVisitStatus(status: string): DeadEndReason {
	const s = status.toLowerCase();
	if (s.includes("submit") || s.includes("used") || s.includes("complete") || s.includes("done")) return "used";
	if (s.includes("expire")) return "expired";
	if (s.includes("revoke") || s.includes("cancel")) return "revoked";
	return "unknown";
}

/** Turn a non-OK HTTP status into the right kind of ApiError. */
export function classifyStatus(status: number): ApiError {
	if (status >= 500) {
		return new ApiError("server", "The server had a problem. Try again in a moment.", { status });
	}
	if (status === 408 || status === 429) {
		return new ApiError("network", "The server is busy. Try again in a moment.", { status });
	}
	// Any other 4xx on a token-gated endpoint means the link itself is no good.
	return new ApiError("dead_end", "This link can't be used.", { status, reason: deadEndReasonFromStatus(status) });
}

export function offlineError(): ApiError {
	return new ApiError("network", "We couldn't reach the server. Check your signal and try again.");
}

export function timeoutError(): ApiError {
	return new ApiError("network", "That took too long. Check your signal and try again.", { timedOut: true });
}

// ── Broker endpoints (session-JWT: field-agent, cleaner, site-report) ────────
// Different failure vocabulary from the visit endpoints: there is no "dead
// link" here, but there is "your session has gone" and "that block is not
// yours", and the app must react to those very differently.

/**
 * Pull a human message out of a broker error body. Two shapes reach us, which
 * is only visible when calling the functions directly rather than through
 * supabase-js:
 *   the Supabase gateway  -> { code, message }   (bad or missing JWT)
 *   the function itself   -> { error }           (its own refusal)
 * Verified against production, 2026-08-13.
 */
export function brokerMessage(body: unknown): string | null {
	if (!body || typeof body !== "object") return null;
	const b = body as { error?: unknown; message?: unknown };
	return usable(b.error) ?? usable(b.message);
}

/**
 * A server-supplied message, or null if it is not worth showing.
 *
 * Seen in the wild: a function's generic catch stringifies a thrown query error
 * and sends `{"error":"[object Object]"}`. Rendering that verbatim is worse
 * than our own generic line - it tells the reader nothing and looks broken.
 */
function usable(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const text = value.trim();
	if (!text || text === "[object Object]" || text === "undefined" || text === "null") return null;
	return text;
}

/** Map a broker HTTP status to an error, preferring the server's own wording. */
export function classifyBrokerStatus(status: number, body?: unknown): ApiError {
	const said = brokerMessage(body);
	if (status === 401) {
		return new ApiError("auth", said ?? "Your session has expired. Sign in again.", { status });
	}
	if (status === 403) {
		return new ApiError("forbidden", said ?? "You don't have access to that.", { status });
	}
	if (status === 408 || status === 429) {
		return new ApiError("network", said ?? "The server is busy. Try again in a moment.", { status });
	}
	if (status >= 500) {
		return new ApiError("server", said ?? "The server had a problem. Try again in a moment.", { status });
	}
	return new ApiError("invalid", said ?? "That request couldn't be completed.", { status });
}

/**
 * True when nothing will ever make this request succeed, so a queue should stop
 * offering it rather than retry for the life of the install.
 *
 * `auth` is deliberately NOT in this list, and it is the whole point of having
 * a separate predicate from `retryable`. A session that has expired is not
 * retryable *as-is* - but the person signs back in and the very same request
 * goes through. Recording it as permanent throws away a queued visit, shift or
 * report that was moments from sending. Found on device: two reports queued
 * while the session was invalid came back marked "You're not signed in." and
 * were never offered again.
 *
 * The three that really are unfixable:
 *   dead_end  the link is spent; there is no version of this that works
 *   forbidden the caller is not allowed this block, and signing in again
 *             changes nothing about that
 *   invalid   the server refused the payload; the same bytes will be refused
 *             again
 */
export function unfixable(error: unknown): error is ApiError {
	if (!(error instanceof ApiError)) return false;
	return error.kind === "dead_end" || error.kind === "forbidden" || error.kind === "invalid";
}
