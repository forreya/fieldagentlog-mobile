// The wizard's two links to the sync engine: attaching a photo nudges a pass
// so the bytes upload now rather than in one burst at submit, and a completed
// pass teaches the live wizard the server ref of anything it uploaded - the
// wizard's saves are whole-record overwrites, so a wizard that never learns
// would clobber the ref and the photo would vanish from the submitted visit.

import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";

import { resetDatabase } from "@/db/database";
import { addPendingPhoto } from "@/db/photos";
import type { VisitRecord } from "@/db/types";
import { loadVisit, saveVisit } from "@/db/visits";
import { syncEngine } from "@/sync/engine";

import { useWizard } from "./useWizard";

jest.mock("expo-sqlite");
jest.mock("@/db/photoStore", () => ({
	deleteStoredPhoto: jest.fn(),
	// Identity fakes: path resolution is photoStore's own concern, proven in
	// its own suite.
	storedKey: (uri: string) => uri,
	resolvePhotoUri: (stored: string) => stored,
}));

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const record = (over: Partial<VisitRecord> = {}): VisitRecord => ({
	token: "tok",
	packet: {},
	inspector: { name: "A Smith", email: "a@example.com" },
	results: {},
	fra_updates: {},
	started_at: 1_000,
	updated_at: 1_000,
	submitted: null,
	...over,
});

beforeEach(() => {
	resetDatabase();
	__resetAllDatabases();
	jest.clearAllMocks();
	syncEngine.reset();
});

describe("the capture nudge", () => {
	test("attaching a photo asks the engine for a pass", async () => {
		const spy = jest.spyOn(syncEngine, "sync").mockResolvedValue(null);
		const { result } = await renderHook(() => useWizard(record()));

		await act(async () => {
			result.current.dispatch({ type: "SET_PHOTO", checkId: "c1", localId: "p1" });
		});

		expect(spy).toHaveBeenCalledWith("photo captured");
	});

	test("typing does not - only a fresh photo has bytes waiting", async () => {
		const spy = jest.spyOn(syncEngine, "sync").mockResolvedValue(null);
		const { result } = await renderHook(() => useWizard(record()));

		await act(async () => {
			result.current.dispatch({ type: "SET_NOTE", checkId: "c1", note: "hinge sheared" });
		});

		expect(spy).not.toHaveBeenCalledWith("photo captured");
	});

	test("a photo already attached when the wizard opens does not nudge again", async () => {
		// App start already runs a pass; a nudge on every reopen would be noise.
		const spy = jest.spyOn(syncEngine, "sync").mockResolvedValue(null);
		const rec = record({ results: { c1: { verdict: "fail", note: "n", severity: "high", photo_ref: null, photo_local_id: "p1" } } });

		const { result } = await renderHook(() => useWizard(rec));
		await act(async () => {
			result.current.dispatch({ type: "SET_NOTE", checkId: "c1", note: "still broken" });
		});

		expect(spy).not.toHaveBeenCalledWith("photo captured");
	});
});

describe("learning about refs a pass recorded", () => {
	test("swaps the local id for the server ref when the engine goes idle", async () => {
		// The queue row already holds the ref (an earlier pass uploaded it); the
		// record still points at the local id. The wizard must adopt the ref -
		// otherwise its next whole-record save writes the stale copy back.
		await addPendingPhoto({
			local_id: "p1",
			token: "tok",
			check_id: "c1",
			file: { uri: "file:///p1.jpg", name: "p1.jpg", type: "image/jpeg" },
			ref: "server/p1",
			created_at: Date.now(),
		});
		const rec = record({ results: { c1: { verdict: "fail", note: "n", severity: "high", photo_ref: null, photo_local_id: "p1" } } });
		await saveVisit(rec);

		const { result } = await renderHook(() => useWizard(rec));
		await act(async () => {
			await syncEngine.sync("connection regained");
		});

		await waitFor(() => expect(result.current.state.record.results.c1.photo_ref).toBe("server/p1"));
		expect(result.current.state.record.results.c1.photo_local_id).toBeNull();
		// Persisted too, so the healed record survives a force-stop.
		await waitFor(async () => expect((await loadVisit("tok"))?.results.c1.photo_ref).toBe("server/p1"));
	});
});
