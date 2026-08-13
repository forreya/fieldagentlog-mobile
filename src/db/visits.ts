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

export async function deleteVisit(token: string): Promise<void> {
	try {
		const db = await getDatabase();
		await db.runAsync("DELETE FROM visits WHERE token = ?", token);
	} catch {
		/* a stale cached visit is harmless; it is replaced on next open */
	}
}
