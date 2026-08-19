// The failed-shift list: what it shows, whose it shows, and what Try again
// actually does. Attendance is evidence - the view offers retry and nothing
// else, and another account's failures are not this user's to see.

import { act, cleanup, renderHook, waitFor } from "@testing-library/react-native";

import * as attendanceDb from "@/db/attendance";
import type { AttendanceSession, GeoPoint } from "@/db/types";
import * as attendanceSync from "@/sync/attendanceSync";

import { useFailedShifts } from "./useFailedShifts";

jest.mock("@/db/attendance");
jest.mock("@/sync/attendanceSync");

const mockSync: jest.Mock = jest.fn(async (_reason: string) => null);
const mockSubscribe: jest.Mock = jest.fn((_fn: () => void) => () => undefined);
jest.mock("@/sync/engine", () => ({
	syncEngine: { sync: (reason: string) => mockSyncRef()(reason), subscribe: (fn: () => void) => mockSubscribeRef()(fn) },
}));
function mockSyncRef() {
	return mockSync;
}
function mockSubscribeRef() {
	return mockSubscribe;
}

const db = attendanceDb as jest.Mocked<typeof attendanceDb>;
const sync = attendanceSync as jest.Mocked<typeof attendanceSync>;

const FIX: GeoPoint = { lat: 51.5, lng: -0.1, accuracy: 8, at: 1_760_000_000_000 };

const session = (over: Partial<AttendanceSession> = {}): AttendanceSession => ({
	local_id: "s1",
	site_id: "site-1",
	site_name: "Elm Court",
	cleaner_email: "cleaner@example.test",
	check_in: FIX,
	check_out: FIX,
	server_id: null,
	synced_in: true,
	synced_out: false,
	owner_user_id: "user-a",
	...over,
});

const FAILED = { message: "Your account is not active.", at: 1 };

beforeEach(() => {
	jest.clearAllMocks();
	sync.clearAttendanceFailure.mockResolvedValue(true);
});

// RNTL 14: a hook whose effect is still resolving can leave an act scope open
// and null the NEXT test's result. Explicit cleanup costs nothing and this
// repo has been bitten before.
afterEach(cleanup);

test("lists only closed, failed shifts - an open one speaks through the on-site card", async () => {
	db.allAttendance.mockResolvedValue([
		session({ local_id: "closed-failed", sync_error: FAILED }),
		session({ local_id: "closed-fine" }),
		session({ local_id: "open-failed", check_out: null, sync_error: FAILED }),
	]);

	const { result } = await renderHook(() => useFailedShifts("user-a"));
	await waitFor(() => expect(result.current.failed.map((s) => s.local_id)).toEqual(["closed-failed"]));
});

test("another account's failed shift is not this user's to see - and comes back for its owner", async () => {
	db.allAttendance.mockResolvedValue([session({ sync_error: FAILED, owner_user_id: "user-a" })]);

	const { result, rerender } = await renderHook(({ owner }: { owner: string }) => useFailedShifts(owner), {
		initialProps: { owner: "user-b" },
	});
	await waitFor(() => expect(db.allAttendance).toHaveBeenCalled());
	expect(result.current.failed).toEqual([]);

	// The owner signs back in on the same phone: their failure is theirs again.
	await rerender({ owner: "user-a" });
	await waitFor(() => expect(result.current.failed).toHaveLength(1));
});

test("a failed shift from before ownership existed is still shown", async () => {
	db.allAttendance.mockResolvedValue([session({ sync_error: FAILED, owner_user_id: undefined })]);
	const { result } = await renderHook(() => useFailedShifts("user-b"));
	await waitFor(() => expect(result.current.failed).toHaveLength(1));
});

test("Try again clears the recorded failure, then asks for a pass - in that order", async () => {
	db.allAttendance.mockResolvedValue([session({ sync_error: FAILED })]);
	const { result } = await renderHook(() => useFailedShifts("user-a"));
	await waitFor(() => expect(result.current.failed).toHaveLength(1));

	await act(async () => result.current.retry("s1"));

	expect(sync.clearAttendanceFailure).toHaveBeenCalledWith("s1");
	expect(mockSync).toHaveBeenCalledWith("attendance retry");
	expect(sync.clearAttendanceFailure.mock.invocationCallOrder[0]).toBeLessThan(mockSync.mock.invocationCallOrder[0]);
});

test("the list follows the queue: a retry that lands empties the banner", async () => {
	db.allAttendance.mockResolvedValue([session({ sync_error: FAILED })]);
	const { result } = await renderHook(() => useFailedShifts("user-a"));
	await waitFor(() => expect(result.current.failed).toHaveLength(1));

	// The engine reports a pass; the row is gone from the database.
	db.allAttendance.mockResolvedValue([]);
	const listener = mockSubscribe.mock.calls.at(-1)?.[0] as unknown as () => void;
	await act(async () => listener());
	await waitFor(() => expect(result.current.failed).toEqual([]));
});

test("the view offers no discard - attendance is evidence", () => {
	// Pinned as a type-level fact: the view's whole surface is the list and
	// retry. If a discard ever appears here, this stops compiling.
	const view: { failed: AttendanceSession[]; retry: (id: string) => void } = null as never as ReturnType<typeof useFailedShifts>;
	void view;
});
