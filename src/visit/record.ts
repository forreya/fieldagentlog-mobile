// Turning a packet into the working record the wizard edits.
//
// The one rule with teeth here: FieldAgent runs the in-house checks only.
// Anything the catalogue marks as a contractor's responsibility is dropped
// before the inspector ever sees it, so it can never be shown, counted or
// submitted. Those jobs belong to a specialist and stay in BalanceBuddy.

import type { PacketCheck, VisitPacket } from "@/api/contract";
import type { CheckResult, VisitRecord } from "@/db/types";
import { isSpecialistResponsibility } from "@/shared/fireData";

function emptyResult(): CheckResult {
	return { verdict: null, note: "", severity: null, photo_ref: null, photo_local_id: null };
}

/** The checks this app is allowed to run. */
export function inHouseChecks(packet: VisitPacket): PacketCheck[] {
	return (packet.checks ?? []).filter((check) => !isSpecialistResponsibility(check.responsibility));
}

/**
 * Build the record for a visit, carrying over anything already answered.
 *
 * `cached` is whatever this device already holds for the token. Answers,
 * inspector details and the original start time all survive a reload, a
 * re-fetch, and the app being killed - which is the whole point of persisting
 * them in the first place.
 */
export function buildRecord(token: string, packet: VisitPacket, cached?: VisitRecord, now: number = Date.now()): VisitRecord {
	const checks = inHouseChecks(packet);
	const results: Record<string, CheckResult> = {};
	for (const check of checks) {
		results[check.id] = cached?.results[check.id] ?? emptyResult();
	}

	return {
		token,
		packet: { ...packet, checks },
		inspector: cached?.inspector ?? { name: packet.inspector?.name ?? "", email: packet.inspector?.email ?? "" },
		results,
		fra_updates: cached?.fra_updates ?? {},
		// The true start time for the logbook: stamped once, never reset.
		started_at: cached?.started_at ?? now,
		updated_at: now,
		submit_requested_at: cached?.submit_requested_at,
		submitted: cached?.submitted ?? null,
		cleaner_handoff: cached?.cleaner_handoff,
	};
}
