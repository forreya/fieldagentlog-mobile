// The error taxonomy for the token-gated visit endpoints. Pure: no fetch, no
// platform. Ported from the web app's src/lib/api.ts, which is where the
// user-facing wording comes from - it is field-tested, so it is copied verbatim
// rather than reworded.
//
// Three kinds, because the app does three different things with them:
//   dead_end - the link itself is finished. Show a terminal screen, never retry.
//   network  - we never got an answer. Queue it; retry when signal returns.
//   server   - the server answered badly. Retry, but slower.
//
// `retryable` is derived here rather than in the sync engine, so there is one
// definition of "worth trying again" instead of two that can disagree.

export type ApiErrorKind = "dead_end" | "network" | "server";

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

	/** Whether trying again could ever succeed. A dead link never can. */
	get retryable(): boolean {
		return this.kind !== "dead_end";
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
