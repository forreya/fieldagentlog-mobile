// The three states behind the cleaner's list, and the one caption that keeps a
// cached list honest.

import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import * as cleanerApi from "@/api/cleaner";
import { ApiError } from "@/api/errors";

import { useSites } from "./useSites";

jest.mock("@/api/cleaner");

const api = cleanerApi as jest.Mocked<typeof cleanerApi>;

const sites = [{ id: "s1", name: "Elm Court", address: "1 Elm Road", duties_due: 2 }];

function wrapper() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
	const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	return { client, Wrapper };
}

beforeEach(() => jest.clearAllMocks());

test("loading, with nothing to show yet", async () => {
	api.loadCleanerSites.mockReturnValue(new Promise(() => undefined));
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useSites(), { wrapper: Wrapper });

	expect(result.current.loading).toBe(true);
	expect(result.current.sites).toBeNull();
});

test("hands back the sites and when they were fetched", async () => {
	api.loadCleanerSites.mockResolvedValue(sites);
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useSites(), { wrapper: Wrapper });

	await waitFor(() => expect(result.current.sites).toEqual(sites));
	expect(result.current.updatedAt).toBeGreaterThan(0);
	expect(result.current.error).toBeNull();
});

test("a refusal from the broker reaches the screen verbatim", async () => {
	// The 403 a deactivated cleaner gets says exactly what to do about it.
	api.loadCleanerSites.mockRejectedValue(new ApiError("forbidden", "Your account is not active. Ask your managing agent."));
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useSites(), { wrapper: Wrapper });

	await waitFor(() => expect(result.current.error).toBe("Your account is not active. Ask your managing agent."));
	expect(result.current.sites).toBeNull();
});

test("a failed refresh keeps the cached list and reports both", async () => {
	api.loadCleanerSites.mockResolvedValueOnce(sites).mockRejectedValueOnce(new ApiError("network", "No signal."));
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useSites(), { wrapper: Wrapper });
	await waitFor(() => expect(result.current.sites).toEqual(sites));

	result.current.refresh();

	await waitFor(() => expect(result.current.error).toBe("No signal."));
	expect(result.current.sites).toEqual(sites);
});

test("a non-Error rejection still says something useful", async () => {
	api.loadCleanerSites.mockRejectedValue("kaboom");
	const { Wrapper } = wrapper();

	const { result } = await renderHook(() => useSites(), { wrapper: Wrapper });

	await waitFor(() => expect(result.current.error).toBe("Something went wrong loading your sites."));
});

test("cleaner sites do not share a cache entry with the blocks dashboard", async () => {
	const { client, Wrapper } = wrapper();
	api.loadCleanerSites.mockResolvedValue(sites);

	const { result } = await renderHook(() => useSites(), { wrapper: Wrapper });
	await waitFor(() => expect(result.current.sites).toEqual(sites));

	expect(client.getQueryData(["cleaner-sites"])).toEqual(sites);
	expect(client.getQueryData(["dashboard", "cleaner"])).toBeUndefined();
});
