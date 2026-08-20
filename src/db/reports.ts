// Site reports: photos and a sentence about something that needs looking at.
//
// These writes do NOT swallow failures, unlike visits and attendance, and the
// difference is deliberate. By the time someone hits send they have walked away
// from the problem; if the device refuses to store the report, they must be
// told now, while they can still do something about it. Being told "saved" when
// nothing was saved is the one outcome this queue exists to prevent.

import { getDatabase } from "./database";
import { resolvePhotoUri, storedKey } from "./photoStore";
import type { PendingReport } from "./types";

// Photo paths go into the row as container-independent keys and come back
// resolved against the current documents directory, same as the visit photo
// queue - iOS moves the app container on every native update, and a report
// can wait through one holding un-synced photos.
function keyed(report: PendingReport): PendingReport {
	return { ...report, photos: report.photos.map((p) => ({ ...p, file: { ...p.file, uri: storedKey(p.file.uri) } })) };
}

function resolved(record: string): PendingReport {
	const report = JSON.parse(record) as PendingReport;
	return { ...report, photos: report.photos.map((p) => ({ ...p, file: { ...p.file, uri: resolvePhotoUri(p.file.uri) } })) };
}

export async function saveReport(report: PendingReport): Promise<void> {
	const db = await getDatabase();
	await db.runAsync(
		"INSERT OR REPLACE INTO reports (local_id, record, updated_at) VALUES (?, ?, ?)",
		report.local_id,
		JSON.stringify(keyed(report)),
		Date.now(),
	);
}

/** Every report still queued - none has fully reached the server. */
export async function allReports(): Promise<PendingReport[]> {
	try {
		const db = await getDatabase();
		const rows = await db.getAllAsync<{ record: string }>("SELECT record FROM reports ORDER BY updated_at ASC");
		return rows.map((r) => resolved(r.record));
	} catch {
		return [];
	}
}

export async function getReport(localId: string): Promise<PendingReport | undefined> {
	const db = await getDatabase();
	const row = await db.getFirstAsync<{ record: string }>("SELECT record FROM reports WHERE local_id = ?", localId);
	return row ? resolved(row.record) : undefined;
}

export async function deleteReport(localId: string): Promise<void> {
	try {
		const db = await getDatabase();
		await db.runAsync("DELETE FROM reports WHERE local_id = ?", localId);
	} catch {
		/* the row is already accepted server-side, so a stale local copy only
		   means one more idempotent replay next pass */
	}
}
