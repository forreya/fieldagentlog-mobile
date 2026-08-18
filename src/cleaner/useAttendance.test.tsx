// Checking in and out, and every way the GPS fix can refuse.
//
// The rule under test: persist first, sync second, and never block the timer on
// a network that may not be there. The one thing that DOES stop a check-in is a
// missing position - an attendance record without one is a claim, not evidence.

import { act, cleanup, renderHook, waitFor } from "@testing-library/react-native";

import * as attendanceDb from "@/db/attendance";
import type { AttendanceSession } from "@/db/types";
import * as position from "@/lib/position";
import { syncEngine } from "@/sync/engine";

import * as cleanerApi from "@/api/cleaner";
import { router } from "expo-router";

import * as handoffModule from "./handoff";
import { openSession, useAttendance } from "./useAttendance";

jest.mock("@/db/attendance");
jest.mock("expo-crypto", () => {
	let n = 0;
	return { randomUUID: () => `uuid-${++n}` };
});
jest.mock("@/lib/position");
jest.mock("@/sync/engine", () => ({ syncEngine: { sync: jest.fn(), subscribe: jest.fn(() => () => undefined) } }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/api/cleaner");
jest.mock("./handoff");

const db = attendanceDb as jest.Mocked<typeof attendanceDb>;
const geo = position as jest.Mocked<typeof position>;
const engine = syncEngine as unknown as { sync: jest.Mock; subscribe: jest.Mock };
const api = cleanerApi as jest.Mocked<typeof cleanerApi>;
const handoff = handoffModule as jest.Mocked<typeof handoffModule>;

const FIX = { lat: 51.5, lng: -0.1, accuracy: 8, at: 1_760_000_000_000 };

beforeEach(() => {
	jest.clearAllMocks();
	// resetMocks wipes implementations, including the one the jest.mock factory
	// gave subscribe. Without this the hook's effect gets undefined back.
	engine.subscribe.mockImplementation(() => () => undefined);
	db.allAttendance.mockResolvedValue([]);
	db.saveAttendance.mockResolvedValue(undefined);
	geo.captureFix.mockResolvedValue({ status: "ok", fix: FIX });
	geo.fixMessage.mockImplementation((o) => (o.status === "ok" ? null : `message for ${o.status}`));
	api.startFireChecks.mockResolvedValue("fire-token");
	handoff.markHandoff.mockResolvedValue(undefined);
});

// RNTL 14 unmounts between tests, but a hook whose effect is still resolving a
// promise can leave an act scope open and null the NEXT test's result. Being
// explicit costs nothing and has bitten this repo before.
afterEach(cleanup);

async function mounted() {
	const view = await renderHook(() => useAttendance("cleaner@example.test"));
	await waitFor(() => expect(db.allAttendance).toHaveBeenCalled());
	return view;
}

test("checking in saves before it syncs, and the timer starts immediately", async () => {
	const { result } = await mounted();

	await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));

	const saved = db.saveAttendance.mock.calls[0][0];
	expect(saved).toMatchObject({ site_id: "site-1", site_name: "Elm Court", check_in: FIX, check_out: null, synced_in: false });
	expect(result.current.active).toMatchObject({ site_name: "Elm Court" });
	// Persisted before the engine is asked to do anything about it. Order, not
	// just occurrence: a sync that runs first has nothing to find.
	expect(db.saveAttendance.mock.invocationCallOrder[0]).toBeLessThan(engine.sync.mock.invocationCallOrder[0]);
});

test("the local id is the idempotency key, and it is not reused", async () => {
	const { result } = await mounted();
	await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));
	const first = (db.saveAttendance.mock.calls[0][0] as AttendanceSession).local_id;

	expect(first).toMatch(/^uuid-\d+$/);
	expect(result.current.active?.local_id).toBe(first);
});

test("checking out records the second fix and clears the on-site card", async () => {
	const { result } = await mounted();
	await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));

	const outFix = { ...FIX, at: FIX.at + 3_600_000, accuracy: 12 };
	geo.captureFix.mockResolvedValue({ status: "ok", fix: outFix });
	await act(async () => void (await result.current.checkOut()));

	expect(result.current.active).toBeNull();
	expect(result.current.justClosed).toMatchObject({ check_out: outFix });
	expect(db.saveAttendance).toHaveBeenLastCalledWith(expect.objectContaining({ check_out: outFix }));
});

describe("when the fix will not come", () => {
	test.each([["denied"], ["unavailable"], ["timeout"]] as const)("a %s fix stops the check-in and says why", async (status) => {
		geo.captureFix.mockResolvedValue({ status } as never);
		const { result } = await mounted();

		await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));

		expect(result.current.error).toBe(`message for ${status}`);
		expect(result.current.active).toBeNull();
		// Nothing written and nothing queued: there is no record to make.
		expect(db.saveAttendance).not.toHaveBeenCalled();
		expect(engine.sync).not.toHaveBeenCalled();
	});

	test("a failed fix at check-out leaves the cleaner on site", async () => {
		// Losing the session because the sky was cloudy would be worse than
		// making them try again: the check-in is still real and still open.
		const { result } = await mounted();
		await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));

		geo.captureFix.mockResolvedValue({ status: "timeout" });
		await act(async () => void (await result.current.checkOut()));

		expect(result.current.active).not.toBeNull();
		expect(result.current.justClosed).toBeNull();
		expect(result.current.error).toBe("message for timeout");
	});

	test("the error can be dismissed and does not stop a retry", async () => {
		geo.captureFix.mockResolvedValueOnce({ status: "timeout" });
		const { result } = await mounted();
		await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));
		expect(result.current.error).toBeTruthy();

		await act(async () => result.current.dismissError());
		expect(result.current.error).toBeNull();

		await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));
		expect(result.current.active).not.toBeNull();
	});
});

test("an open session is restored after a force-stop", async () => {
	// The phone is the only thing that knows someone is still on site.
	const open: AttendanceSession = {
		local_id: "abc",
		site_id: "s1",
		site_name: "Elm Court",
		cleaner_email: null,
		check_in: FIX,
		check_out: null,
		server_id: "srv",
		synced_in: true,
		synced_out: false,
	};
	db.allAttendance.mockResolvedValue([open]);

	const { result } = await renderHook(() => useAttendance(null));

	await waitFor(() => expect(result.current.active).toMatchObject({ local_id: "abc" }));
});

test("checking in is refused while already on site", async () => {
	const { result } = await mounted();
	await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));
	// Only the call record, not the implementations: clearAllMocks here would
	// strip the resolved values the hook's own effects still depend on.
	db.saveAttendance.mockClear();

	await act(async () => void (await result.current.checkIn("site-2", "Cedar Point")));

	expect(db.saveAttendance).not.toHaveBeenCalled();
	expect(result.current.active?.site_name).toBe("Elm Court");
});

describe("openSession", () => {
	const closed = { check_out: FIX } as AttendanceSession;
	const open = { check_out: null, local_id: "open" } as AttendanceSession;

	test("finds the one still running", () => {
		expect(openSession([closed, open])?.local_id).toBe("open");
	});

	test("returns null when every session is finished", () => {
		expect(openSession([closed, closed])).toBeNull();
	});
});

describe("following the queue", () => {
	/** Drive the engine listener the hook registered. */
	async function emit() {
		const listener = engine.subscribe.mock.calls.at(-1)?.[0] as (s: { status: string }) => void;
		await act(async () => listener({ status: "idle" }));
	}

	test("the on-site card stops saying 'saved on this phone' once the check-in lands", async () => {
		// The bug this exists for: the queue updates the row, the screen keeps a
		// copy from before, and a cleaner is told their attendance is stuck.
		const { result } = await mounted();
		await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));
		expect(result.current.active?.synced_in).toBe(false);

		const sent = { ...(result.current.active as AttendanceSession), synced_in: true, server_id: "srv" };
		db.allAttendance.mockResolvedValue([sent]);

		await emit();

		await waitFor(() => expect(result.current.active?.synced_in).toBe(true));
	});

	test("a closed session the queue has finished with counts as fully sent", async () => {
		const { result } = await mounted();
		await act(async () => void (await result.current.checkIn("site-1", "Elm Court")));
		await act(async () => void (await result.current.checkOut()));
		expect(result.current.justClosed?.synced_out).toBe(false);

		// Both ends up: attendanceSync deletes the local row, and that absence is
		// the proof.
		db.allAttendance.mockResolvedValue([]);
		await emit();

		await waitFor(() => expect(result.current.justClosed?.synced_out).toBe(true));
	});
});

describe("handing off to the checks", () => {
	async function onSite() {
		const view = await mounted();
		await act(async () => void (await view.result.current.checkIn("site-1", "Elm Court")));
		return view;
	}

	test("mints a visit, marks the handoff, then navigates - in that order", async () => {
		const { result } = await onSite();

		await act(async () => void (await result.current.startChecks()));

		// The attendance local_id goes with it, so the fire visit is linked to the
		// cleaning visit it happened during.
		expect(api.startFireChecks).toHaveBeenCalledWith("site-1", result.current.active?.local_id);
		expect(handoff.markHandoff).toHaveBeenCalledWith({ token: "fire-token", siteName: "Elm Court" });
		// Marked BEFORE navigating: an app that dies on the way still knows where
		// this person came from.
		expect(handoff.markHandoff.mock.invocationCallOrder[0]).toBeLessThan((router.push as jest.Mock).mock.invocationCallOrder[0]);
		expect(router.push).toHaveBeenCalledWith({ pathname: "/v/[token]", params: { token: "fire-token" } });
	});

	test("the session stays open underneath", async () => {
		// The timer keeps running while they are in the wizard; checking out is
		// still owed when they come back.
		const { result } = await onSite();

		await act(async () => void (await result.current.startChecks()));

		expect(result.current.active).not.toBeNull();
		expect(result.current.active?.check_out).toBeNull();
	});

	test("a broker refusal is shown and nothing is navigated to", async () => {
		// "No fire-safety checks are due here." is a 409 the broker words itself.
		api.startFireChecks.mockRejectedValue(new Error("No fire-safety checks are due here."));
		const { result } = await onSite();

		await act(async () => void (await result.current.startChecks()));

		expect(result.current.error).toBe("No fire-safety checks are due here.");
		expect(handoff.markHandoff).not.toHaveBeenCalled();
		expect(router.push).not.toHaveBeenCalled();
	});

	test("checks cannot be started when not on site", async () => {
		const { result } = await mounted();

		await act(async () => void (await result.current.startChecks()));

		expect(api.startFireChecks).not.toHaveBeenCalled();
	});
});
