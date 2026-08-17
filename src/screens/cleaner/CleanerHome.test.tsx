// The cleaner's site list, in each state it can be in.

import { render, screen } from "@testing-library/react-native";

import type { CleanerSite } from "@/api/cleaner";
import type { SitesView } from "@/data/useSites";

import { CleanerHome } from "./CleanerHome";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/sync/useSyncStatus", () => ({ useSyncStatus: () => ({ online: true, syncing: false, pending: 0 }) }));
jest.mock("@/auth/AuthProvider", () => ({
	useAuth: () => ({ state: { status: "signed_in", role: "cleaner", user: { id: "u1", email: "cleaner@example.test" } }, signOut: jest.fn() }),
}));

const mockSites = { current: {} as SitesView };
jest.mock("@/data/useSites", () => ({ useSites: () => mockSites.current }));

const site = (over: Partial<CleanerSite>): CleanerSite => ({
	id: "s1",
	name: "Elm Court",
	address: "1 Elm Road, London, SE1 7PB",
	duties_due: 0,
	...over,
});

async function show(view: Partial<SitesView>) {
	mockSites.current = { sites: null, loading: false, refreshing: false, error: null, updatedAt: 1, refresh: jest.fn(), ...view };
	await render(<CleanerHome />);
}

test("says it is loading before anything has arrived", async () => {
	await show({ loading: true });
	expect(screen.getByText("Loading your sites")).toBeTruthy();
});

test("a first load that fails shows the broker's own words and a retry", async () => {
	// The broker's refusals are written for the reader - "Your account is not
	// active. Ask your managing agent." beats anything generic we could put here.
	await show({ error: "Your account is not active. Ask your managing agent." });

	expect(screen.getByText("Your account is not active. Ask your managing agent.")).toBeTruthy();
	expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});

test("a cleaner with no sites is told why, not shown an empty page", async () => {
	await show({ sites: [] });
	expect(screen.getByText("No sites yet")).toBeTruthy();
	expect(screen.getByText(/assigned to a building/)).toBeTruthy();
});

test("sites render with their address, and the duty count is summarised", async () => {
	await show({
		sites: [site({ id: "a", name: "Elm Court", duties_due: 2 }), site({ id: "b", name: "Beech House", address: "22 Beech Lane", duties_due: 1 })],
	});

	expect(screen.getByText("Elm Court")).toBeTruthy();
	expect(screen.getByText("1 Elm Road, London, SE1 7PB")).toBeTruthy();
	expect(screen.getByText(/2 sites/)).toBeTruthy();
	expect(screen.getByText(/3 fire checks due/)).toBeTruthy();
});

test("a site with nothing due carries no badge - silence is the good state", async () => {
	await show({ sites: [site({ id: "a", name: "Quiet Court", duties_due: 0 })] });

	expect(screen.getByLabelText("Quiet Court. no checks due")).toBeTruthy();
	expect(screen.queryByText("0 due")).toBeNull();
});

test("one site reads as a site, not 1 sites", async () => {
	await show({ sites: [site({ duties_due: 1 })] });
	expect(screen.getByText(/1 site/)).toBeTruthy();
	expect(screen.getByText(/1 fire check due/)).toBeTruthy();
});

test("a failed refresh keeps the list and says how old it is", async () => {
	await show({ sites: [site({})], error: "No signal." });

	expect(screen.getByText("Showing what was saved here")).toBeTruthy();
	expect(screen.getByText("Elm Court")).toBeTruthy();
});

test("the search bar stays out of the way until there is a list worth searching", async () => {
	await show({ sites: [site({ id: "a" }), site({ id: "b", name: "B" }), site({ id: "c", name: "C" })] });
	expect(screen.queryByPlaceholderText(/Search by name/)).toBeNull();

	await show({ sites: ["a", "b", "c", "d"].map((id) => site({ id, name: `Site ${id}` })) });
	expect(screen.getByPlaceholderText(/Search by name/)).toBeTruthy();
});
