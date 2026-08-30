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

import { unfixable } from "@/api/errors";
import { allAttendance, deleteAttendance, saveAttendance } from "@/db/attendance";
import type { AttendanceSession } from "@/db/types";
import { checkIn, checkOut } from "@/api/cleaner";

import type { SyncSource, SyncTask } from "./engine";
import { ownedByQueueOwner } from "./owner";

/** True while either end is still owed to the server AND there is any prospect
 *  of it landing. A session that failed permanently is kept - the record is
 *  still evidence of a shift - but it is never offered again. */
export function attendanceHasWork(session: AttendanceSession): boolean {
	// Not this user's shift: held, untouched, until its owner signs back in.
	// Pushing it now would file the check-in as the wrong person, and the
	// broker refuses a check-out for somebody else's session outright - which
	// unfixable() would then record as a permanent failure on a session that
	// is perfectly sendable by its owner.
	if (!ownedByQueueOwner(session.owner_user_id)) return false;
	if (session.sync_error) return false;
	if (!session.synced_in) return true;
	return session.check_out !== null && !session.synced_out;
}

/**
 * Push one session as far as the network allows. Throws on the first failure so
 * the engine can count it and retry; whatever succeeded is already persisted.
 */
export async function pushAttendance(session: AttendanceSession): Promise<void> {
	// Tracks what push() has already persisted. Recording the error against the
	// ORIGINAL session would throw away a check-in that landed a moment before
	// the check-out failed, and the queue would then try to send it twice.
	let latest = session;
	try {
		await push(session, (progress) => {
			latest = progress;
		});
	} catch (err) {
		// A permanent failure is recorded on the session, not just thrown. The
		// engine does not schedule a retry for one, but every other trigger - app
		// start, reconnect, foreground - would offer the task again, and a
		// check-out that can never land would be re-POSTed for the life of the
		// install. This is the same fix visitSync carries for a spent token.
		if (unfixable(err)) {
			await persistMerged(latest, { sync_error: { message: err.message, at: Date.now() } });
		}
		throw err;
	}
}

/**
 * Persist the pass's progress by re-reading the CURRENT row and merging only
 * the fields this pass changed. The UI writes concurrently: a check-out can
 * land in the database while the check-in request is still in flight, and
 * saving this pass's own snapshot would erase it - the row would say "still
 * on site" with synced_in set, so attendanceHasWork would never offer the
 * check-out again. Falls back to the snapshot when the re-read comes up
 * empty, which loses nothing the old behaviour had.
 */
async function persistMerged(snapshot: AttendanceSession, patch: Partial<AttendanceSession>): Promise<AttendanceSession> {
	const current = (await allAttendance()).find((s) => s.local_id === snapshot.local_id) ?? snapshot;
	const merged = { ...current, ...patch };
	await saveAttendance(merged);
	return merged;
}

async function push(session: AttendanceSession, onProgress: (session: AttendanceSession) => void): Promise<void> {
	let current = session;

	if (!current.synced_in) {
		const serverId = await checkIn(current.local_id, current.site_id, current.check_in);
		// Persisted before the check-out is attempted. If the signal dies in
		// between, the next pass must not repeat a check-in that landed - it
		// would be harmless (the server is idempotent) but it would also mean
		// the local row never learns the session id. Merged, not snapshotted:
		// the merge also picks up a check-out written mid-flight, so this same
		// pass carries straight on and sends it.
		current = await persistMerged(current, { server_id: serverId, synced_in: true });
		onProgress(current);
	}

	// Still on site. Nothing more is owed until they leave.
	if (!current.check_out) return;
	if (current.synced_out) return;

	await checkOut(current.local_id, current.check_out);
	current = await persistMerged(current, { synced_out: true });
	onProgress(current);

	// Both ends are on the server, which is now the record of what happened.
	// The local row exists to survive a dead signal, and that job is done.
	await deleteAttendance(current.local_id);
}

/**
 * Make a failed session eligible again. Attendance is evidence: there is
 * deliberately NO discard counterpart to this - a shift record that could not
 * be sent stays on the phone until it can be, or until some explicit support
 * mechanism reconciles it. The failures that land here are mostly account and
 * assignment state (deactivated, unassigned) that a managing agent can put
 * right, after which the identical payload goes through - idempotent on its
 * client id, so retrying can never record a shift twice.
 *
 * Guarded on the failure still being recorded, so repeated taps are no-ops
 * and a session that already recovered is left alone.
 */
export async function clearAttendanceFailure(localId: string): Promise<boolean> {
	const session = (await allAttendance()).find((s) => s.local_id === localId);
	if (!session?.sync_error) return false;
	await saveAttendance({ ...session, sync_error: undefined });
	return true;
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
