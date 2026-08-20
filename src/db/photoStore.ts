// Where photo bytes live while they wait for signal.
//
// WHY THIS EXISTS AT ALL: the camera and picker hand back a file in the app's
// CACHE directory, and both iOS and Android are free to delete cache whenever
// they want space - without asking, and while the app is closed. A photo taken
// in a basement might wait hours for signal. Queueing the cache path would mean
// occasionally uploading nothing, or a report arriving with missing pictures.
// So every photo is copied into the app's document directory first, and only
// then does its path go into the queue.
//
// The database stores paths; this module owns the files. Nothing else should
// write into the photo directory.

import { Directory, File, Paths } from "expo-file-system";

import type { LocalFile } from "@/api/contract";
import { uuid } from "@/lib/id";

const PHOTO_DIR = "photos";

function photoDirectory(): Directory {
	const dir = new Directory(Paths.document, PHOTO_DIR);
	if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
	return dir;
}

/** Keep the extension (the server sniffs content type, but a name helps humans). */
function extensionOf(name: string): string {
	const match = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
	return match ? `.${match[1].toLowerCase()}` : ".jpg";
}

/**
 * Copy a captured photo into permanent storage and return the stored file.
 *
 * The on-disk name is generated, never taken from the source: a picker or a
 * server can hand back anything, and a name containing path separators would
 * write outside the photo directory. The original name travels on as metadata
 * for the upload only.
 */
export async function storePhoto(source: LocalFile): Promise<LocalFile> {
	const dir = photoDirectory();
	const target = new File(dir, `${uuid()}${extensionOf(source.name)}`);
	await new File(source.uri).copy(target);
	return { uri: target.uri, name: source.name, type: source.type };
}

/**
 * The container-independent form of a stored photo's uri, for queue rows.
 *
 * iOS renames the app container on every native update: the files migrate,
 * but an absolute file:// path persisted before the update points into the
 * old container forever after. The stable identity of a stored photo is its
 * generated basename inside the one directory this module owns, so that is
 * what goes to disk.
 */
export function storedKey(uri: string): string {
	return `${PHOTO_DIR}/${basenameOf(uri)}`;
}

/**
 * Resolve a persisted key - or a legacy absolute uri - against the CURRENT
 * photo directory. Resolving by basename is what heals rows written before
 * keys existed: an old-container absolute path and a relative key both name
 * the same file here and now. Construction only - nothing is created or
 * touched on disk.
 */
export function resolvePhotoUri(stored: string): string {
	return new File(new Directory(Paths.document, PHOTO_DIR), basenameOf(stored)).uri;
}

function basenameOf(path: string): string {
	const segments = path.split("/").filter(Boolean);
	return segments.length ? segments[segments.length - 1] : path;
}

/** True when the bytes are still on disk. */
export function storedPhotoExists(uri: string): boolean {
	try {
		return new File(uri).exists;
	} catch {
		return false;
	}
}

/**
 * Remove a stored photo. Safe to call twice: a photo whose row has gone may
 * already have been swept, and failing here would block the queue behind it.
 */
export function deleteStoredPhoto(uri: string): void {
	try {
		const file = new File(uri);
		if (file.exists) file.delete();
	} catch {
		/* the file is gone or unreadable; either way there is nothing to free */
	}
}

/**
 * Delete stored photos that no queue row references any more, and report how
 * many went.
 *
 * Orphans are normal, not exceptional: a photo attached to a check that was
 * later flipped back to Pass, or a report abandoned before sending. Without a
 * sweep they accumulate silently until a phone runs out of space - which the
 * user would experience as the camera failing, far from the cause.
 */
export function sweepOrphans(referencedUris: Iterable<string>): number {
	const keep = new Set(referencedUris);
	let removed = 0;
	try {
		for (const entry of photoDirectory().list()) {
			if (entry instanceof Directory) continue;
			if (keep.has(entry.uri)) continue;
			try {
				entry.delete();
				removed += 1;
			} catch {
				/* skip this one; the next sweep tries again */
			}
		}
	} catch {
		/* the directory is unreadable - nothing to sweep, and not worth an error */
	}
	return removed;
}

/** Total bytes held by queued photos. For the diagnostics screen. */
export function storeUsageBytes(): number {
	try {
		return photoDirectory()
			.list()
			.reduce((total, entry) => (entry instanceof Directory ? total : total + (entry.size ?? 0)), 0);
	} catch {
		return 0;
	}
}
