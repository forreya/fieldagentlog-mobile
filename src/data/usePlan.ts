// Geocode the blocks that need a visit, then group them into rounds.
//
// A query rather than a hand-rolled effect (which is what the web app does):
// the only async step is geocoding, which is a cacheable read, and src/data is
// where cached reads live. The assembly itself is pure and sits in lib/plan.

import { useQuery } from "@tanstack/react-query";

import { geocodePostcodes } from "@/lib/geocode";
import { buildPlan, needsVisit, type PlanResult } from "@/lib/plan";
import type { BlockWithJobs } from "@/shared/fireData";

export interface PlanView {
	plan: PlanResult | null;
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

export function usePlan(blocks: BlockWithJobs[]): PlanView {
	const due = blocks.filter(needsVisit);

	// Keyed on ids AND urgency, not just membership: a dashboard refresh that
	// moves a block from due-soon to overdue must re-plan, or the rounds keep
	// yesterday's priorities. (The web app keys on ids alone; that is a bug
	// worth not porting.)
	const key = due
		.map((block) => `${block.id}:${block.overdue}:${block.soon}`)
		.sort()
		.join(",");

	const query = useQuery({
		queryKey: ["plan", key],
		queryFn: async () => {
			const postcodes = due.map((block) => block.postcode).filter((p): p is string => Boolean(p));
			return buildPlan(due, await geocodePostcodes(postcodes));
		},
	});

	return {
		plan: query.data ?? null,
		loading: query.isPending,
		error: query.error instanceof Error ? query.error.message : query.error ? "Couldn't plan visits." : null,
		refresh: () => void query.refetch(),
	};
}
