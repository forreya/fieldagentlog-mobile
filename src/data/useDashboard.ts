// The agent's blocks, and how much to trust what is on screen.
//
// Three things a spinner cannot say, which this returns instead:
//   - showing cached data while a refresh runs (so the list stays put)
//   - the refresh failed but the cache is still good (so say when it is from)
//   - there is nothing cached and nothing came back (the only true error)
//
// The distinction matters on this app more than most: the person reading it is
// often standing outside a building deciding whether to go in.

import { useQuery } from "@tanstack/react-query";

import { loadAgentDashboard } from "@/api/agent";
import type { DashboardData } from "@/shared/fireData";

export const DASHBOARD_KEY = ["dashboard", "agent"] as const;

export interface DashboardView {
	data: DashboardData | null;
	/** First load, with nothing to show yet. */
	loading: boolean;
	/** A refresh is running behind data already on screen. */
	refreshing: boolean;
	/** Set when the last attempt failed. Data may still be present and usable. */
	error: string | null;
	/** When the data on screen was fetched, or null if it never has been. */
	updatedAt: number | null;
	refresh: () => void;
}

export function useDashboard(): DashboardView {
	const query = useQuery({ queryKey: DASHBOARD_KEY, queryFn: loadAgentDashboard });

	return {
		data: query.data ?? null,
		loading: query.isPending,
		// isFetching covers the background refresh; only call it refreshing when
		// there is something on screen for it to happen behind.
		refreshing: query.isFetching && query.data !== undefined,
		error: query.error ? failureMessage(query.error) : null,
		updatedAt: query.dataUpdatedAt || null,
		refresh: () => void query.refetch(),
	};
}

/** ApiError already carries wording written for the person reading it - the
 *  broker's own refusal where it gave one, our copy where it did not. Anything
 *  else is a bug rather than a condition, so it gets a generic line. */
function failureMessage(error: unknown): string {
	return error instanceof Error && error.message ? error.message : "Something went wrong loading your blocks.";
}

/** "Updated 3 minutes ago" - the honest caption on cached data. Exported so it
 *  can be tested at a fixed clock rather than whenever the suite runs. */
export function freshnessLabel(updatedAt: number | null, now: number = Date.now()): string {
	if (!updatedAt) return "Not loaded yet";
	const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
	if (seconds < 60) return "Updated just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.round(hours / 24);
	return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}
