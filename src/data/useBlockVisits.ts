// What has already happened at a block.
//
// A separate query from the dashboard on purpose: it is only wanted once
// someone opens a block, it is bounded and slow-moving, and a failure to load
// history must never stop the thing they came to do - start a checklist.

import { useQuery } from "@tanstack/react-query";

import { loadBlockVisits, type BlockVisit } from "@/api/agent";
import { useAuth } from "@/auth/AuthProvider";
import { failureMessage } from "./failureMessage";

/** Keyed by user as well as block: what one account may see of a block's past
 *  is not what another may, and a persisted cache must respect that. */
export const blockVisitsKey = (userId: string, blockId: string) => ["block-visits", userId, blockId] as const;

export interface VisitHistoryView {
	visits: BlockVisit[];
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

export function useBlockVisits(blockId: string): VisitHistoryView {
	const { state } = useAuth();
	const userId = state.status === "signed_in" ? state.user.id : "anon";
	const query = useQuery({
		queryKey: blockVisitsKey(userId, blockId),
		queryFn: () => loadBlockVisits(blockId),
		enabled: Boolean(blockId),
	});

	return {
		visits: query.data ?? [],
		loading: query.isPending,
		error: query.error ? failureMessage(query.error, "Couldn't load past visits.") : null,
		refresh: () => void query.refetch(),
	};
}
