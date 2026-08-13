// DAO tests, run against real SQLite via __mocks__/expo-sqlite.
// These cover the queues that hold work nobody can recreate: an inspector's
// answers, a cleaner's attendance, a report someone has already walked away from.

import * as SQLite from "expo-sqlite";

import { allAttendance, deleteAttendance, saveAttendance } from "./attendance";
import { getDatabase, LATEST_VERSION, migrate, MIGRATIONS, resetDatabase } from "./database";
import { addPendingPhoto, allPhotosForToken, deletePhoto, getPhoto, pendingPhotosForToken, setPhotoRef } from "./photos";
import { allReports, deleteReport, getReport, saveReport } from "./reports";
import type { AttendanceSession, PendingPhoto, PendingReport, VisitRecord } from "./types";
import { loadVisit, saveVisit } from "./visits";

jest.mock("expo-sqlite");

// The reset helper exists only on the mock (__mocks__/expo-sqlite.ts). It must
// be reached through the package specifier: importing the mock file by path
// creates a second module identity, and the code under test then gets jest's
// automock instead of this one - which fails as "openDatabaseAsync returned
// undefined", a long way from the actual cause.
const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

beforeEach(() => {
	resetDatabase();
	__resetAllDatabases();
});

const visit = (over: Partial<VisitRecord> = {}): VisitRecord => ({
	token: "tok1",
	packet: { visit: { id: "v1" }, checks: [] },
	inspector: { name: "A Smith", email: "a@example.com" },
	results: { c1: { verdict: "fail", note: "Door blocked", severity: "high", photo_ref: null, photo_local_id: "p1" } },
	fra_updates: {},
	started_at: 1_000,
	updated_at: 2_000,
	submitted: null,
	...over,
});

const photo = (over: Partial<PendingPhoto> = {}): PendingPhoto => ({
	local_id: "p1",
	token: "tok1",
	check_id: "c1",
	file: { uri: "file:///tmp/p1.jpg", name: "p1.jpg", type: "image/jpeg" },
	ref: null,
	created_at: 1_000,
	...over,
});

const session = (over: Partial<AttendanceSession> = {}): AttendanceSession => ({
	local_id: "s1",
	site_id: "b1",
	site_name: "Elm Court",
	cleaner_email: "c@example.com",
	check_in: { lat: 51.5, lng: -0.1, accuracy: 8, at: 1_000 },
	check_out: null,
	server_id: null,
	synced_in: false,
	synced_out: false,
	...over,
});

const report = (over: Partial<PendingReport> = {}): PendingReport => ({
	local_id: "r1",
	site_id: "b1",
	site_name: "Elm Court",
	category: "repairs",
	note: "Door closer has gone",
	photos: [{ local_id: "rp1", file: { uri: "file:///tmp/r.jpg", name: "r.jpg", type: "image/jpeg" }, ref: null }],
	at: 1_000,
	point: null,
	attendance_client_id: null,
	...over,
});

describe("migrations", () => {
	test("an empty database reaches the latest version", async () => {
		const db = await getDatabase();
		const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
		expect(row?.user_version).toBe(LATEST_VERSION);
	});

	test("running again is a no-op - a phone opens the app many times", async () => {
		const db = await getDatabase();
		await saveVisit(visit());
		const after = await migrate(db);
		expect(after).toBe(LATEST_VERSION);
		// Crucially, re-migrating did not wipe the queued work.
		expect(await loadVisit("tok1")).toBeDefined();
	});

	test("migrating a database that already holds data preserves it", async () => {
		await saveVisit(visit());
		await saveReport(report());
		// Simulate the next app launch against the same file.
		resetDatabase();
		expect(await loadVisit("tok1")).toBeDefined();
		expect(await allReports()).toHaveLength(1);
	});

	test("versions are unique and ordered, so none can be skipped", () => {
		const versions = MIGRATIONS.map((m) => m.version);
		expect(new Set(versions).size).toBe(versions.length);
		expect(versions).toEqual([...versions].sort((a, b) => a - b));
	});
});

describe("visits", () => {
	test("round-trips a record, nested answers and all", async () => {
		await saveVisit(visit());
		const loaded = await loadVisit("tok1");
		expect(loaded?.results.c1.note).toBe("Door blocked");
		expect(loaded?.inspector.email).toBe("a@example.com");
	});

	test("saving the same token replaces rather than duplicating", async () => {
		await saveVisit(visit());
		await saveVisit(visit({ inspector: { name: "B Jones", email: "b@example.com" } }));

		const db = await getDatabase();
		const rows = await db.getAllAsync<{ token: string }>("SELECT token FROM visits");
		expect(rows).toHaveLength(1);
		expect((await loadVisit("tok1"))?.inspector.name).toBe("B Jones");
	});

	test("an unknown token is undefined, not an error", async () => {
		expect(await loadVisit("nope")).toBeUndefined();
	});

	test("a corrupt row reads as no cache instead of dead-ending the app", async () => {
		const db = await getDatabase();
		await db.runAsync("INSERT INTO visits (token, record, updated_at) VALUES (?, ?, ?)", "bad", "{not json", 1);
		expect(await loadVisit("bad")).toBeUndefined();
	});
});

describe("photos", () => {
	test("round-trips, keeping the file path rather than any bytes", async () => {
		await addPendingPhoto(photo());
		const loaded = await getPhoto("p1");
		expect(loaded?.file).toEqual({ uri: "file:///tmp/p1.jpg", name: "p1.jpg", type: "image/jpeg" });
		expect(loaded?.ref).toBeNull();
	});

	test("pending means 'no server ref yet', and an uploaded photo drops out", async () => {
		await addPendingPhoto(photo({ local_id: "p1" }));
		await addPendingPhoto(photo({ local_id: "p2", created_at: 2_000 }));
		expect(await pendingPhotosForToken("tok1")).toHaveLength(2);

		await setPhotoRef("p1", "org/visit/p1.jpg");

		const pending = await pendingPhotosForToken("tok1");
		expect(pending.map((p) => p.local_id)).toEqual(["p2"]);
		// The uploaded one still exists - it is just no longer pending.
		expect((await getPhoto("p1"))?.ref).toBe("org/visit/p1.jpg");
	});

	test("pending photos come back oldest first, so uploads follow capture order", async () => {
		await addPendingPhoto(photo({ local_id: "late", created_at: 5_000 }));
		await addPendingPhoto(photo({ local_id: "early", created_at: 1_000 }));
		expect((await pendingPhotosForToken("tok1")).map((p) => p.local_id)).toEqual(["early", "late"]);
	});

	test("photos are scoped to their own visit", async () => {
		await addPendingPhoto(photo({ local_id: "mine" }));
		await addPendingPhoto(photo({ local_id: "theirs", token: "other" }));
		expect((await pendingPhotosForToken("tok1")).map((p) => p.local_id)).toEqual(["mine"]);
		expect(await allPhotosForToken("other")).toHaveLength(1);
	});

	test("deleting removes only that photo", async () => {
		await addPendingPhoto(photo({ local_id: "p1" }));
		await addPendingPhoto(photo({ local_id: "p2" }));
		await deletePhoto("p1");
		expect(await getPhoto("p1")).toBeUndefined();
		expect(await getPhoto("p2")).toBeDefined();
	});

	test("re-adding the same id replaces it, so a retaken photo cannot duplicate", async () => {
		await addPendingPhoto(photo());
		await addPendingPhoto(photo({ file: { uri: "file:///tmp/retake.jpg", name: "retake.jpg", type: "image/jpeg" } }));
		expect(await allPhotosForToken("tok1")).toHaveLength(1);
		expect((await getPhoto("p1"))?.file.name).toBe("retake.jpg");
	});
});

describe("attendance", () => {
	test("round-trips both geo-stamped ends", async () => {
		await saveAttendance(session({ check_out: { lat: 51.6, lng: -0.2, accuracy: 12, at: 9_000 } }));
		const [held] = await allAttendance();
		expect(held.check_in.accuracy).toBe(8);
		expect(held.check_out?.at).toBe(9_000);
	});

	test("saving again updates the same session rather than adding a second", async () => {
		await saveAttendance(session());
		await saveAttendance(session({ synced_in: true, server_id: "srv1" }));
		const all = await allAttendance();
		expect(all).toHaveLength(1);
		expect(all[0].server_id).toBe("srv1");
	});

	test("deleting clears a fully-synced visit", async () => {
		await saveAttendance(session());
		await deleteAttendance("s1");
		expect(await allAttendance()).toHaveLength(0);
	});
});

describe("reports", () => {
	test("round-trips with its photo list", async () => {
		await saveReport(report());
		const loaded = await getReport("r1");
		expect(loaded?.note).toBe("Door closer has gone");
		expect(loaded?.photos).toHaveLength(1);
		expect(loaded?.photos[0].ref).toBeNull();
	});

	test("saving again keeps one row, so refs recorded mid-upload are not duplicated", async () => {
		await saveReport(report());
		await saveReport(
			report({
				photos: [
					{
						local_id: "rp1",
						file: { uri: "file:///tmp/r.jpg", name: "r.jpg", type: "image/jpeg" },
						ref: { path: "p", file_name: "r.jpg", content_type: "image/jpeg" },
					},
				],
			}),
		);
		const all = await allReports();
		expect(all).toHaveLength(1);
		expect(all[0].photos[0].ref).not.toBeNull();
	});

	test("a failed save THROWS - the reporter must never be told 'saved' falsely", async () => {
		// The one queue that does not swallow write errors. Someone has walked
		// away from the problem by now; a silent loss is unrecoverable.
		const db = await getDatabase();
		await db.execAsync("DROP TABLE reports");
		await expect(saveReport(report())).rejects.toThrow();
	});

	test("deleting clears a report the server has accepted", async () => {
		await saveReport(report());
		await deleteReport("r1");
		expect(await allReports()).toHaveLength(0);
		expect(await getReport("r1")).toBeUndefined();
	});

	test("reading falls back to empty rather than throwing, so the queue UI still renders", async () => {
		const db = await getDatabase();
		await db.execAsync("DROP TABLE reports");
		expect(await allReports()).toEqual([]);
	});
});
