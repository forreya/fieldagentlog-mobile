// Building a site report, and the rules about when it is allowed to leave.
//
// Pure, so the rules can be tested without a screen or a camera. The screen
// owns the widgets; this owns what makes a report valid and what it becomes.

import type { GeoPoint, PendingReport, ReportCategory, ReportPhoto } from "@/db/types";
import type { LocalFile } from "@/api/contract";
import { uuid } from "@/lib/id";

/** Ten is the server's limit and also the point past which nobody scrolls. */
export const MAX_PHOTOS = 10;

/** Matches the column. Long enough for anything worth saying about a bin store. */
export const MAX_NOTE = 4000;

export interface Draft {
	category: ReportCategory;
	note: string;
	photos: { local_id: string; file: LocalFile }[];
}

export function emptyDraft(): Draft {
	// Repairs first because it is what most reports turn out to be; the picker
	// having a sensible default saves a tap on every single one.
	return { category: "repairs", note: "", photos: [] };
}

/**
 * Why this draft cannot be sent yet, or null when it can.
 *
 * A note is required and a photo is not, which is the opposite of what people
 * expect - but a photo of a broken thing with no words is a puzzle for whoever
 * picks it up, and they are not standing where you are.
 */
export function draftProblem(draft: Draft): string | null {
	if (!draft.note.trim()) return "Say what the issue is - a photo on its own is a puzzle.";
	if (draft.photos.length > MAX_PHOTOS) return `You can attach up to ${MAX_PHOTOS} photos.`;
	return null;
}

export function canAddPhoto(draft: Draft): boolean {
	return draft.photos.length < MAX_PHOTOS;
}

/** Turn a valid draft into the thing the queue will carry. */
export function toPendingReport(
	draft: Draft,
	site: { id: string; name: string },
	point: GeoPoint | null,
	attendanceClientId: string | null,
	ownerUserId: string | null,
	now: number = Date.now(),
): PendingReport {
	const photos: ReportPhoto[] = draft.photos.map((photo) => ({ local_id: photo.local_id, file: photo.file, ref: null }));
	return {
		local_id: uuid(),
		site_id: site.id,
		site_name: site.name,
		category: draft.category,
		note: draft.note.trim(),
		photos,
		// When they raised it, not when it syncs. A report queued underground on
		// Friday and sent on Monday happened on Friday.
		at: now,
		point,
		attendance_client_id: attendanceClientId,
		// Stamped at capture, never at send: the queue outlives the session,
		// and this is what stops it going up under somebody else's name.
		owner_user_id: ownerUserId,
	};
}
