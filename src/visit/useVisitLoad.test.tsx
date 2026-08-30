// The cleaner-handoff production path, end to end: the AsyncStorage marker the
// cleaner app writes before the hop is the only thing that says this visit is
// theirs, and it must reach the persisted record - the marker itself is cleared
// the moment the cleaner heads home, while the record lives on. If it never
// lands, a cleaner is shown the fire-risk-assessment review the product
// deliberately withholds from them.

import { render, renderHook, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SQLite from "expo-sqlite";

import type { VisitPacket } from "@/api/contract";
import * as visitApi from "@/api/visit";
import { markHandoff } from "@/cleaner/handoff";
import { resetDatabase } from "@/db/database";
import type { VisitRecord } from "@/db/types";
import { loadVisit, saveVisit } from "@/db/visits";
import { VisitSummary } from "@/screens/visit/VisitSummary";
import { buildSubmitBody } from "@/sync/submitBody";

import { useVisitLoad } from "./useVisitLoad";

jest.mock("expo-sqlite");
jest.mock("@/api/visit");

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const api = visitApi as jest.Mocked<typeof visitApi>;

const TOKEN = "tok";

const PACKET: VisitPacket = {
	visit: { id: "v1", status: "dispatched", block_name: "Elm Court", block_address: "1 Elm Rd", due_date: "2026-09-01" },
	profile: [],
	inspector: {},
	checks: [],
	fra_actions: [{ id: "a1", title: "Replace missing signage", detail: "Stair core 2", severity: "high" }],
};

/** A record cached before the handoff existed - it carries no flag. */
const cachedRecord = (): VisitRecord => ({
	token: TOKEN,
	packet: PACKET,
	inspector: { name: "A Smith", email: "a@example.com" },
	results: {},
	fra_updates: {},
	started_at: 1_000,
	updated_at: 1_000,
	submitted: null,
});

beforeEach(async () => {
	resetDatabase();
	__resetAllDatabases();
	jest.clearAllMocks();
	await AsyncStorage.clear();
	api.fetchPacket.mockResolvedValue(PACKET);
});

async function loadedRecord(): Promise<VisitRecord> {
	const { result } = await renderHook(() => useVisitLoad(TOKEN));
	await waitFor(() => expect(result.current.state.status).toBe("ready"));
	const state = result.current.state;
	if (state.status !== "ready") throw new Error("expected ready");
	return state.record;
}

test("marker set, cached flag absent: the loaded record is a cleaner visit, persistently", async () => {
	await markHandoff({ token: TOKEN, siteName: "Elm Court" });
	await saveVisit(cachedRecord());

	const record = await loadedRecord();
	expect(record.cleaner_handoff).toBe(true);
	// Persisted, not just in memory: the flag must survive the marker being
	// cleared when the cleaner returns to their app.
	expect((await loadVisit(TOKEN))?.cleaner_handoff).toBe(true);
});

test("that record hides the FRA review and submits no FRA updates", async () => {
	await markHandoff({ token: TOKEN, siteName: "Elm Court" });
	await saveVisit(cachedRecord());

	const record = await loadedRecord();
	await render(
		<VisitSummary state={{ record, step: "summary", checkIndex: 0 }} dispatch={jest.fn()} phase={{ kind: "idle" }} onSubmit={jest.fn()} />,
	);
	expect(screen.queryByText("Replace missing signage")).toBeNull();
	expect(buildSubmitBody(record).fra_action_updates).toEqual([]);
});

test("a link opened cold, with no marker, stays a plain inspector visit", async () => {
	const record = await loadedRecord();
	expect(record.cleaner_handoff).toBe(false);
});

test("a marker for some other visit does not leak onto this one", async () => {
	await markHandoff({ token: "tok-other", siteName: "Cedar Point" });
	const record = await loadedRecord();
	expect(record.cleaner_handoff).toBe(false);
});
