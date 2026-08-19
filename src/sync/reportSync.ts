// Pushing one site report: its photos, then the report itself.
//
// The same shape as visitSync, and for the same reason. Ordering is the point,
// so this is one task per report rather than one per photo:
//
//   1. Upload every photo that has no ref yet, recording each one as it lands.
//      A signal that dies after three of five must not cost the three.
//   2. Only once every photo has a ref, create the report. The server refuses a
//      report naming a path nobody uploaded, so a half-uploaded report cannot
//      become a real one - which is the right way round.
//
// Replay-safe: create is idempotent on client_id, so a retry after a lost
// response returns the existing report rather than filing a second.

import { unfixable } from "@/api/errors";
import { createReport, uploadReportPhoto } from "@/api/report";
import { deleteStoredPhoto } from "@/db/photoStore";
import { deleteReport, getReport, saveReport } from "@/db/reports";
import type { PendingReport } from "@/db/types";
import { unsyncedPhotoCount } from "@/db/types";

import type { SyncSource, SyncTask } from "./engine";
import { ownedByQueueOwner } from "./owner";

/** True while the report still owes the server something. */
export function reportHasWork(report: PendingReport): boolean {
	// Not this user's report: held until its owner signs back in. The server
	// files a report as whoever's JWT carries the create, so sending it now
	// would put the wrong name on it.
	if (!ownedByQueueOwner(report.owner_user_id)) return false;
	return !report.sync_error;
}

/** How many photos across all reports are still on the phone. Feeds the badge. */
export function pendingPhotoTotal(reports: PendingReport[]): number {
	return reports.reduce((total, report) => total + unsyncedPhotoCount(report), 0);
}

export async function pushReport(report: PendingReport): Promise<void> {
	let latest = report;
	try {
		await push(report, (progress) => {
			latest = progress;
		});
	} catch (err) {
		// Permanent failures are recorded rather than retried forever: a report
		// for a block the reporter is no longer assigned to can never be filed,
		// and every app start would otherwise offer it again.
		if (unfixable(err)) {
			await saveReport({ ...latest, sync_error: { message: err.message, at: Date.now() } });
		}
		throw err;
	}
}

async function push(report: PendingReport, onProgress: (report: PendingReport) => void): Promise<void> {
	let current = report;

	for (const photo of current.photos) {
		if (photo.ref) continue;

		const ref = await uploadReportPhoto(current.site_id, photo.file);
		// Persisted immediately: the next photo may be the one that fails, and
		// this upload must not be repeated when the pass resumes.
		current = { ...current, photos: current.photos.map((p) => (p.local_id === photo.local_id ? { ...p, ref } : p)) };
		await saveReport(current);
		onProgress(current);
	}

	await createReport({
		clientId: current.local_id,
		blockId: current.site_id,
		category: current.category,
		note: current.note,
		photos: current.photos.map((p) => p.ref).filter((ref): ref is NonNullable<typeof ref> => ref !== null),
		at: current.at,
		point: current.point,
		attendanceClientId: current.attendance_client_id,
	});

	// The server has it. The bytes on the phone have done their job.
	for (const photo of current.photos) deleteStoredPhoto(photo.file.uri);
	await deleteReport(current.local_id);
}

/**
 * Make a failed report eligible again. `sync_error` means "will not retry by
 * itself"; a person pressing Try again is the release valve - the 403s that
 * land here are assignment and account state a managing agent can put right,
 * and the same report then goes through unchanged.
 *
 * Guarded on the failure still being recorded, freshly read: a report that is
 * mid-recovery or already sent has nothing to clear, and a repeated tap after
 * the first is a no-op. Returns whether anything changed, so the caller knows
 * whether a pass is worth asking for.
 */
export async function clearReportFailure(localId: string): Promise<boolean> {
	const report = await getReport(localId);
	if (!report?.sync_error) return false;
	await saveReport({ ...report, sync_error: undefined });
	return true;
}

/**
 * Discard a FAILED report: its row and every photo byte it holds, permanently.
 *
 * Only a report whose failure is still recorded can be discarded - checked
 * against the database at the moment of the call, not against what a screen
 * was rendering. That guard is what makes this race-free: a failed report is
 * never offered to the engine, so nothing can be mid-push while it is
 * discarded, and a report that was retried (or that already reached the
 * server and left the queue) is a silent no-op rather than a deletion of
 * files an in-flight upload still needs. Nothing here talks to the network:
 * if the create already landed server-side, the server keeps its record and
 * this only ever removes the local copy.
 */
export async function discardReport(localId: string): Promise<boolean> {
	const report = await getReport(localId);
	if (!report?.sync_error) return false;
	for (const photo of report.photos) deleteStoredPhoto(photo.file.uri);
	await deleteReport(localId);
	return true;
}

/** This report's task id, so a screen can pick its own result out of a pass. */
export function reportTaskId(localId: string): string {
	return `report:${localId}`;
}

export function createReportSource(reports: () => Promise<PendingReport[]>): SyncSource {
	return {
		name: "reports",
		async pending(): Promise<SyncTask[]> {
			const tasks: SyncTask[] = [];
			for (const report of await reports()) {
				if (reportHasWork(report)) tasks.push({ id: reportTaskId(report.local_id), run: () => pushReport(report) });
			}
			return tasks;
		},
	};
}
