import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import type { PlanView } from "@/data/usePlan";
import type { DashboardView } from "@/data/useDashboard";
import type { BlockWithJobs } from "@/shared/fireData";

import { PlanVisits } from "./PlanVisits";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock("@/sync/useSyncStatus", () => ({ useSyncStatus: () => ({ online: true, syncing: false, pending: 0 }) }));

const mockRole = { current: "staff" as "staff" | "agent" };
jest.mock("@/auth/AuthProvider", () => ({
	useAuth: () => ({ state: { status: "signed_in", user: { id: "u1" }, role: mockRole.current } }),
}));

const mockDashboard = { current: {} as DashboardView };
const mockPlan = { current: {} as PlanView };
jest.mock("@/data/useDashboard", () => ({ useDashboard: () => mockDashboard.current }));
jest.mock("@/data/usePlan", () => ({ usePlan: () => mockPlan.current }));

const block = (over: Partial<BlockWithJobs>): BlockWithJobs => ({
	id: "b",
	organizationId: "o1",
	name: "Block",
	address: "1 Road",
	postcode: "SE5 9QQ",
	jobs: [],
	overdue: 0,
	soon: 0,
	upcoming: 0,
	specialist: 0,
	...over,
});

async function show(plan: Partial<PlanView>, role: "staff" | "agent" = "staff") {
	mockRole.current = role;
	mockDashboard.current = {
		data: { blocks: [], totals: { blocks: 0, jobsDue: 0, overdue: 0 } },
		loading: false,
		refreshing: false,
		error: null,
		updatedAt: 1,
		refresh: jest.fn(),
	};
	mockPlan.current = { plan: null, loading: false, error: null, refresh: jest.fn(), ...plan };
	await render(<PlanVisits />);
}

beforeEach(() => jest.clearAllMocks());

test("an agent is told this is a staff tool, not shown an empty plan", async () => {
	await show({}, "agent");
	expect(screen.getByText("A staff tool")).toBeTruthy();
});

test("rounds render with their label, meta and drive order", async () => {
	await show({
		plan: {
			groups: [
				{
					id: "g1",
					label: "SE5",
					blocks: [block({ id: "a", name: "Beech House", overdue: 2 }), block({ id: "b", name: "Peckham Court", soon: 1 })],
					overdue: 2,
					soon: 1,
					jobs: 3,
					distanceKm: 2.4,
				},
			],
			ungrouped: [],
		},
	});

	expect(screen.getByText("Round 1 · SE5")).toBeTruthy();
	expect(screen.getByText(/2 blocks · 3 jobs · 2 overdue · ~2 km/)).toBeTruthy();
	expect(screen.getByLabelText("Stop 1: Beech House. 2 overdue")).toBeTruthy();
	expect(screen.getByLabelText("Stop 2: Peckham Court. 1 due soon")).toBeTruthy();
});

test("tapping a stop opens its block", async () => {
	await show({
		plan: {
			groups: [
				{ id: "g1", label: "SE5", blocks: [block({ id: "a", name: "Beech House", overdue: 1 })], overdue: 1, soon: 0, jobs: 1, distanceKm: 0 },
			],
			ungrouped: [],
		},
	});

	fireEvent.press(screen.getByLabelText("Stop 1: Beech House. 1 overdue"));
	expect(router.push).toHaveBeenCalledWith({ pathname: "/(app)/block/[id]", params: { id: "a" } });
});

test("unplaceable blocks are listed under Location unknown, not dropped", async () => {
	await show({ plan: { groups: [], ungrouped: [block({ id: "x", name: "The Barn", postcode: null, overdue: 3 })] } });

	expect(screen.getByText("Location unknown")).toBeTruthy();
	expect(screen.getByLabelText("The Barn. 3 overdue")).toBeTruthy();
});

test("nothing due says so", async () => {
	await show({ plan: { groups: [], ungrouped: [] } });
	expect(screen.getByText("Nothing to plan")).toBeTruthy();
});

test("a failed plan offers a retry", async () => {
	await show({ error: "Couldn't reach postcodes.io." });
	expect(screen.getByText("Couldn't reach postcodes.io.")).toBeTruthy();
	expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});
