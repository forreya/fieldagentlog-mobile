// The in-progress visit: cached packet plus every answer so far, keyed by token.
//
// Writes here are best-effort by design, exactly as in the web app. A failed
// save must not interrupt an inspector mid-check: the answers are still in
// memory, the next keystroke tries again, and losing the cache costs a reload
// rather than the visit.

import { getDatabase } from "./database";
import type { VisitRecord } from "./types";

export async function saveVisit(record: VisitRecord): Promise<void> {
	try {
		const db = await getDatabase();
		await db.runAsync("INSERT OR REPLACE INTO visits (token, record, updated_at) VALUES (?, ?, ?)", record.token, JSON.stringify(record), Date.now());
	} catch {
		/* best-effort: a full or locked database must not break the visit */
	}
}

export async function loadVisit(token: string): Promise<VisitRecord | undefined> {
	try {
		const db = await getDatabase();
		const row = await db.getFirstAsync<{ record: string }>("SELECT record FROM visits WHERE token = ?", token);
		return row ? (JSON.parse(row.record) as VisitRecord) : undefined;
	} catch {
		// A corrupt row must not dead-end the app: treat it as no cache and let
		// the packet be fetched again.
		return undefined;
	}
}

/**
 * Every visit this device holds, newest first.
 *
 * The sync engine's source of truth for what is outstanding. It has to be the
 * database and not a set of tokens in memory: after a force-stop, memory holds
 * nothing, and an inspection queued in a basement would sit there unsent while
 * the app told its owner they could close it.
 */
export async function allVisits(): Promise<VisitRecord[]> {
	try {
		const db = await getDatabase();
		const rows = await db.getAllAsync<{ record: string }>("SELECT record FROM visits ORDER BY updated_at DESC");
		return rows.flatMap((row) => {
			try {
				return [JSON.parse(row.record) as VisitRecord];
			} catch {
				// One unreadable row must not hide every other queued visit.
				return [];
			}
		});
	} catch {
		return [];
	}
}

export async function deleteVisit(token: string): Promise<void> {
	try {
		const db = await getDatabase();
		await db.runAsync("DELETE FROM visits WHERE token = ?", token);
	} catch {
		/* a stale cached visit is harmless; it is replaced on next open */
	}
}
