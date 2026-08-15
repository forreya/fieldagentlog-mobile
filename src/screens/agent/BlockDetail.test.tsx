// The block screen, and the one handoff that has to be exact: Start checklist
// mints a token server-side and opens the wizard on it.

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import * as agentApi from "@/api/agent";
import { ApiError } from "@/api/errors";
import type { DashboardView } from "@/data/useDashboard";
import type { VisitHistoryView } from "@/data/useBlockVisits";
import type { BlockWithJobs, DashboardData, Job } from "@/shared/fireData";

import { BlockDetail } from "./BlockDetail";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock("@/api/agent");
jest.mock("@/sync/useSyncStatus", () => ({ useSyncStatus: () => ({ online: true, syncing: false, pending: 0 }) }));

const mockDashboard = { current: {} as DashboardView };
const mockHistory = { current: {} as VisitHistoryView };
jest.mock("@/data/useDashboard", () => ({ useDashboard: () => mockDashboard.current }));
jest.mock("@/data/useBlockVisits", () => ({ useBlockVisits: () => mockHistory.current }));

const api = agentApi as jest.Mocked<typeof agentApi>;

const job = (over: Partial<Job> = {}): Job => ({
	id: "j1",
	title: "Emergency lighting",
	category: "emergency_lighting",
	frequency: "monthly",
	nextDueAt: "2026-08-01",
	daysUntil: -13,
	level: "overdue",
	...over,
});

const block: BlockWithJobs = {
	id: "b1",
	organizationId: "o1",
	name: "Elm Court",
	address: "1 Elm Road",
	postcode: "SE1 2AB",
	jobs: [job(), job({ id: "j2", title: "Signage", level: "upcoming", daysUntil: 200 })],
	overdue: 1,
	soon: 0,
	upcoming: 1,
	specialist: 2,
};

const data: DashboardData = { blocks: [block], totals: { blocks: 1, jobsDue: 1, overdue: 1 } };

async function show(over: Partial<DashboardView> = {}, history: Partial<VisitHistoryView> = {}) {
	mockDashboard.current = { data, loading: false, refreshing: false, error: null, updatedAt: Date.now(), refresh: jest.fn(), ...over };
	mockHistory.current = { visits: [], loading: false, error: null, refresh: jest.fn(), ...history };
	await render(<BlockDetail blockId="b1" />);
}

beforeEach(() => jest.clearAllMocks());

test("splits what is due from what is not", async () => {
	await show();

	expect(screen.getByText("Due now (1)")).toBeTruthy();
	expect(screen.getByText("Not due yet (1)")).toBeTruthy();
	expect(screen.getByText(/2 specialist checks are handled by contractors/)).toBeTruthy();
});

test("Start checklist mints a token and opens the wizard on it", async () => {
	api.agentStartVisit.mockResolvedValue("a".repeat(64));
	await show();

	fireEvent.press(screen.getByRole("button", { name: "Start checklist" }));

	await waitFor(() => expect(api.agentStartVisit).toHaveBeenCalledWith("b1"));
	// Replaced, not pushed: Back from the wizard returns to this block rather
	// than to a half-finished visit.
	expect(router.replace).toHaveBeenCalledWith({ pathname: "/v/[token]", params: { token: "a".repeat(64) } });
});

test("a refused start says why and does not navigate", async () => {
	api.agentStartVisit.mockRejectedValue(new ApiError("forbidden", "You are not assigned to this block."));
	await show();

	fireEvent.press(screen.getByRole("button", { name: "Start checklist" }));

	expect(await screen.findByText("You are not assigned to this block.")).toBeTruthy();
	expect(router.replace).not.toHaveBeenCalled();
});

test("a block that is not in the list explains itself rather than showing an empty page", async () => {
	await show({ data: { blocks: [], totals: { blocks: 0, jobsDue: 0, overdue: 0 } } });
	expect(screen.getByText("That block isn't in your list")).toBeTruthy();
});

test("history failing never blocks the checklist", async () => {
	// The agent came to do a visit, not to read about one.
	await show({}, { error: "No signal." });

	expect(screen.getByText(/Couldn't load past visits/)).toBeTruthy();
	expect(screen.getByRole("button", { name: "Start checklist" })).toBeTruthy();
});

test("no history yet says so", async () => {
	await show();
	expect(screen.getByText("No visits recorded yet.")).toBeTruthy();
});
