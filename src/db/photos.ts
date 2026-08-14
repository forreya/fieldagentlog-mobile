// Photos waiting to upload. The row holds the path to a file on disk, never the
// bytes: the file store (phase B4) owns the file's life, this owns the queue.

import { getDatabase } from "./database";
import type { PendingPhoto } from "./types";

interface PhotoRow {
	local_id: string;
	token: string;
	check_id: string;
	file_uri: string;
	file_name: string;
	content_type: string;
	ref: string | null;
	created_at: number;
}

function toPhoto(row: PhotoRow): PendingPhoto {
	return {
		local_id: row.local_id,
		token: row.token,
		check_id: row.check_id,
		file: { uri: row.file_uri, name: row.file_name, type: row.content_type },
		ref: row.ref,
		created_at: row.created_at,
	};
}

export async function addPendingPhoto(photo: PendingPhoto): Promise<void> {
	const db = await getDatabase();
	await db.runAsync(
		`INSERT OR REPLACE INTO photos (local_id, token, check_id, file_uri, file_name, content_type, ref, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		photo.local_id,
		photo.token,
		photo.check_id,
		photo.file.uri,
		photo.file.name,
		photo.file.type,
		photo.ref,
		photo.created_at,
	);
}

export async function getPhoto(localId: string): Promise<PendingPhoto | undefined> {
	const db = await getDatabase();
	const row = await db.getFirstAsync<PhotoRow>("SELECT * FROM photos WHERE local_id = ?", localId);
	return row ? toPhoto(row) : undefined;
}

/** Record the server ref for an uploaded photo. */
export async function setPhotoRef(localId: string, ref: string): Promise<void> {
	const db = await getDatabase();
	await db.runAsync("UPDATE photos SET ref = ? WHERE local_id = ?", ref, localId);
}

export async function deletePhoto(localId: string): Promise<void> {
	const db = await getDatabase();
	await db.runAsync("DELETE FROM photos WHERE local_id = ?", localId);
}

/** Photos for this visit that still have no server ref, oldest first. */
export async function pendingPhotosForToken(token: string): Promise<PendingPhoto[]> {
	try {
		const db = await getDatabase();
		const rows = await db.getAllAsync<PhotoRow>("SELECT * FROM photos WHERE token = ? AND ref IS NULL ORDER BY created_at ASC", token);
		return rows.map(toPhoto);
	} catch {
		return [];
	}
}

/** Every queued photo on the device, whichever visit it belongs to. The
 *  startup sweep needs this: anything it cannot see, it deletes. */
export async function allPhotos(): Promise<PendingPhoto[]> {
	try {
		const db = await getDatabase();
		const rows = await db.getAllAsync<PhotoRow>("SELECT * FROM photos");
		return rows.map(toPhoto);
	} catch {
		return [];
	}
}

/** Every photo row for a visit, uploaded or not - used when clearing up. */
export async function allPhotosForToken(token: string): Promise<PendingPhoto[]> {
	const db = await getDatabase();
	const rows = await db.getAllAsync<PhotoRow>("SELECT * FROM photos WHERE token = ? ORDER BY created_at ASC", token);
	return rows.map(toPhoto);
}
