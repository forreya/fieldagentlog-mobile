// Where the pieces are joined up. Until this existed, Milestone B was three
// thousand lines of infrastructure that nothing called: the queues, the engine
// and the triggers were all correct and all inert.
//
// Everything here is idempotent and safe to call on every launch. Nothing here
// may throw: this runs before the first screen paints, and a failure to open
// the database must not be the reason an inspector cannot see their checks.

import { getDatabase } from "@/db/database";
import { allPhotosForToken } from "@/db/photos";
import { sweepOrphans } from "@/db/photoStore";
import { loadVisit } from "@/db/visits";
import type { VisitRecord } from "@/db/types";
import { syncEngine } from "@/sync/engine";
import { startSyncTriggers } from "@/sync/triggers";
import { createVisitSource } from "@/sync/visitSync";

/** Visit records the device is holding. One per token; the wizard adds them. */
const heldTokens = new Set<string>();

/** Called by the wizard when it opens a visit, so sync knows to include it. */
export function trackVisit(token: string): void {
	heldTokens.add(token);
}

async function heldVisits(): Promise<VisitRecord[]> {
	const records: VisitRecord[] = [];
	for (const token of heldTokens) {
		const record = await loadVisit(token);
		if (record) records.push(record);
	}
	return records;
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
	const referenced = new Set<string>();
	for (const token of heldTokens) {
		for (const photo of await allPhotosForToken(token)) referenced.add(photo.file.uri);
	}
	sweepOrphans(referenced);
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

	syncEngine.register(createVisitSource(heldVisits));
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
	heldTokens.clear();
}
