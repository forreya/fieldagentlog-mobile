// Site reports: the photos, then the report that refers to them.
//
// Two calls, and the order between them is the whole contract. A photo is
// uploaded on its own and comes back as a storage path; the report is created
// with those paths. Creating a report that names a path nobody uploaded is
// refused server-side, which is exactly the right way round - it means a
// half-uploaded report can never become a real one.

import { callBroker } from "./broker";
import type { LocalFile } from "./contract";
import { UPLOAD_TIMEOUT_MS } from "./http";
import type { GeoPoint, ReportCategory, ReportPhotoRef } from "@/db/types";

/** Upload one photo. Returns the ref the report will carry. */
export async function uploadReportPhoto(blockId: string, file: LocalFile): Promise<ReportPhotoRef> {
	const form = new FormData();
	// React Native accepts a file descriptor where the DOM typings want a Blob.
	form.append("file", file as unknown as Blob);
	form.append("block_id", blockId);

	const res = await callBroker<{ ref: string; file_name: string; content_type: string }>("site-report", form, { timeoutMs: UPLOAD_TIMEOUT_MS });
	// The upload calls it `ref`; the create call calls the same string `path`.
	return { path: res.ref, file_name: res.file_name, content_type: res.content_type };
}

export interface CreatedReport {
	report_id: string;
	status: string;
}

/**
 * Create the report. Idempotent on `client_id`, so a retry after a lost
 * response returns the existing one rather than filing a duplicate.
 */
export async function createReport(input: {
	clientId: string;
	blockId: string;
	category: ReportCategory;
	note: string;
	photos: ReportPhotoRef[];
	at: number;
	point: GeoPoint | null;
	attendanceClientId: string | null;
}): Promise<CreatedReport> {
	return callBroker<CreatedReport>("site-report", {
		action: "create",
		client_id: input.clientId,
		block_id: input.blockId,
		category: input.category,
		note: input.note,
		photos: input.photos,
		at: new Date(input.at).toISOString(),
		lat: input.point?.lat,
		lng: input.point?.lng,
		accuracy: input.point?.accuracy,
		attendance_client_id: input.attendanceClientId ?? undefined,
	});
}

/** One line per report, as the server remembers it. */
export interface SentReport {
	id: string;
	block_name: string;
	category: ReportCategory;
	note: string;
	photo_count: number;
	reported_at: string;
	status: string;
}

export async function loadMyReports(limit?: number): Promise<SentReport[]> {
	const res = await callBroker<{ reports?: SentReport[] }>("site-report", { action: "my-reports", limit });
	return res.reports ?? [];
}
