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

import { attendanceHasWork, createAttendanceSource, pushAttendance } from "./attendanceSync";

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
