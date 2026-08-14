// The pill is the only thing on screen that says whether work is stuck on the
// phone, so it has to tell the truth the moment the truth changes.

import { act, renderHook } from "@testing-library/react-native";

import { syncEngine } from "./engine";
import { pillState, useSyncStatus } from "./useSyncStatus";

beforeEach(() => syncEngine.reset());

describe("pillState", () => {
	test.each([
		[
			{ online: true, status: "idle" as const, pending: 0 },
			{ online: true, syncing: false, pending: 0 },
		],
		[
			{ online: true, status: "syncing" as const, pending: 2 },
			{ online: true, syncing: true, pending: 2 },
		],
		[
			{ online: false, status: "idle" as const, pending: 3 },
			{ online: false, syncing: false, pending: 3 },
		],
	])("%o", (state, expected) => {
		expect(pillState(state)).toEqual(expected);
	});
});

describe("useSyncStatus", () => {
	test("starts from the engine's current state, not a hopeful default", async () => {
		syncEngine.setOnline(false);
		const { result } = await renderHook(() => useSyncStatus());
		expect(result.current.online).toBe(false);
	});

	test("losing signal reaches the screen", async () => {
		// This is the regression that mattered: `online` used to live outside the
		// emitted state, so going offline notified nobody and the pill sat on
		// "Online" all the way through a basement.
		const { result } = await renderHook(() => useSyncStatus());
		expect(result.current.online).toBe(true);

		await act(async () => {
			syncEngine.setOnline(false);
		});

		expect(result.current.online).toBe(false);
	});

	test("regaining it reaches the screen too", async () => {
		syncEngine.setOnline(false);
		const { result } = await renderHook(() => useSyncStatus());

		await act(async () => {
			syncEngine.setOnline(true);
		});

		expect(result.current.online).toBe(true);
	});

	test("unsubscribes on unmount, so a dead screen cannot be notified", async () => {
		const { unmount } = await renderHook(() => useSyncStatus());
		unmount();
		expect(() => syncEngine.setOnline(false)).not.toThrow();
	});
});
