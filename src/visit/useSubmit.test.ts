// Submitting, end to end: the hook, the real sync engine, the real queue and
// the real database, with only the network faked. The offline path is the one
// that matters - an inspection finished in a basement has to leave the phone
// by itself later, with nobody watching.

import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";

import { ApiError } from "@/api/errors";
import * as visitApi from "@/api/visit";
import { resetDatabase } from "@/db/database";
import type { VisitRecord } from "@/db/types";
import { loadVisit, saveVisit } from "@/db/visits";
import { syncEngine } from "@/sync/engine";
import { createVisitSource } from "@/sync/visitSync";

import { useSubmit } from "./useSubmit";

jest.mock("expo-sqlite");
jest.mock("@/api/visit");
jest.mock("@/db/photoStore", () => ({ deleteStoredPhoto: jest.fn() }));

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const api = visitApi as jest.Mocked<typeof visitApi>;

const TOKEN = "tok";

const record = (over: Partial<VisitRecord> = {}): VisitRecord => ({
	token: TOKEN,
	packet: {},
	inspector: { name: "A Smith", email: "a@example.com" },
	results: { c1: { verdict: "pass", note: "", severity: null, photo_ref: null, photo_local_id: null } },
	fra_updates: {},
	started_at: 1_000,
	updated_at: 1_000,
	submitted: null,
	...over,
});

/** Exactly what bootstrap does, minus the app. */
async function heldVisits(): Promise<VisitRecord[]> {
	const held = await loadVisit(TOKEN);
	return held ? [held] : [];
}

beforeEach(async () => {
	resetDatabase();
	__resetAllDatabases();
	jest.clearAllMocks();
	syncEngine.reset();
	syncEngine.register(createVisitSource(heldVisits));
	api.submitVisit.mockResolvedValue({ ok: true, visit_id: "v1", logbook_pdf_url: "https://pdf" });
	await saveVisit(record());
});

/** renderHook is async in RNTL 14 - it does its own act() pass. */
async function mount() {
	return renderHook(() => useSubmit(record(), jest.fn()));
}

describe("with signal", () => {
	test("submitting lands the result on the hook", async () => {
		const { result } = await mount();

		await act(async () => {
			await result.current.submit();
		});

		expect(api.submitVisit).toHaveBeenCalledTimes(1);
		expect(result.current.submitted?.visit_id).toBe("v1");
		expect(result.current.submitted?.logbook_pdf_url).toBe("https://pdf");
		expect(result.current.phase).toEqual({ kind: "idle" });
	});

	test("a double tap sends one inspection, not two", async () => {
		const { result } = await mount();

		await act(async () => {
			await Promise.all([result.current.submit(), result.current.submit()]);
		});

		expect(api.submitVisit).toHaveBeenCalledTimes(1);
	});
});

describe("with no signal", () => {
	test("the request is saved to disk and waits, without touching the network", async () => {
		syncEngine.setOnline(false);
		const { result } = await mount();

		await act(async () => {
			await result.current.submit();
		});

		expect(api.submitVisit).not.toHaveBeenCalled();
		expect(result.current.phase).toEqual({ kind: "queued", online: false });
		// The whole promise of the offline design: killing the app here loses
		// nothing, because the intent to submit is already stored.
		expect((await loadVisit(TOKEN))?.submit_requested_at).toBeGreaterThan(0);
	});

	test("it sends itself when signal returns, with the summary still on screen", async () => {
		syncEngine.setOnline(false);
		const { result } = await mount();
		await act(async () => {
			await result.current.submit();
		});

		await act(async () => {
			syncEngine.setOnline(true);
		});

		await waitFor(() => expect(result.current.submitted?.visit_id).toBe("v1"));
		expect(api.submitVisit).toHaveBeenCalledTimes(1);
	});

	test("a pass that fails for other reasons keeps it queued rather than losing it", async () => {
		api.submitVisit.mockRejectedValue(new ApiError("server", "Bad gateway", { status: 502 }));
		const { result } = await mount();

		await act(async () => {
			await result.current.submit();
		});

		expect(result.current.phase).toEqual({ kind: "queued", online: true });
		expect(result.current.submitted).toBeNull();
	});
});

describe("a link that has died mid-visit", () => {
	test("says so instead of promising to keep trying", async () => {
		// Retrying a spent or expired token can never succeed, so "waiting for
		// signal" would be a lie told to someone standing in a stairwell.
		api.submitVisit.mockRejectedValue(new ApiError("dead_end", "This link can't be used.", { status: 410 }));
		const { result } = await mount();

		await act(async () => {
			await result.current.submit();
		});

		expect(result.current.phase).toEqual({ kind: "blocked", message: "This link can't be used." });
	});

	test("the visit is still on the phone, so a fixed link can send it", async () => {
		api.submitVisit.mockRejectedValueOnce(new ApiError("dead_end", "gone", { status: 410 }));
		const { result } = await mount();
		await act(async () => {
			await result.current.submit();
		});

		await act(async () => {
			await result.current.submit();
		});

		expect(result.current.submitted?.visit_id).toBe("v1");
	});
});

describe("a permanent failure recorded on the record", () => {
	test("is shown on reopening, rather than a button that will fail again", async () => {
		const dead = record({ submit_error: { message: "This link can't be used.", at: 5 } });
		await saveVisit(dead);

		const { result } = await renderHook(() => useSubmit(dead, jest.fn()));

		expect(result.current.phase).toEqual({ kind: "blocked", message: "This link can't be used." });
	});

	test("is cleared by Try again, so the queue picks the visit up once more", async () => {
		const dead = record({ submit_error: { message: "gone", at: 5 } });
		await saveVisit(dead);
		const { result } = await renderHook(() => useSubmit(dead, jest.fn()));

		await act(async () => {
			await result.current.submit();
		});

		expect(api.submitVisit).toHaveBeenCalledTimes(1);
		expect(result.current.submitted?.visit_id).toBe("v1");
	});
});

describe("an already-submitted record", () => {
	test("is reported as done without asking the server again", async () => {
		const done = record({ submitted: { visit_id: "v9", logbook_pdf_url: "u", completed_at: "2026-08-14T00:00:00Z" } });
		await saveVisit(done);
		const { result } = await renderHook(() => useSubmit(done, jest.fn()));

		expect(result.current.submitted?.visit_id).toBe("v9");

		await act(async () => {
			await result.current.submit();
		});

		expect(api.submitVisit).not.toHaveBeenCalled();
	});
});
