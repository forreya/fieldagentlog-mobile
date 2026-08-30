// The attendance replay matrix.
//
// Same shape as the B5 visit matrix, because the failure modes are the same:
// the signal dies at every possible point and the record must still arrive
// exactly once. What differs is that a session has two ends and they are
// ordered - a check-out that overtakes its check-in is a 404, since the broker
// finds the session by client_id.

import * as cleanerApi from "@/api/cleaner";
import * as attendanceDb from "@/db/attendance";
import { ApiError } from "@/api/errors";
import type { AttendanceSession, GeoPoint } from "@/db/types";

import { attendanceHasWork, clearAttendanceFailure, createAttendanceSource, pushAttendance } from "./attendanceSync";
import { setQueueOwner } from "./owner";

jest.mock("@/api/cleaner");
jest.mock("@/db/attendance");

const api = cleanerApi as jest.Mocked<typeof cleanerApi>;
const db = attendanceDb as jest.Mocked<typeof attendanceDb>;

const IN: GeoPoint = { lat: 51.5, lng: -0.1, accuracy: 8, at: 1_760_000_000_000 };
const OUT: GeoPoint = { lat: 51.5, lng: -0.1, accuracy: 9, at: 1_760_003_600_000 };

const session = (over: Partial<AttendanceSession> = {}): AttendanceSession => ({
	local_id: "abc-123",
	site_id: "site-1",
	site_name: "Elm Court",
	cleaner_email: "cleaner@example.test",
	check_in: IN,
	check_out: null,
	server_id: null,
	synced_in: false,
	synced_out: false,
	...over,
});

/** What was written to the database, in order. */
const saved = () => db.saveAttendance.mock.calls.map(([s]) => s);

beforeEach(() => {
	jest.clearAllMocks();
	api.checkIn.mockResolvedValue("server-1");
	api.checkOut.mockResolvedValue(3600);
	// The push path re-reads the current row before persisting progress, so the
	// merge cannot clobber a concurrent UI write. An empty read falls back to
	// the pass's own snapshot - the behaviour every test below assumes.
	db.allAttendance.mockResolvedValue([]);
});

describe("what still owes the server something", () => {
	test.each([
		["a fresh check-in", session(), true],
		["on site, check-in sent", session({ synced_in: true }), false],
		["checked out, neither sent", session({ check_out: OUT }), true],
		["checked out, check-in sent", session({ synced_in: true, check_out: OUT }), true],
		["both ends sent", session({ synced_in: true, check_out: OUT, synced_out: true }), false],
	])("%s", (_name, s, expected) => {
		expect(attendanceHasWork(s)).toBe(expected);
	});
});

test("a check-in is sent and its server id persisted before anything else", async () => {
	await pushAttendance(session());

	expect(api.checkIn).toHaveBeenCalledWith("abc-123", "site-1", IN);
	expect(saved()[0]).toMatchObject({ server_id: "server-1", synced_in: true });
	expect(api.checkOut).not.toHaveBeenCalled();
});

test("still on site: nothing more is owed after the check-in lands", async () => {
	await pushAttendance(session());
	expect(api.checkOut).not.toHaveBeenCalled();
	expect(db.deleteAttendance).not.toHaveBeenCalled();
});

test("both ends go up in order, and the local row is dropped afterwards", async () => {
	await pushAttendance(session({ check_out: OUT }));

	expect(api.checkIn).toHaveBeenCalledTimes(1);
	expect(api.checkOut).toHaveBeenCalledWith("abc-123", OUT);
	expect(saved().at(-1)).toMatchObject({ synced_in: true, synced_out: true });
	expect(db.deleteAttendance).toHaveBeenCalledWith("abc-123");
});

test("a check-in already sent is not sent twice when the check-out follows", async () => {
	await pushAttendance(session({ synced_in: true, server_id: "server-1", check_out: OUT }));

	expect(api.checkIn).not.toHaveBeenCalled();
	expect(api.checkOut).toHaveBeenCalledTimes(1);
});

test("the signal dying between the two ends costs the check-in nothing", async () => {
	// The exact case the ordering exists for: check-in lands, check-out fails.
	// The next pass must resume at the check-out, not repeat the check-in.
	api.checkOut.mockRejectedValueOnce(new ApiError("network", "No signal."));

	await expect(pushAttendance(session({ check_out: OUT }))).rejects.toThrow("No signal.");

	expect(api.checkIn).toHaveBeenCalledTimes(1);
	const afterFirstPass = saved().at(-1) as AttendanceSession;
	expect(afterFirstPass).toMatchObject({ synced_in: true, synced_out: false });
	expect(db.deleteAttendance).not.toHaveBeenCalled();

	jest.clearAllMocks();
	api.checkOut.mockResolvedValue(3600);
	await pushAttendance(afterFirstPass);

	expect(api.checkIn).not.toHaveBeenCalled();
	expect(api.checkOut).toHaveBeenCalledTimes(1);
	expect(db.deleteAttendance).toHaveBeenCalledWith("abc-123");
});

test("a failed check-in leaves the session exactly as it was", async () => {
	api.checkIn.mockRejectedValue(new ApiError("network", "No signal."));

	await expect(pushAttendance(session())).rejects.toThrow("No signal.");

	expect(db.saveAttendance).not.toHaveBeenCalled();
	expect(api.checkOut).not.toHaveBeenCalled();
});

test("a replayed check-in keeps whatever id the server hands back", async () => {
	// The broker returns the EXISTING session id for a repeated client_id, so a
	// retry after a lost response converges rather than creating a second visit.
	api.checkIn.mockResolvedValue("server-original");

	await pushAttendance(session());

	expect(saved()[0]).toMatchObject({ server_id: "server-original" });
});

describe("the source", () => {
	test("offers one task per session that owes something, id'd by local id", async () => {
		const source = createAttendanceSource(async () => [
			session({ local_id: "a" }),
			session({ local_id: "b", synced_in: true }), // on site, nothing owed
			session({ local_id: "c", synced_in: true, check_out: OUT }),
		]);

		const tasks = await source.pending();

		expect(source.name).toBe("attendance");
		expect(tasks.map((t) => t.id)).toEqual(["attendance:a", "attendance:c"]);
	});

	test("an empty device offers no work", async () => {
		const source = createAttendanceSource(async () => []);
		expect(await source.pending()).toEqual([]);
	});
});

describe("who a session belongs to", () => {
	// The broker attributes both ends to the JWT that carries them, and refuses
	// a check-out for somebody else's session outright. So another account's
	// queued shift is HELD - never sent as the wrong person, and never recorded
	// as permanently failed just because the wrong person is signed in.
	afterEach(() => setQueueOwner(null));

	test("another account's session is held, not offered and not failed", async () => {
		setQueueOwner("user-b");
		const source = createAttendanceSource(async () => [session({ local_id: "a", owner_user_id: "user-a" })]);

		expect(await source.pending()).toEqual([]);
		// Held means untouched: nothing recorded a failure on it.
		expect(db.saveAttendance).not.toHaveBeenCalled();
	});

	test("the same session is offered again when its owner signs back in", async () => {
		const rows = async () => [session({ local_id: "a", owner_user_id: "user-a" })];

		setQueueOwner("user-b");
		expect(await createAttendanceSource(rows).pending()).toEqual([]);

		setQueueOwner("user-a");
		expect((await createAttendanceSource(rows).pending()).map((t) => t.id)).toEqual(["attendance:a"]);
	});

	test("a session from before ownership existed still goes up under whoever is signed in", async () => {
		// Rows written by older builds have no owner. Holding them forever would
		// be data loss; sending them is exactly what every install did before.
		setQueueOwner("user-b");
		const source = createAttendanceSource(async () => [session({ local_id: "legacy" })]);
		expect((await source.pending()).map((t) => t.id)).toEqual(["attendance:legacy"]);
	});

	test("with nobody signed in, owned work waits", async () => {
		// Cold start runs a pass before the stored session is adopted; the
		// sign-in that follows triggers another, so holding here loses nothing.
		const source = createAttendanceSource(async () => [session({ local_id: "a", owner_user_id: "user-a" })]);
		expect(await source.pending()).toEqual([]);
	});
});

describe("a failure retrying cannot fix", () => {
	// Reachable in production: cleaner_attendance cascades on block deletion, so
	// a block removed while somebody is checked in leaves a check-out that can
	// only ever 404. Without this the queue re-POSTs it on every app start,
	// every reconnect and every foreground, forever.
	// "invalid" is the kind for a request the server refused; retryable is
	// derived from the kind, not passed, so this really is non-retryable.
	const permanent = () => new ApiError("invalid", "No check-in found for this visit.");

	test("is recorded on the session and never offered again", async () => {
		api.checkOut.mockRejectedValue(permanent());

		await expect(pushAttendance(session({ synced_in: true, server_id: "s1", check_out: OUT }))).rejects.toThrow();

		const stored = saved().at(-1) as AttendanceSession;
		expect(stored.sync_error?.message).toBe("No check-in found for this visit.");
		expect(attendanceHasWork(stored)).toBe(false);
	});

	test("a check-in that landed first is not thrown away", async () => {
		// The subtle one: recording the error against the ORIGINAL session would
		// lose synced_in, and the next pass would send the check-in a second time.
		api.checkOut.mockRejectedValue(permanent());

		await expect(pushAttendance(session({ check_out: OUT }))).rejects.toThrow();

		const stored = saved().at(-1) as AttendanceSession;
		expect(stored.synced_in).toBe(true);
		expect(stored.server_id).toBe("server-1");
		expect(stored.sync_error).toBeTruthy();
	});

	test("a retryable failure is NOT recorded - it should keep trying", async () => {
		api.checkOut.mockRejectedValue(new ApiError("network", "No signal."));

		await expect(pushAttendance(session({ synced_in: true, check_out: OUT }))).rejects.toThrow();

		expect(saved().every((s) => !s.sync_error)).toBe(true);
	});

	test("the record is kept, not deleted - it is still evidence of a shift", async () => {
		api.checkOut.mockRejectedValue(permanent());

		await expect(pushAttendance(session({ synced_in: true, check_out: OUT }))).rejects.toThrow();

		expect(db.deleteAttendance).not.toHaveBeenCalled();
	});
});

test("a shift queued while signed out is kept sendable", async () => {
	// Same rule as reports: `auth` is not retryable as-is, but a sign-in fixes
	// it, and a cleaner's shift must not be discarded because a token lapsed.
	api.checkOut.mockRejectedValue(new ApiError("auth", "You're not signed in."));

	await expect(pushAttendance(session({ synced_in: true, check_out: OUT }))).rejects.toThrow();

	expect(saved().every((s) => !s.sync_error)).toBe(true);
});

describe("a check-out written while the pass is in flight", () => {
	// The race: the engine snapshots the session, sends the check-in, and only
	// then persists. If the cleaner checks out during that round-trip, a
	// whole-row save of the snapshot erases the check-out - and with synced_in
	// now true and check_out null, attendanceHasWork never offers it again.
	// The shift would end on the server only when the app happened to replay it,
	// which is never.

	/** A real store under the mocks, so the interleaving actually interleaves. */
	function backingStore(initial: AttendanceSession): Map<string, AttendanceSession> {
		const store = new Map<string, AttendanceSession>([[initial.local_id, initial]]);
		db.saveAttendance.mockImplementation(async (s) => void store.set(s.local_id, s));
		db.allAttendance.mockImplementation(async () => [...store.values()]);
		db.deleteAttendance.mockImplementation(async (id) => void store.delete(id));
		return store;
	}

	test("survives the check-in round-trip and goes up in the same pass", async () => {
		const fresh = session();
		const store = backingStore(fresh);

		// Hold the check-in open so the UI can write underneath it.
		let land!: (id: string) => void;
		api.checkIn.mockImplementation(() => new Promise((resolve) => (land = resolve)));
		const pass = pushAttendance(fresh);

		// Exactly what useEndVisit does: spread ITS copy, add the check-out, save.
		await db.saveAttendance({ ...fresh, check_out: OUT });
		land("server-1");
		await pass;

		// The merge kept the check-out alongside the pass's own progress...
		expect(saved().at(-1)).toMatchObject({ check_out: OUT, synced_in: true, synced_out: true });
		// ...and the same pass sent it and retired the row.
		expect(api.checkOut).toHaveBeenCalledWith("abc-123", OUT);
		expect(db.deleteAttendance).toHaveBeenCalledWith("abc-123");
		expect(store.has("abc-123")).toBe(false);
	});

	test("a permanent check-in failure recorded mid-race keeps the check-out too", async () => {
		const fresh = session();
		backingStore(fresh);

		let refuse!: (err: Error) => void;
		api.checkIn.mockImplementation(() => new Promise((_resolve, reject) => (refuse = reject)));
		const pass = pushAttendance(fresh);

		await db.saveAttendance({ ...fresh, check_out: OUT });
		refuse(new ApiError("invalid", "Your account is not active."));
		await expect(pass).rejects.toThrow();

		// The failure went on the CURRENT row, not the pass's stale snapshot:
		// the check-out is still there for Try again to send.
		expect(saved().at(-1)).toMatchObject({ check_out: OUT, sync_error: { message: "Your account is not active." } });
	});
});

describe("manual recovery - and the absence of anything else", () => {
	// Attendance is evidence: clearAttendanceFailure is the ONLY recovery this
	// module offers. There is no discard, by decision - a shift record that
	// could not be sent stays on the phone until it can be, or until an
	// explicit support mechanism reconciles it.
	const failed = () => session({ check_out: OUT, synced_in: true, sync_error: { message: "Your account is not active.", at: 1 } });

	test("Try again clears the failure and the session is eligible again - exactly once", async () => {
		db.allAttendance.mockResolvedValue([failed()]);

		expect(await clearAttendanceFailure("abc-123")).toBe(true);
		const cleared = db.saveAttendance.mock.calls[0][0];
		expect(cleared.sync_error).toBeUndefined();
		expect(attendanceHasWork(cleared)).toBe(true);

		// A second tap finds nothing recorded and changes nothing.
		db.allAttendance.mockResolvedValue([cleared]);
		expect(await clearAttendanceFailure("abc-123")).toBe(false);
		expect(db.saveAttendance).toHaveBeenCalledTimes(1);
	});

	test("clearing a session that is not failed, or is gone, is a no-op", async () => {
		db.allAttendance.mockResolvedValue([session()]);
		expect(await clearAttendanceFailure("abc-123")).toBe(false);

		db.allAttendance.mockResolvedValue([]);
		expect(await clearAttendanceFailure("abc-123")).toBe(false);
		expect(db.saveAttendance).not.toHaveBeenCalled();
	});

	test("retrying after the account is put right records the shift once", async () => {
		// The whole point of Try again: the broker's refusal was account state,
		// the managing agent fixed it, and the identical payload goes through -
		// idempotent on the client id, so a replay cannot double-record.
		db.allAttendance.mockResolvedValue([failed()]);
		await clearAttendanceFailure("abc-123");
		const cleared = db.saveAttendance.mock.calls[0][0];

		await pushAttendance(cleared);
		expect(api.checkOut).toHaveBeenCalledWith("abc-123", OUT);
		expect(db.deleteAttendance).toHaveBeenCalledWith("abc-123");
	});

	test("nothing in this module can delete an unsent shift", () => {
		// Pinning the decision, not just the code: deleteAttendance is called
		// only by the push path once BOTH ends are on the server.
		expect(db.deleteAttendance).not.toHaveBeenCalled();
	});
});
