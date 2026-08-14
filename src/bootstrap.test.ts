// What survives a force-stop.
//
// Both of these were real: the engine's visit source and the photo sweep both
// read a Set of tokens that only the wizard filled in, so on the next cold
// start the app believed it was holding nothing at all. An inspection queued in
// a basement never sent itself, and the startup sweep deleted the photos of any
// visit that had not been reopened - while the summary screen was telling its
// owner they could close the app.

import * as SQLite from "expo-sqlite";

import { getDatabase, resetDatabase } from "@/db/database";
import { addPendingPhoto } from "@/db/photos";
import { sweepOrphans } from "@/db/photoStore";
import type { PendingPhoto, VisitRecord } from "@/db/types";
import { allVisits, saveVisit } from "@/db/visits";
import { syncEngine } from "@/sync/engine";
import { createVisitSource } from "@/sync/visitSync";

import { bootstrap, resetBootstrap } from "./bootstrap";

jest.mock("expo-sqlite");
jest.mock("@/db/photoStore", () => ({ sweepOrphans: jest.fn(), deleteStoredPhoto: jest.fn() }));
jest.mock("@/sync/triggers", () => ({ startSyncTriggers: () => () => undefined }));
jest.mock("@/api/visit");

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const sweep = sweepOrphans as jest.Mock;

const record = (over: Partial<VisitRecord> = {}): VisitRecord => ({
	token: "queued-in-a-basement",
	packet: {},
	inspector: { name: "Sam Okonkwo", email: "sam@company.co.uk" },
	results: { c1: { verdict: "pass", note: "", severity: null, photo_ref: null, photo_local_id: null } },
	fra_updates: {},
	started_at: 1_000,
	updated_at: 1_000,
	submit_requested_at: 2_000,
	submitted: null,
	...over,
});

const photo = (over: Partial<PendingPhoto> = {}): PendingPhoto => ({
	local_id: "p1",
	token: "queued-in-a-basement",
	check_id: "c1",
	file: { uri: "file:///photos/p1.jpg", name: "p1.jpg", type: "image/jpeg" },
	ref: null,
	created_at: 1_000,
	...over,
});

beforeEach(() => {
	resetDatabase();
	__resetAllDatabases();
	resetBootstrap();
	syncEngine.reset();
	jest.clearAllMocks();
});

describe("a visit queued before the app was killed", () => {
	test("is offered to the engine on the next launch, with nothing in memory", async () => {
		// Nothing calls trackVisit here, and nothing has opened the visit: this
		// is a cold start, which is exactly when it used to be invisible.
		await saveVisit(record());

		const source = createVisitSource(allVisits);
		const tasks = await source.pending();

		expect(tasks.map((t) => t.id)).toEqual(["visit:queued-in-a-basement"]);
	});

	test("a submitted one is not offered again", async () => {
		await saveVisit(record({ submitted: { visit_id: "v1", logbook_pdf_url: "u", completed_at: "x" } }));
		expect(await (await createVisitSource(allVisits)).pending()).toHaveLength(0);
	});
});

describe("the startup photo sweep", () => {
	test("keeps photos belonging to a visit this launch has never opened", async () => {
		await saveVisit(record());
		await addPendingPhoto(photo());

		await bootstrap();
		// bootstrap fires the sweep without waiting for it.
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(sweep).toHaveBeenCalledTimes(1);
		expect([...sweep.mock.calls[0][0]]).toEqual(["file:///photos/p1.jpg"]);
	});

	test("still sweeps when the device holds nothing, rather than skipping", async () => {
		await bootstrap();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(sweep).toHaveBeenCalledWith([]);
	});
});

describe("allVisits", () => {
	test("returns every record, most recently written first", async () => {
		// The column is the write time, not the record's own stamp, so the clock
		// has to move for the ordering to mean anything.
		const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
		await saveVisit(record({ token: "older" }));
		now.mockReturnValue(2_000);
		await saveVisit(record({ token: "newer" }));
		now.mockRestore();

		expect((await allVisits()).map((v) => v.token)).toEqual(["newer", "older"]);
	});

	test("one unreadable row does not hide the others", async () => {
		await saveVisit(record({ token: "good" }));
		const db = await getDatabase();
		await db.runAsync("INSERT OR REPLACE INTO visits (token, record, updated_at) VALUES (?, ?, ?)", "bad", "{not json", 99);

		expect((await allVisits()).map((v) => v.token)).toEqual(["good"]);
	});
});
