// The cleaner's sites, with the same three-state contract as useDashboard:
// loading with nothing to show, refreshing behind data, and the only true
// error - nothing cached and nothing came back.
//
// Kept separate from useDashboard rather than folded into it. They look alike
// today, but a cleaner's list is sites-with-duties from one broker action and a
// staff or agent list is blocks-with-jobs assembled from three. Merging them
// would mean a role branch inside every field, which is how the web app's
// equivalent became hard to read.

import { useQuery } from "@tanstack/react-query";

import { loadCleanerSites, type CleanerSite } from "@/api/cleaner";

import { failureMessage } from "./failureMessage";

export const sitesKey = ["cleaner-sites"] as const;

export interface SitesView {
	sites: CleanerSite[] | null;
	/** First load, with nothing to show yet. */
	loading: boolean;
	/** A refresh is running behind a list already on screen. */
	refreshing: boolean;
	/** Set when the last attempt failed. Sites may still be present and usable. */
	error: string | null;
	/** When what is on screen was fetched, or null if it never has been. */
	updatedAt: number | null;
	refresh: () => void;
}

export function useSites(): SitesView {
	const query = useQuery({ queryKey: sitesKey, queryFn: loadCleanerSites });

	return {
		sites: query.data ?? null,
		loading: query.isPending,
		refreshing: query.isFetching && query.data !== undefined,
		error: query.error ? failureMessage(query.error, "Something went wrong loading your sites.") : null,
		updatedAt: query.dataUpdatedAt || null,
		refresh: () => void query.refetch(),
	};
}
