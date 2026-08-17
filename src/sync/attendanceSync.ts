// Pushing one cleaner's attendance: the check-in, then the check-out.
//
// Ordering is the whole point, so this is one task per session rather than one
// per end. A check-out that reached the server before its check-in would be a
// 404 - the broker looks the session up by client_id, and there would be
// nothing to find.
//
// The shape mirrors visitSync deliberately. Both are "a thing that happened on
// site, held on the phone until the network agrees", and the two files reading
// alike is worth more than any cleverness that would make them differ.
//
// Everything here is replay-safe:
//   - check-in on an existing client_id returns the same session id
//   - check-out on an already-closed session returns the stored duration
// so a retry after a lost response costs one request and changes nothing.

import { deleteAttendance, saveAttendance } from "@/db/attendance";
import type { AttendanceSession } from "@/db/types";
import { checkIn, checkOut } from "@/api/cleaner";

import type { SyncSource, SyncTask } from "./engine";

/** True while either end is still owed to the server. */
export function attendanceHasWork(session: AttendanceSession): boolean {
	if (!session.synced_in) return true;
	return session.check_out !== null && !session.synced_out;
}

/**
 * Push one session as far as the network allows. Throws on the first failure so
 * the engine can count it and retry; whatever succeeded is already persisted.
 */
export async function pushAttendance(session: AttendanceSession): Promise<void> {
	let current = session;

	if (!current.synced_in) {
		const serverId = await checkIn(current.local_id, current.site_id, current.check_in);
		// Persisted before the check-out is attempted. If the signal dies in
		// between, the next pass must not repeat a check-in that landed - it
		// would be harmless (the server is idempotent) but it would also mean
		// the local row never learns the session id.
		current = { ...current, server_id: serverId, synced_in: true };
		await saveAttendance(current);
	}

	// Still on site. Nothing more is owed until they leave.
	if (!current.check_out) return;
	if (current.synced_out) return;

	await checkOut(current.local_id, current.check_out);
	current = { ...current, synced_out: true };
	await saveAttendance(current);

	// Both ends are on the server, which is now the record of what happened.
	// The local row exists to survive a dead signal, and that job is done.
	await deleteAttendance(current.local_id);
}

/** This session's task id, so a screen can pick its own result out of a pass. */
export function attendanceTaskId(localId: string): string {
	return `attendance:${localId}`;
}

/** The engine source. `sessions` supplies what the device currently holds. */
export function createAttendanceSource(sessions: () => Promise<AttendanceSession[]>): SyncSource {
	return {
		name: "attendance",
		async pending(): Promise<SyncTask[]> {
			const tasks: SyncTask[] = [];
			for (const session of await sessions()) {
				if (attendanceHasWork(session)) {
					tasks.push({ id: attendanceTaskId(session.local_id), run: () => pushAttendance(session) });
				}
			}
			return tasks;
		},
	};
}
