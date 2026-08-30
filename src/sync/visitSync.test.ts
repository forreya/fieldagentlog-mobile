// The replay matrix: what happens when the network fails at each point of a
// visit push, and what must be true when it comes back. These are the tests
// that protect work nobody can recreate.

import * as SQLite from "expo-sqlite";

import { ApiError } from "@/api/errors";
import * as visitApi from "@/api/visit";
import { resetDatabase } from "@/db/database";
import { addPendingPhoto, allPhotosForToken, getPhoto, pendingPhotosForToken } from "@/db/photos";
import { deleteStoredPhoto } from "@/db/photoStore";
import type { PendingPhoto, VisitRecord } from "@/db/types";
import { loadVisit, saveVisit } from "@/db/visits";

import { setQueueOwner } from "./owner";
import { createVisitSource, pushVisit, readyToSubmit, sweepSubmittedVisits, visitHasWork } from "./visitSync";

jest.mock("expo-sqlite");
jest.mock("@/api/visit");
jest.mock("@/db/photoStore", () => ({
	deleteStoredPhoto: jest.fn(),
	// Identity fakes: path resolution is photoStore's own concern, proven in
	// its own suite. This one is about upload ordering.
	storedKey: (uri: string) => uri,
	resolvePhotoUri: (stored: string) => stored,
}));

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const api = visitApi as jest.Mocked<typeof visitApi>;

beforeEach(() => {
	resetDatabase();
	__resetAllDatabases();
	jest.clearAllMocks();
	api.submitVisit.mockResolvedValue({ ok: true, visit_id: "v1", logbook_pdf_url: "https://pdf" });
});

const record = (over: Partial<VisitRecord> = {}): VisitRecord => ({
	token: "tok1",
	packet: {},
	inspector: { name: "A Smith", email: "a@example.com" },
	results: {},
	fra_updates: {},
	started_at: 1_000,
	updated_at: 1_000,
	submitted: null,
	...over,
});

const withPhoto = (checkId: string, localId: string) => ({
	[checkId]: { verdict: "fail" as const, note: "n", severity: "high" as const, photo_ref: null, photo_local_id: localId },
});

async function queuePhoto(localId: string, token = "tok1", over: Partial<PendingPhoto> = {}) {
	await addPendingPhoto({
		local_id: localId,
		token,
		check_id: "c1",
		file: { uri: `file:///${localId}.jpg`, name: `${localId}.jpg`, type: "image/jpeg" },
		ref: null,
		created_at: Date.now(),
		...over,
	});
}

describe("photos before submit", () => {
	test("uploads every referenced photo, then submits", async () => {
		api.uploadPhoto.mockResolvedValue({ ref: "server/p1" });
		await queuePhoto("p1");
		const rec = record({ results: withPhoto("c1", "p1"), submit_requested_at: 1 });
		await saveVisit(rec);

		await pushVisit(rec);

		expect(api.uploadPhoto).toHaveBeenCalledTimes(1);
		expect(api.submitVisit).toHaveBeenCalledTimes(1);
		// The submitted body carries the server ref, never the local id.
		expect(api.submitVisit.mock.calls[0][1].results[0].photo_ref).toBe("server/p1");
	});

	test("does NOT submit while a photo is still waiting - no holes in the logbook", async () => {
		api.uploadPhoto.mockRejectedValue(new ApiError("network", "no signal"));
		await queuePhoto("p1");
		const rec = record({ results: withPhoto("c1", "p1"), submit_requested_at: 1 });
		await saveVisit(rec);

		await expect(pushVisit(rec)).rejects.toThrow();
		expect(api.submitVisit).not.toHaveBeenCalled();
	});

	test("a submit not yet requested uploads photos but stops there", async () => {
		api.uploadPhoto.mockResolvedValue({ ref: "server/p1" });
		await queuePhoto("p1");
		const rec = record({ results: withPhoto("c1", "p1") });
		await saveVisit(rec);

		await pushVisit(rec);

		expect(api.uploadPhoto).toHaveBeenCalled();
		expect(api.submitVisit).not.toHaveBeenCalled();
	});
});

describe("resuming a part-uploaded visit", () => {
	test("a signal that dies mid-upload does not re-send what already landed", async () => {
		// Three photos, the second fails. On the next pass only the two that
		// never uploaded should be attempted - re-sending megabytes over a phone
		// signal is exactly what the persist-as-you-go design exists to avoid.
		api.uploadPhoto.mockResolvedValueOnce({ ref: "server/p1" }).mockRejectedValueOnce(new ApiError("network", "dropped"));
		for (const id of ["p1", "p2", "p3"]) await queuePhoto(id);
		const rec = record({
			results: { ...withPhoto("c1", "p1"), ...withPhoto("c2", "p2"), ...withPhoto("c3", "p3") },
			submit_requested_at: 1,
		});
		await saveVisit(rec);

		await expect(pushVisit(rec)).rejects.toThrow();

		expect((await getPhoto("p1"))?.ref).toBe("server/p1");
		const stillPending = (await pendingPhotosForToken("tok1")).map((p) => p.local_id);
		expect(stillPending).toEqual(["p2", "p3"]);

		// Second pass: p1 is not offered again.
		api.uploadPhoto.mockReset();
		api.uploadPhoto.mockResolvedValue({ ref: "server/rest" });
		const resumed = (await loadVisit("tok1")) as VisitRecord;
		await pushVisit(resumed);
		expect(api.uploadPhoto).toHaveBeenCalledTimes(2);
	});

	test("the ref is recorded on the answer as soon as it lands", async () => {
		api.uploadPhoto.mockResolvedValueOnce({ ref: "server/p1" }).mockRejectedValueOnce(new ApiError("network", "dropped"));
		for (const id of ["p1", "p2"]) await queuePhoto(id);
		const rec = record({ results: { ...withPhoto("c1", "p1"), ...withPhoto("c2", "p2") }, submit_requested_at: 1 });
		await saveVisit(rec);

		await expect(pushVisit(rec)).rejects.toThrow();

		const saved = (await loadVisit("tok1")) as VisitRecord;
		expect(saved.results.c1.photo_ref).toBe("server/p1");
		expect(saved.results.c1.photo_local_id).toBeNull();
		expect(saved.results.c2.photo_ref).toBeNull();
	});
});

describe("a photo whose queue row has vanished", () => {
	test("does not strand the visit forever", async () => {
		// The reference can never resolve, so readyToSubmit would stay false and
		// the inspection could never leave the phone. Losing one photo beats
		// losing the whole visit.
		const rec = record({ results: withPhoto("c1", "ghost"), submit_requested_at: 1 });
		await saveVisit(rec);

		await pushVisit(rec);

		expect(api.uploadPhoto).not.toHaveBeenCalled();
		expect(api.submitVisit).toHaveBeenCalledTimes(1);
		expect((await loadVisit("tok1"))?.results.c1.photo_local_id).toBeNull();
	});
});

describe("orphaned photos", () => {
	test("a photo whose check was flipped back to Pass is dropped, not uploaded", async () => {
		// Uploading it would spend a field worker's data on an image no one will
		// ever open.
		await queuePhoto("orphan", "tok1", { created_at: Date.now() - 60 * 60_000 });
		const rec = record({ results: { c1: { verdict: "pass", note: "", severity: null, photo_ref: null, photo_local_id: null } } });
		await saveVisit(rec);

		await pushVisit(rec);

		expect(api.uploadPhoto).not.toHaveBeenCalled();
		expect(await getPhoto("orphan")).toBeUndefined();
	});

	test("a freshly captured photo is skipped, never deleted", async () => {
		// The capture nudge starts a pass moments after the queue row is
		// written, and the wizard's save of the answer that references it races
		// that pass. A young unreferenced photo has to survive: the next pass
		// will see the reference. Deleting it here would destroy the capture.
		await queuePhoto("fresh");
		const rec = record({ results: {} });
		await saveVisit(rec);

		await pushVisit(rec);

		expect(api.uploadPhoto).not.toHaveBeenCalled();
		expect(await getPhoto("fresh")).toBeDefined();
	});
});

describe("a ref clobbered by a stale record save", () => {
	test("is re-applied from the queue row, so the submit body keeps the photo", async () => {
		// A pass uploaded the photo mid-visit and recorded the ref, then the
		// wizard saved an in-memory copy from before the upload: the answer
		// points at the local id again. The row still remembers the ref, so the
		// push restores it - the old code treated the photo as dangling,
		// cleared the reference and submitted a logbook entry with a hole.
		await queuePhoto("p1", "tok1", { ref: "server/p1" });
		const rec = record({ results: withPhoto("c1", "p1"), submit_requested_at: 1 });
		await saveVisit(rec);

		await pushVisit(rec);

		expect(api.uploadPhoto).not.toHaveBeenCalled();
		expect(api.submitVisit).toHaveBeenCalledTimes(1);
		expect(api.submitVisit.mock.calls[0][1].results[0].photo_ref).toBe("server/p1");
	});
});

describe("the database beats the snapshot", () => {
	test("pushVisit submits the record as last saved, not as handed over", async () => {
		// The engine lists its work at the start of a pass; the wizard may save
		// again before the task runs. Submitting the snapshot would send answers
		// from before that save.
		const snapshot = record({ submit_requested_at: 1 });
		await saveVisit(
			record({ submit_requested_at: 1, results: { c9: { verdict: "pass", note: "", severity: null, photo_ref: null, photo_local_id: null } } }),
		);

		await pushVisit(snapshot);

		expect(api.submitVisit.mock.calls[0][1].results.map((r) => r.check_id)).toEqual(["c9"]);
	});
});

describe("after a successful submit", () => {
	test("every photo row and file for the visit is deleted, uploaded ones included", async () => {
		// The refs live on the server now. A row left behind would keep its file
		// alive forever: the startup sweep preserves whatever any row references.
		api.uploadPhoto.mockResolvedValue({ ref: "server/p1" });
		await queuePhoto("p1");
		await queuePhoto("done", "tok1", { ref: "server/done" });
		const rec = record({
			results: {
				...withPhoto("c1", "p1"),
				c2: { verdict: "fail", note: "n", severity: "high", photo_ref: "server/done", photo_local_id: null },
			},
			submit_requested_at: 1,
		});
		await saveVisit(rec);

		await pushVisit(rec);

		expect(api.submitVisit).toHaveBeenCalledTimes(1);
		expect(await allPhotosForToken("tok1")).toHaveLength(0);
		expect(deleteStoredPhoto).toHaveBeenCalledWith("file:///p1.jpg");
		expect(deleteStoredPhoto).toHaveBeenCalledWith("file:///done.jpg");
	});
});

describe("sweeping submitted visits", () => {
	const WEEK = 7 * 24 * 60 * 60 * 1000;
	const submittedAt = (at: number) => ({ visit_id: "v1", logbook_pdf_url: "u", completed_at: new Date(at).toISOString() });

	test("an old submitted visit goes, with any photo rows still under its token", async () => {
		await queuePhoto("leftover", "tok1", { ref: "server/leftover" });
		const done = record({ submitted: submittedAt(1_000) });
		await saveVisit(done);

		await sweepSubmittedVisits([done], 1_000 + WEEK + 1);

		expect(await loadVisit("tok1")).toBeUndefined();
		expect(await getPhoto("leftover")).toBeUndefined();
		expect(deleteStoredPhoto).toHaveBeenCalledWith("file:///leftover.jpg");
	});

	test("a fresh submitted visit is kept, so a reopened link shows its success screen from cache", async () => {
		const done = record({ submitted: submittedAt(1_000) });
		await saveVisit(done);

		await sweepSubmittedVisits([done], 1_000 + WEEK - 1);

		expect(await loadVisit("tok1")).toBeDefined();
	});

	test("an unsubmitted visit is never touched, however old", async () => {
		const rec = record();
		await saveVisit(rec);

		await sweepSubmittedVisits([rec], Number.MAX_SAFE_INTEGER);

		expect(await loadVisit("tok1")).toBeDefined();
	});
});

describe("idempotent submit", () => {
	test("a replayed submit after a lost response completes normally", async () => {
		// The server is idempotent on the visit token: it returns the stored
		// result rather than recording a second visit.
		const rec = record({ submit_requested_at: 1 });
		await saveVisit(rec);

		await pushVisit(rec);
		await pushVisit((await loadVisit("tok1")) as VisitRecord);

		// The second pass sees `submitted` set and does not call again.
		expect(api.submitVisit).toHaveBeenCalledTimes(1);
		expect((await loadVisit("tok1"))?.submitted?.visit_id).toBe("v1");
	});

	test("an already-submitted visit is never pushed again", async () => {
		const rec = record({
			submit_requested_at: 1,
			submitted: { visit_id: "v1", logbook_pdf_url: "u", completed_at: "2026-08-13T00:00:00Z" },
		});
		await saveVisit(rec);
		await pushVisit(rec);
		expect(api.submitVisit).not.toHaveBeenCalled();
	});

	test("a dead link is recorded on the record, so the queue stops offering it", async () => {
		// Found by the basement test: the engine schedules no retry for a
		// permanent failure, but app start, reconnect and foreground all offer
		// the task again - a spent token was re-POSTed ten times in one minute.
		api.submitVisit.mockRejectedValue(new ApiError("dead_end", "This link can't be used.", { status: 410 }));
		const rec = record({ submit_requested_at: 1 });
		await saveVisit(rec);

		await expect(pushVisit(rec)).rejects.toThrow();

		const saved = (await loadVisit("tok1")) as VisitRecord;
		expect(saved.submit_error?.message).toBe("This link can't be used.");
		expect(await visitHasWork(saved)).toBe(false);
	});

	test("a retryable failure leaves the visit in the queue", async () => {
		api.submitVisit.mockRejectedValue(new ApiError("network", "no signal"));
		const rec = record({ submit_requested_at: 1 });
		await saveVisit(rec);

		await expect(pushVisit(rec)).rejects.toThrow();

		const saved = (await loadVisit("tok1")) as VisitRecord;
		expect(saved.submit_error).toBeUndefined();
		expect(await visitHasWork(saved)).toBe(true);
	});

	test("a dead link surfaces as permanent, so the engine stops retrying it", async () => {
		api.submitVisit.mockRejectedValue(new ApiError("dead_end", "This link can't be used.", { status: 410 }));
		const rec = record({ submit_requested_at: 1 });
		await saveVisit(rec);

		const err = await pushVisit(rec).catch((e) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err.retryable).toBe(false);
	});
});

describe("readyToSubmit", () => {
	test("true only when no answer is still waiting for a photo", () => {
		expect(readyToSubmit(record())).toBe(true);
		expect(readyToSubmit(record({ results: withPhoto("c1", "p1") }))).toBe(false);
		expect(
			readyToSubmit(record({ results: { c1: { verdict: "fail", note: "n", severity: "high", photo_ref: "server/x", photo_local_id: null } } })),
		).toBe(true);
	});
});

describe("the engine source", () => {
	test("offers only visits with outstanding work", async () => {
		const done = record({ token: "done", submitted: { visit_id: "v", logbook_pdf_url: "u", completed_at: "x" } });
		const queued = record({ token: "queued", submit_requested_at: 1 });
		const idle = record({ token: "idle" });

		const source = createVisitSource(async () => [done, queued, idle]);
		const tasks = await source.pending();

		expect(tasks.map((t) => t.id)).toEqual(["visit:queued"]);
	});

	test("a visit with photos but no submit still counts as work", async () => {
		await queuePhoto("p1", "photos-only");
		const source = createVisitSource(async () => [record({ token: "photos-only", results: withPhoto("c1", "p1") })]);
		expect(await source.pending()).toHaveLength(1);
	});

	test("visits are not gated on who is signed in - the token is the credential", async () => {
		// Attendance and reports are held while their owner is away, because the
		// broker attributes them to the live JWT. A visit authenticates with its
		// own token, so it must keep sending whoever - if anyone - is signed in;
		// gating it would strand an inspection captured before a sign-out.
		setQueueOwner("somebody-else-entirely");
		try {
			const source = createVisitSource(async () => [record({ token: "queued", submit_requested_at: 1 })]);
			expect((await source.pending()).map((t) => t.id)).toEqual(["visit:queued"]);
		} finally {
			setQueueOwner(null);
		}
	});
});
