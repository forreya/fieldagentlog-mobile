// The fire checks due at the site a cleaner is standing in.
//
// Only fetched while they are checked in somewhere: this is a "while you're
// here" list, and asking for it on a screen nobody is on site for would be a
// request that buys the user nothing.
//
// A failure here is deliberately quiet. The duties card is an offer, not the
// point of the visit - a cleaner whose duties would not load has still checked
// in, and burying the on-site card under an error would be the wrong trade.

import { useQuery } from "@tanstack/react-query";

import { loadSiteDuties, type CleanerDuty } from "@/api/cleaner";
import { useAuth } from "@/auth/AuthProvider";

/** Keyed by user as well as site - same rule as every user-owned read. */
export const dutiesKey = (userId: string, siteId: string) => ["site-duties", userId, siteId] as const;

export interface DutiesView {
	duties: CleanerDuty[];
	loading: boolean;
	refresh: () => void;
}

export function useDuties(siteId: string | null): DutiesView {
	const { state } = useAuth();
	const userId = state.status === "signed_in" ? state.user.id : "anon";
	const query = useQuery({
		queryKey: dutiesKey(userId, siteId ?? "none"),
		queryFn: () => loadSiteDuties(siteId as string),
		enabled: siteId !== null,
	});

	return {
		duties: query.data ?? [],
		loading: query.isPending && siteId !== null,
		refresh: () => void query.refetch(),
	};
}
