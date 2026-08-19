// Reporting when you are not standing anywhere in particular.
//
// A cleaner who has not checked in has no block, so the form asks. Everywhere
// else the block is a fact - they are on site, or they opened the block's own
// screen - and being asked to confirm it would be one more thing to get wrong.
//
// The list comes from the cleaner's cached sites rather than a fresh request:
// they have just come from the screen that loaded it, and the form has to work
// with no signal.

import { act, fireEvent, render, screen } from "@testing-library/react-native";

import type { SitesView } from "@/data/useSites";

import { ReportIssue } from "./ReportIssue";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));
jest.mock("@/lib/nav", () => ({ goBack: jest.fn() }));
jest.mock("@/auth/AuthProvider", () => ({
	useAuth: () => ({ state: { status: "signed_in", user: { id: "u1" }, role: "cleaner" } }),
}));
jest.mock("@/sync/useSyncStatus", () => ({ useSyncStatus: () => ({ online: true, syncing: false, pending: 0 }) }));

const mockSites = { current: {} as SitesView };
jest.mock("@/data/useSites", () => ({ useSites: () => mockSitesRef().current }));

function mockSitesRef() {
	return mockSites;
}

function sitesView(over: Partial<SitesView> = {}): SitesView {
	return {
		sites: [
			{ id: "s1", name: "Elm Court", address: "1 Elm Road", duties_due: 0 },
			{ id: "s2", name: "Beech House", address: "22 Beech Lane", duties_due: 1 },
		] as SitesView["sites"],
		loading: false,
		refreshing: false,
		error: null,
		updatedAt: Date.now(),
		refresh: jest.fn(),
		...over,
	};
}

async function showPicker(over: Partial<SitesView> = {}) {
	mockSites.current = sitesView(over);
	await render(<ReportIssue site={null} />);
}

test("asks which site, and offers the ones this cleaner covers", async () => {
	await showPicker();

	expect(screen.getByText("Which site?")).toBeTruthy();
	expect(screen.getByLabelText("Elm Court")).toBeTruthy();
	expect(screen.getByLabelText("Beech House")).toBeTruthy();
});

test("choosing a site names it in the header, so the answer is visible while typing", async () => {
	await showPicker();
	await act(async () => fireEvent.press(screen.getByLabelText("Beech House")));

	expect(screen.queryByText("Which site?")).toBeNull();
	// Twice now: the chip, and the header that names what was chosen.
	expect(screen.getAllByText("Beech House")).toHaveLength(2);
});

// Never guess. A report filed against the wrong building is worse than one that
// made the reporter tap twice.
test("no site is preselected", async () => {
	await showPicker();

	expect(screen.getByLabelText("Elm Court").props.accessibilityState.selected).toBe(false);
	expect(screen.getByLabelText("Beech House").props.accessibilityState.selected).toBe(false);
});

test("a list that never loaded says so and offers a retry", async () => {
	await showPicker({ sites: null, error: "Your account is not active. Ask your managing agent." });

	expect(screen.getByText("Your account is not active. Ask your managing agent.")).toBeTruthy();
	expect(screen.getByText("Try again")).toBeTruthy();
});

test("a cleaner with no sites is told, rather than shown an empty picker", async () => {
	await showPicker({ sites: [] });

	expect(screen.getByText("No sites yet")).toBeTruthy();
});
