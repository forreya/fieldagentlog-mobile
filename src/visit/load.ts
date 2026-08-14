// What the app should show when a visit link is opened.
//
// Pure on purpose: this is the decision an inspector meets first, standing in a
// doorway with one bar of signal, and every branch of it needs to be provable
// without a network or a device.
//
// The ordering matters more than it looks:
//   1. An already-submitted visit is shown from cache without a request. The
//      visit is locked, so asking the server changes nothing and would only
//      fail underground.
//   2. A dead link beats a cached packet. Once a link is expired, revoked or
//      spent, the honest answer is the dead end - not an editable wizard built
//      from a stale copy.
//   3. Otherwise a cached packet beats a failed request, which is what lets
//      someone carry on working after the signal goes.

import type { VisitPacket } from "@/api/contract";
import { ApiError, type DeadEndReason } from "@/api/errors";
import type { VisitRecord } from "@/db/types";

import { buildRecord } from "./record";

/** A record known to be submitted, so the result is no longer nullable. */
export type SubmittedVisit = VisitRecord & { submitted: NonNullable<VisitRecord["submitted"]> };

export type VisitLoad =
	| { status: "loading" }
	/** The wizard can run. `fromCache` means the packet may be stale. */
	| { status: "ready"; record: VisitRecord; fromCache: boolean }
	/** Already submitted: show the success screen, locked. */
	| { status: "submitted"; record: SubmittedVisit }
	/** The link itself is finished. Terminal - no retry offered. */
	| { status: "dead_end"; reason: DeadEndReason }
	/** No signal and nothing saved here yet. Retryable. */
	| { status: "offline_no_cache" }
	/** Something else went wrong. Retryable. */
	| { status: "error" };

export type FetchOutcome = { ok: true; packet: VisitPacket } | { ok: false; error: unknown };

/** The cached copy if it is already submitted, else null.
 *  Returns the record rather than a boolean: a type predicate here would claim
 *  the false branch means "no cache", when it usually means "cache, unfinished". */
export function lockedRecord(cached?: VisitRecord): SubmittedVisit | null {
	// Rebuilt rather than cast: this is the one place that proves the field is
	// there, so proving it to the compiler too costs one shallow copy per load.
	return cached?.submitted ? { ...cached, submitted: cached.submitted } : null;
}

/** Decide what to show, given whatever this device holds and how the fetch went. */
export function decideLoad(token: string, cached: VisitRecord | undefined, outcome: FetchOutcome, now: number = Date.now()): VisitLoad {
	const locked = lockedRecord(cached);
	if (locked) return { status: "submitted", record: locked };

	if (outcome.ok) {
		return { status: "ready", record: buildRecord(token, outcome.packet, cached, now), fromCache: false };
	}

	const { error } = outcome;

	// A finished link is finished, even if we still hold a usable packet.
	if (error instanceof ApiError && error.kind === "dead_end") {
		return { status: "dead_end", reason: error.reason ?? "unknown" };
	}

	// Couldn't reach the server, but this device already has the visit: carry on.
	if (cached?.packet) {
		return { status: "ready", record: buildRecord(token, cached.packet as VisitPacket, cached, now), fromCache: true };
	}

	if (error instanceof ApiError && error.kind === "network") return { status: "offline_no_cache" };
	return { status: "error" };
}
