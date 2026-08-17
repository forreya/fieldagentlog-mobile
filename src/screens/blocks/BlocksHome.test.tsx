// What the agent actually sees in each state. The states are cheap to get
// wrong and expensive to notice: "no blocks assigned" and "we couldn't load
// your blocks" look identical if the screen picks the wrong one.

import { render, screen } from "@testing-library/react-native";

import type { DashboardView } from "@/data/useDashboard";
import type { BlockWithJobs, DashboardData } from "@/shared/fireData";

import { BlocksHome } from "./BlocksHome";

const mockView = { current: {} as DashboardView };

jest.mock("@/data/useDashboard", () => ({
	...jest.requireActual("@/data/useDashboard"),
	useDashboard: () => mockView.current,
}));
jest.mock("@/auth/AuthProvider", () => ({
	useAuth: () => ({ state: { status: "signed_in", user: { id: "u1", email: "sam@company.co.uk" }, role: "agent" }, signOut: jest.fn() }),
}));

const block = (over: Partial<BlockWithJobs> = {}): BlockWithJobs => ({
	id: "b1",
	organizationId: "o1",
	name: "Elm Court",
	address: "1 Elm Road",
	postcode: "SE1 2AB",
	jobs: [],
	overdue: 2,
	soon: 0,
	upcoming: 0,
	specialist: 0,
	...over,
});

const data = (blocks: BlockWithJobs[]): DashboardData => ({
	blocks,
	totals: { blocks: blocks.length, jobsDue: 3, overdue: 2 },
});

async function show(view: Partial<DashboardView>) {
	mockView.current = { data: null, loading: false, refreshing: false, error: null, updatedAt: null, refresh: jest.fn(), ...view };
	await render(<BlocksHome />);
}

test("a first load says so rather than showing an empty list", async () => {
	await show({ loading: true });
	expect(screen.getByText("Loading your blocks")).toBeTruthy();
});

test("nothing cached and nothing fetched is the one real error", async () => {
	await show({ error: "Couldn't reach the server." });

	expect(screen.getByText("Couldn't load your blocks")).toBeTruthy();
	expect(screen.getByText("Couldn't reach the server.")).toBeTruthy();
	expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});

test("an agent with no assignments is told that, not shown an error", async () => {
	await show({ data: data([]), updatedAt: Date.now() });

	expect(screen.getByText("No blocks assigned")).toBeTruthy();
	expect(screen.queryByText("Couldn't load your blocks")).toBeNull();
});

test("the list leads with the totals and how old they are", async () => {
	await show({ data: data([block(), block({ id: "b2", name: "Beech House" })]), updatedAt: Date.now() });

	expect(screen.getByText("Elm Court")).toBeTruthy();
	expect(screen.getByText("Beech House")).toBeTruthy();
	expect(screen.getByText(/2 blocks/)).toBeTruthy();
	expect(screen.getByText("Updated just now")).toBeTruthy();
});

test("a failed refresh keeps the list and says what it is showing", async () => {
	// The case the whole caching design exists for: standing outside a building
	// with no signal, the list is still the useful thing on screen.
	await show({ data: data([block()]), error: "No signal.", updatedAt: Date.now() - 3_600_000 });

	expect(screen.getByText("Elm Court")).toBeTruthy();
	expect(screen.getByText("Showing what was saved here")).toBeTruthy();
	expect(screen.getByText(/Updated 1 hour ago/)).toBeTruthy();
	expect(screen.queryByText("Couldn't load your blocks")).toBeNull();
});
