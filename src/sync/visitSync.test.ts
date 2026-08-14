// The replay matrix: what happens when the network fails at each point of a
// visit push, and what must be true when it comes back. These are the tests
// that protect work nobody can recreate.

import * as SQLite from "expo-sqlite";

import { ApiError } from "@/api/errors";
import * as visitApi from "@/api/visit";
import { resetDatabase } from "@/db/database";
import { addPendingPhoto, getPhoto, pendingPhotosForToken } from "@/db/photos";
import type { VisitRecord } from "@/db/types";
import { loadVisit, saveVisit } from "@/db/visits";

import { createVisitSource, pushVisit, readyToSubmit, visitHasWork } from "./visitSync";

jest.mock("expo-sqlite");
jest.mock("@/api/visit");
jest.mock("@/db/photoStore", () => ({ deleteStoredPhoto: jest.fn() }));

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

async function queuePhoto(localId: string, token = "tok1") {
	await addPendingPhoto({
		local_id: localId,
		token,
		check_id: "c1",
		file: { uri: `file:///${localId}.jpg`, name: `${localId}.jpg`, type: "image/jpeg" },
		ref: null,
		created_at: Date.now(),
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
		await queuePhoto("orphan");
		const rec = record({ results: { c1: { verdict: "pass", note: "", severity: null, photo_ref: null, photo_local_id: null } } });
		await saveVisit(rec);

		await pushVisit(rec);

		expect(api.uploadPhoto).not.toHaveBeenCalled();
		expect(await getPhoto("orphan")).toBeUndefined();
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
});
