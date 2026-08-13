// Cleaner attendance: check-in and check-out, each geo-stamped, held here until
// both ends have reached the server.
//
// Best-effort writes, like visits: the on-site timer is a convenience and a
// failed write must not stop someone starting work. The record that matters is
// reconstructed from the server once it syncs.

import { getDatabase } from "./database";
import type { AttendanceSession } from "./types";

export async function saveAttendance(session: AttendanceSession): Promise<void> {
	try {
		const db = await getDatabase();
		await db.runAsync(
			"INSERT OR REPLACE INTO attendance (local_id, record, updated_at) VALUES (?, ?, ?)",
			session.local_id,
			JSON.stringify(session),
			Date.now(),
		);
	} catch {
		/* best-effort: must not lose the on-site timer's own start */
	}
}

/** Every locally-held session: the active visit plus any not yet fully synced. */
export async function allAttendance(): Promise<AttendanceSession[]> {
	try {
		const db = await getDatabase();
		const rows = await db.getAllAsync<{ record: string }>("SELECT record FROM attendance ORDER BY updated_at ASC");
		return rows.map((r) => JSON.parse(r.record) as AttendanceSession);
	} catch {
		return [];
	}
}

export async function deleteAttendance(localId: string): Promise<void> {
	try {
		const db = await getDatabase();
		await db.runAsync("DELETE FROM attendance WHERE local_id = ?", localId);
	} catch {
		/* the server already has both ends; a stale local row only costs one
		   more idempotent replay on the next pass */
	}
}
