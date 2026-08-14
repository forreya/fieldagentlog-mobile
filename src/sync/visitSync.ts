// Pushing a visit: its photos, then its submission. Ordering is the whole
// point, so this is one task per visit rather than one per photo.
//
//   1. Upload every photo a result still refers to, recording each ref as it
//      lands. A signal that dies after three of five photos must not cost the
//      three that already uploaded.
//   2. Only once every referenced photo has a ref, submit. A visit submitted
//      with a missing photo_ref is a compliance record with a hole in it.
//
// Photos nobody refers to any more are skipped, not uploaded: a check flipped
// back to Pass leaves its photo behind, and spending a field worker's data on
// an image no one will ever see is worse than leaving it.
//
// Everything here is replay-safe. The server is idempotent on the visit token,
// so a submit retried after a lost response returns the stored result instead
// of recording a second visit.

import { ApiError } from "@/api/errors";
import { submitVisit, uploadPhoto } from "@/api/visit";
import { deletePhoto, pendingPhotosForToken, setPhotoRef } from "@/db/photos";
import { deleteStoredPhoto } from "@/db/photoStore";
import type { VisitRecord } from "@/db/types";
import { saveVisit } from "@/db/visits";

import type { SyncSource, SyncTask } from "./engine";
import { buildSubmitBody } from "./submitBody";

/** Local ids of photos still referenced by an answer. */
function referencedPhotoIds(record: VisitRecord): Set<string> {
	const ids = new Set<string>();
	for (const result of Object.values(record.results)) {
		if (result.photo_local_id) ids.add(result.photo_local_id);
	}
	return ids;
}

/** Forget a photo an answer points at but the queue no longer holds. */
function clearPhotoReference(record: VisitRecord, localId: string): VisitRecord {
	const results = { ...record.results };
	for (const [checkId, result] of Object.entries(results)) {
		if (result.photo_local_id === localId) results[checkId] = { ...result, photo_local_id: null };
	}
	return { ...record, results };
}

/** Record a photo's server ref on whichever answer was waiting for it. */
function applyRef(record: VisitRecord, localId: string, ref: string): VisitRecord {
	const results = { ...record.results };
	for (const [checkId, result] of Object.entries(results)) {
		if (result.photo_local_id === localId) {
			results[checkId] = { ...result, photo_ref: ref, photo_local_id: null };
		}
	}
	return { ...record, results };
}

/** True when no answer is still waiting for a photo to upload. */
export function readyToSubmit(record: VisitRecord): boolean {
	return referencedPhotoIds(record).size === 0;
}

/**
 * Push one visit as far as the network allows. Throws on the first failure so
 * the engine can count it and retry later; whatever succeeded is already
 * persisted.
 */
export async function pushVisit(record: VisitRecord): Promise<void> {
	let current = record;
	const referenced = referencedPhotoIds(current);

	const queued = await pendingPhotosForToken(current.token);

	// A check pointing at a photo that has no queue row can never be resolved,
	// and readyToSubmit would stay false forever - a visit stuck on the phone
	// with no way to finish it. Losing one photo is bad; losing the whole
	// inspection is worse, so the dangling reference is dropped.
	const queuedIds = new Set(queued.map((p) => p.local_id));
	for (const localId of referenced) {
		if (queuedIds.has(localId)) continue;
		current = clearPhotoReference(current, localId);
		referenced.delete(localId);
		await saveVisit(current);
	}

	for (const photo of queued) {
		// Orphan: its answer was changed or cleared. Drop it rather than spend
		// a field worker's data uploading it.
		if (!referenced.has(photo.local_id)) {
			await deletePhoto(photo.local_id);
			deleteStoredPhoto(photo.file.uri);
			continue;
		}

		const { ref } = await uploadPhoto(current.token, photo.file);
		// Persist immediately: the next photo may be the one that fails, and
		// this upload must not be repeated when the pass resumes.
		await setPhotoRef(photo.local_id, ref);
		current = applyRef(current, photo.local_id, ref);
		await saveVisit(current);
	}

	if (!current.submit_requested_at || current.submitted || current.submit_error) return;
	if (!readyToSubmit(current)) return;

	let response;
	try {
		response = await submitVisit(current.token, buildSubmitBody(current));
	} catch (err) {
		// A permanent failure is recorded on the record, not just thrown. The
		// engine does not schedule a retry for one, but every other trigger -
		// app start, reconnect, foreground - would offer the task again, and a
		// spent token would be re-POSTed for the life of the install.
		if (err instanceof ApiError && !err.retryable) {
			await saveVisit({ ...current, submit_error: { message: err.message, at: Date.now() } });
		}
		throw err;
	}
	await saveVisit({
		...current,
		submitted: {
			visit_id: response.visit_id,
			logbook_pdf_url: response.logbook_pdf_url,
			completed_at: new Date().toISOString(),
		},
	});

	// The bytes have served their purpose; the refs live on the server now.
	for (const photo of await pendingPhotosForToken(current.token)) {
		deleteStoredPhoto(photo.file.uri);
		await deletePhoto(photo.local_id);
	}
}

/** Whether this visit has anything left to push. */
export async function visitHasWork(record: VisitRecord): Promise<boolean> {
	if (record.submitted) return false;
	// Nothing here can succeed until someone acts: uploading its photos would
	// only spend data on a visit that can never be submitted.
	if (record.submit_error) return false;
	if (record.submit_requested_at) return true;
	return (await pendingPhotosForToken(record.token)).length > 0;
}

/** This visit's task id, so a screen can pick its own result out of a pass. */
export function visitTaskId(token: string): string {
	return `visit:${token}`;
}

/** The engine source. `visits` supplies the records currently on the device. */
export function createVisitSource(visits: () => Promise<VisitRecord[]>): SyncSource {
	return {
		name: "visits",
		async pending(): Promise<SyncTask[]> {
			const tasks: SyncTask[] = [];
			for (const record of await visits()) {
				if (await visitHasWork(record)) {
					tasks.push({ id: visitTaskId(record.token), run: () => pushVisit(record) });
				}
			}
			return tasks;
		},
	};
}
