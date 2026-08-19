// Where the pieces are joined up. Until this existed, Milestone B was three
// thousand lines of infrastructure that nothing called: the queues, the engine
// and the triggers were all correct and all inert.
//
// Everything here is idempotent and safe to call on every launch. Nothing here
// may throw: this runs before the first screen paints, and a failure to open
// the database must not be the reason an inspector cannot see their checks.

import { getDatabase } from "@/db/database";
import { allPhotos } from "@/db/photos";
import { sweepOrphans } from "@/db/photoStore";
import { allAttendance } from "@/db/attendance";
import { allReports } from "@/db/reports";
import { allVisits } from "@/db/visits";
import { syncEngine } from "@/sync/engine";
import { startSyncTriggers } from "@/sync/triggers";
import { createAttendanceSource } from "@/sync/attendanceSync";
import { createReportSource } from "@/sync/reportSync";
import { createVisitSource } from "@/sync/visitSync";

/**
 * Every photo file some queue still needs: visit photos from their own table,
 * and report photos from inside the report rows. Both live in the same
 * directory, and the sweep deletes whatever it is not shown - so this list
 * being complete is what stands between a queued capture and a hole in it.
 * A report held for an absent owner can wait here for days; its photos wait
 * with it.
 */
export async function referencedPhotoUris(): Promise<string[]> {
	const [photos, reports] = await Promise.all([allPhotos(), allReports()]);
	return [...photos.map((photo) => photo.file.uri), ...reports.flatMap((report) => report.photos.map((photo) => photo.file.uri))];
}

/**
 * Delete photo files nothing refers to any more.
 *
 * Runs at startup rather than after each visit because the cases that leave
 * orphans are the ones that skip tidy-up: an app killed mid-visit, a check
 * flipped back to Pass and then abandoned. Left alone they accumulate until the
 * phone is full, which a user experiences as the camera failing.
 */
async function sweepOrphanPhotos(): Promise<void> {
	// Every row in every table, not just visits opened this launch. The sweep
	// deletes whatever it is not shown, so a narrower list would destroy the
	// queued photos of a visit or report finished offline before they uploaded.
	sweepOrphans(await referencedPhotoUris());
}

let started = false;
let teardown: (() => void) | null = null;

/** Open the database, register the queues, start listening. Idempotent. */
export async function bootstrap(): Promise<void> {
	if (started) return;
	started = true;

	try {
		await getDatabase();
	} catch {
		// A device that will not give us storage still gets an app: the wizard
		// degrades to online-only rather than refusing to open.
	}

	syncEngine.register(createVisitSource(allVisits));
	// Registered unconditionally, not only for cleaners: a session queued before
	// a sign-out belongs to the device, and must still go up afterwards.
	syncEngine.register(createAttendanceSource(allAttendance));
	syncEngine.register(createReportSource(allReports));
	teardown = startSyncTriggers(syncEngine);

	// Best-effort housekeeping; never worth delaying the first screen.
	void sweepOrphanPhotos().catch(() => undefined);
	void syncEngine.sync("app start");
}

/** Test seam. */
export function resetBootstrap(): void {
	teardown?.();
	teardown = null;
	started = false;
}
