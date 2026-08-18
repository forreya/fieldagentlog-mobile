// What has already happened at a block.
//
// A separate query from the dashboard on purpose: it is only wanted once
// someone opens a block, it is bounded and slow-moving, and a failure to load
// history must never stop the thing they came to do - start a checklist.

import { useQuery } from "@tanstack/react-query";

import { loadBlockVisits, type BlockVisit } from "@/api/agent";
import { failureMessage } from "./failureMessage";

export const blockVisitsKey = (blockId: string) => ["block-visits", blockId] as const;

export interface VisitHistoryView {
	visits: BlockVisit[];
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

export function useBlockVisits(blockId: string): VisitHistoryView {
	const query = useQuery({
		queryKey: blockVisitsKey(blockId),
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
