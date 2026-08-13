// Turning the working record into the exact body /visit-submit expects.
//
// The UI and the database speak different vocabularies here, and the mapping is
// deliberate rather than accidental: the wizard says "intolerable" because that
// is what a fire-risk severity is called on site, while the column's CHECK
// constraint accepts "critical". Likewise the FRA control offers
// outstanding/resolved, and the server stores open/in_progress/done. Translate
// once, at the boundary, exactly as the web app does in src/lib/sync.ts.

import type { Severity, SubmitBody, SubmitResult, WireFraStatus, WireSeverity } from "@/api/contract";
import type { FraUpdate, VisitRecord } from "@/db/types";

const SEVERITY_WIRE: Record<Severity, WireSeverity> = {
	low: "low",
	medium: "medium",
	high: "high",
	intolerable: "critical",
};

const FRA_STATUS_WIRE: Record<FraUpdate["status"], WireFraStatus> = {
	outstanding: "open",
	resolved: "done",
};

export function buildSubmitBody(record: VisitRecord, now: Date = new Date()): SubmitBody {
	const results: SubmitResult[] = [];

	for (const [checkId, answer] of Object.entries(record.results)) {
		// An unanswered check is simply not reported; the server leaves it due.
		if (!answer.verdict) continue;

		const entry: SubmitResult = { check_id: checkId, status: answer.verdict };
		if (answer.note.trim()) entry.note = answer.note.trim();
		// Severity belongs only to a failure - a passed check with a leftover
		// severity would be nonsense in the logbook.
		if (answer.verdict === "fail" && answer.severity) entry.severity = SEVERITY_WIRE[answer.severity];
		if (answer.photo_ref) entry.photo_ref = answer.photo_ref;
		results.push(entry);
	}

	const fra_action_updates = Object.entries(record.fra_updates).map(([id, update]) => {
		const status = FRA_STATUS_WIRE[update.status];
		return update.note.trim() ? { id, status, note: update.note.trim() } : { id, status };
	});

	return {
		inspector: record.inspector,
		// started_at is stamped when the visit is first opened and survives
		// reloads, so it is the inspector's true start time for the logbook.
		started_at: new Date(record.started_at).toISOString(),
		completed_at: now.toISOString(),
		results,
		fra_action_updates,
	};
}
