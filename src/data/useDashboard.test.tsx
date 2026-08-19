// The three states a spinner cannot tell apart, and the one caption that keeps
// cached data honest.
//
// The offline case is the one that matters: an agent in a car park should get
// yesterday's round with a stamp on it, not an error screen.

import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import * as agentApi from "@/api/agent";
import * as staffApi from "@/api/staff";
import { ApiError } from "@/api/errors";
import type { DashboardData } from "@/shared/fireData";

import { freshnessLabel, useDashboard } from "./useDashboard";

jest.mock("@/api/agent");
jest.mock("@/api/staff");

const mockRole = { current: "agent" as "agent" | "staff" };
const mockUserId = { current: "u1" };
jest.mock("@/auth/AuthProvider", () => ({
	useAuth: () => ({ state: { status: "signed_in", user: { id: mockUserId.current }, role: mockRole.current } }),
}));

const api = agentApi as jest.Mocked<typeof agentApi>;
const staff = staffApi as jest.Mocked<typeof staffApi>;

const data: DashboardData = {
	blocks: [
		{
			id: "b1",
			organizationId: "o1",
			name: "Elm Court",
			address: "1 Elm Rd",
			postcode: "SE1 2AB",
			jobs: [],
			overdue: 2,
			soon: 1,
			upcoming: 0,
			specialist: 0,
		},
	],
	totals: { blocks: 1, jobsDue: 3, overdue: 2 },
};

/** A client per test: caches must not leak between them. Retries off, so a
 *  failure is a failure rather than three seconds of back-off. */
function wrapper() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
	const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	return { client, Wrapper };
}

beforeEach(() => {
	jest.clearAllMocks();
	mockRole.current = "agent";
	mockUserId.current = "u1";
});

test("says it is loading before anything has arrived", async () => {
	api.loadAgentDashboard.mockReturnValue(new Promise(() => undefined));
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useDashboard(), { wrapper: Wrapper });

	expect(result.current.loading).toBe(true);
	expect(result.current.data).toBeNull();
	expect(result.current.error).toBeNull();
});

test("hands back the dashboard and when it was fetched", async () => {
	api.loadAgentDashboard.mockResolvedValue(data);
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useDashboard(), { wrapper: Wrapper });

	await waitFor(() => expect(result.current.data).toEqual(data));
	expect(result.current.loading).toBe(false);
	expect(result.current.error).toBeNull();
	expect(result.current.updatedAt).toBeGreaterThan(0);
});

test("a first load that fails is an error, because there is nothing to show", async () => {
	api.loadAgentDashboard.mockRejectedValue(new ApiError("network", "Couldn't reach the server."));
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useDashboard(), { wrapper: Wrapper });

	await waitFor(() => expect(result.current.error).toBe("Couldn't reach the server."));
	expect(result.current.data).toBeNull();
});

test("a failed refresh keeps the cached list, and reports both", async () => {
	// The whole point of persisting: the list stays, the error explains, and the
	// screen can say how old what it is showing is.
	api.loadAgentDashboard.mockResolvedValueOnce(data).mockRejectedValueOnce(new ApiError("network", "No signal."));
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useDashboard(), { wrapper: Wrapper });
	await waitFor(() => expect(result.current.data).toEqual(data));

	result.current.refresh();

	await waitFor(() => expect(result.current.error).toBe("No signal."));
	expect(result.current.data).toEqual(data);
});

test("a non-Error rejection still says something useful", async () => {
	api.loadAgentDashboard.mockRejectedValue("kaboom");
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useDashboard(), { wrapper: Wrapper });

	await waitFor(() => expect(result.current.error).toBe("Something went wrong loading your blocks."));
});

describe("which source a persona reads from", () => {
	test("an agent goes through the broker - they have no database access", async () => {
		api.loadAgentDashboard.mockResolvedValue(data);
		const { Wrapper } = wrapper();

		const { result } = await renderHook(() => useDashboard(), { wrapper: Wrapper });

		await waitFor(() => expect(result.current.data).toEqual(data));
		expect(api.loadAgentDashboard).toHaveBeenCalled();
		expect(staff.loadStaffDashboard).not.toHaveBeenCalled();
	});

	test("a staff member reads the database directly under RLS", async () => {
		mockRole.current = "staff";
		staff.loadStaffDashboard.mockResolvedValue(data);
		const { Wrapper } = wrapper();

		const { result } = await renderHook(() => useDashboard(), { wrapper: Wrapper });

		await waitFor(() => expect(result.current.data).toEqual(data));
		expect(staff.loadStaffDashboard).toHaveBeenCalled();
		expect(api.loadAgentDashboard).not.toHaveBeenCalled();
	});

	test("the two personas do not share a cache entry", async () => {
		// A shared key would hand one persona the other's block list after a
		// re-login on the same phone.
		const { client, Wrapper } = wrapper();
		api.loadAgentDashboard.mockResolvedValue(data);
		const { result } = await renderHook(() => useDashboard(), { wrapper: Wrapper });
		await waitFor(() => expect(result.current.data).toEqual(data));

		expect(client.getQueryData(["dashboard", "u1", "agent"])).toEqual(data);
		expect(client.getQueryData(["dashboard", "u1", "staff"])).toBeUndefined();
	});

	test("two accounts do not share a cache entry, even with the same role", async () => {
		// The account boundary itself. The cache is persisted to disk, so without
		// the user id in the key, whoever signs in next on this phone would be
		// served the LAST user's block list - instantly, and with no refetch to
		// correct it while the entry was still fresh.
		const { client, Wrapper } = wrapper();
		api.loadAgentDashboard.mockResolvedValue(data);

		// User A loads their blocks; the entry is fresh, not stale.
		const a = await renderHook(() => useDashboard(), { wrapper: Wrapper });
		await waitFor(() => expect(a.result.current.data).toEqual(data));
		a.unmount();

		// User B signs in on the same device, same persona.
		mockUserId.current = "u2";
		api.loadAgentDashboard.mockResolvedValue({ ...data, blocks: [] });
		const b = await renderHook(() => useDashboard(), { wrapper: Wrapper });

		// B never sees A's list - not even as a first paint while loading.
		expect(b.result.current.data).toBeNull();
		await waitFor(() => expect(b.result.current.data).toEqual({ ...data, blocks: [] }));
		expect(client.getQueryData(["dashboard", "u1", "agent"])).toEqual(data);
		expect(client.getQueryData(["dashboard", "u2", "agent"])).toEqual({ ...data, blocks: [] });
	});
});

describe("freshnessLabel", () => {
	const now = Date.parse("2026-08-14T12:00:00Z");

	test.each([
		[null, "Not loaded yet"],
		[now - 5_000, "Updated just now"],
		[now - 60_000, "Updated 1 minute ago"],
		[now - 20 * 60_000, "Updated 20 minutes ago"],
		[now - 3 * 3_600_000, "Updated 3 hours ago"],
		[now - 2 * 86_400_000, "Updated 2 days ago"],
	])("%s", (at, expected) => {
		expect(freshnessLabel(at, now)).toBe(expected);
	});

	test("a clock that has gone backwards does not print a negative age", async () => {
		expect(freshnessLabel(now + 60_000, now)).toBe("Updated just now");
	});
});
