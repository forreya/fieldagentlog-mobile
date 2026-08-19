// The cleaner's site list, in each state it can be in.

import { fireEvent, render, screen } from "@testing-library/react-native";

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

// The screen's other three hooks, stubbed so this file stays about rendering
// the list. Each has its own tests.
const mockAttendance = { current: {} as Record<string, unknown> };
jest.mock("@/cleaner/useAttendance", () => ({ useAttendance: () => mockAttendance.current }));
jest.mock("@/data/useDuties", () => ({ useDuties: () => ({ duties: [], loading: false, refresh: jest.fn() }) }));
jest.mock("@/cleaner/useChecksSubmitted", () => ({ useChecksSubmitted: () => ({ hit: false, dismiss: jest.fn() }) }));
const mockFailedShifts = { current: { failed: [], retry: jest.fn() } as { failed: unknown[]; retry: jest.Mock } };
jest.mock("@/cleaner/useFailedShifts", () => ({ useFailedShifts: () => mockFailedShiftsRef().current }));
function mockFailedShiftsRef() {
	return mockFailedShifts;
}

const site = (over: Partial<CleanerSite>): CleanerSite => ({
	id: "s1",
	name: "Elm Court",
	address: "1 Elm Road, London, SE1 7PB",
	duties_due: 0,
	...over,
});

const onSiteAt = (siteName: string) => ({
	local_id: "a",
	site_id: "s1",
	site_name: siteName,
	cleaner_email: null,
	check_in: { lat: 51.5, lng: -0.1, accuracy: 8, at: Date.now() - 60_000 },
	check_out: null,
	server_id: "srv",
	synced_in: true,
	synced_out: false,
});

async function show(view: Partial<SitesView>, attendance: Record<string, unknown> = {}, failedShifts: unknown[] = []) {
	mockFailedShifts.current = { failed: failedShifts, retry: jest.fn() };
	mockAttendance.current = {
		active: null,
		justClosed: null,
		busy: false,
		error: null,
		checkIn: jest.fn(),
		checkOut: jest.fn(),
		startChecks: jest.fn(),
		startingChecks: false,
		dismissError: jest.fn(),
		dismissClosed: jest.fn(),
		...attendance,
	};
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

describe("when the sites list fails but the cleaner is on site", () => {
	// The one thing a cleaner must always be able to do is leave. The on-site
	// card used to sit below an early return for a failed sites load, so losing
	// signal while checked in hid the timer and the check-out button entirely.

	test("the on-site card still renders, with its way out", async () => {
		await show({ sites: null, error: "That took too long. Check your signal and try again." }, { active: onSiteAt("Elm Court") });

		expect(screen.getByText("Elm Court")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Check out" })).toBeTruthy();
		// And the list still says what went wrong.
		expect(screen.getByText("Couldn't load your sites")).toBeTruthy();
	});

	test("checking out from there works", async () => {
		const checkOut = jest.fn();
		await show({ sites: null, error: "No signal." }, { active: onSiteAt("Elm Court"), checkOut });

		fireEvent.press(screen.getByRole("button", { name: "Check out" }));
		expect(checkOut).toHaveBeenCalled();
	});

	test("it renders while the list is still loading too", async () => {
		// A cold start on a slow connection is the same shape as a failure.
		await show({ loading: true }, { active: onSiteAt("Elm Court") });

		expect(screen.getByText("Elm Court")).toBeTruthy();
		expect(screen.getByText("Loading your sites")).toBeTruthy();
	});
});

describe("a shift whose record could not be sent", () => {
	const failedShift = {
		local_id: "bad-1",
		site_id: "s1",
		site_name: "Elm Court",
		cleaner_email: null,
		check_in: { lat: 51.5, lng: -0.1, accuracy: 8, at: 1 },
		check_out: { lat: 51.5, lng: -0.1, accuracy: 8, at: 2 },
		server_id: null,
		synced_in: true,
		synced_out: false,
		sync_error: { message: "Your account is not active. Ask your managing agent.", at: 3 },
	};

	test("is surfaced on the home with the reason and a Try again - never a discard", async () => {
		await show({ sites: [site({})] }, {}, [failedShift]);

		expect(screen.getByText("A visit to Elm Court couldn't be recorded")).toBeTruthy();
		expect(screen.getByText(/Your account is not active/)).toBeTruthy();
		expect(screen.getByText(/It stays saved on this phone/)).toBeTruthy();
		expect(screen.queryByText("Discard")).toBeNull();

		fireEvent.press(screen.getByText("Try again"));
		expect(mockFailedShifts.current.retry).toHaveBeenCalledWith("bad-1");
	});

	test("no failed shifts, no banner", async () => {
		await show({ sites: [site({})] });
		expect(screen.queryByText(/couldn't be recorded/)).toBeNull();
	});
});
