// Turning "these blocks need visits" into "do these rounds, in this order".
//
// Pure: geocoding happens elsewhere and the results come in as a map. Ported
// from the web app's usePlan (the assembly half), so both clients suggest the
// same rounds given the same blocks - not mirrored, because the web keeps this
// inside a React hook and the logic deserves to be testable without one.

import { clusterByProximity, routeOrder, type GeoPoint } from "./cluster";
import type { LatLng } from "./geo";
import { normalizePostcode } from "./geocode";
import type { BlockWithJobs } from "@/shared/fireData";

export interface PlanGroup {
	id: string;
	/** Dominant postcode area in the group, e.g. "SE5". */
	label: string;
	/** Blocks in nearest-neighbour drive order. */
	blocks: BlockWithJobs[];
	overdue: number;
	soon: number;
	jobs: number;
	/** Total drive distance of the round, km. */
	distanceKm: number;
}

export interface PlanResult {
	groups: PlanGroup[];
	/** Blocks with no usable postcode or a failed geocode, most urgent first. */
	ungrouped: BlockWithJobs[];
}

/** Roughly "one trip" - blocks within this distance group together. */
export const RADIUS_KM = 8;

/** A block needs planning when something is overdue or coming due. */
export function needsVisit(block: BlockWithJobs): boolean {
	return block.overdue + block.soon > 0;
}

/** Overdue dominates: ten due-soon jobs never outrank one overdue. */
function weightOf(block: BlockWithJobs): number {
	return block.overdue * 10 + block.soon;
}

function outward(postcode: string | null): string {
	return normalizePostcode(postcode ?? "").split(" ")[0] || "—";
}

function dominantOutward(blocks: BlockWithJobs[]): string {
	const counts = new Map<string, number>();
	for (const block of blocks) {
		const area = outward(block.postcode);
		counts.set(area, (counts.get(area) ?? 0) + 1);
	}
	let best = "—";
	let most = -1;
	for (const [area, count] of counts) {
		if (count > most) {
			best = area;
			most = count;
		}
	}
	return best;
}

const byUrgency = (a: BlockWithJobs, z: BlockWithJobs) => z.overdue - a.overdue || z.soon - a.soon || a.name.localeCompare(z.name);

/** Assemble rounds from the blocks that need a visit and their coordinates. */
export function buildPlan(due: BlockWithJobs[], coords: Map<string, LatLng | null>): PlanResult {
	const byId = new Map(due.map((block) => [block.id, block]));
	const points: GeoPoint[] = [];
	const ungrouped: BlockWithJobs[] = [];

	for (const block of due) {
		const coord = block.postcode ? coords.get(normalizePostcode(block.postcode)) : null;
		if (coord) points.push({ id: block.id, coord, weight: weightOf(block) });
		else ungrouped.push(block);
	}

	const groups: PlanGroup[] = clusterByProximity(points, RADIUS_KM).map((pts) => {
		const { ordered, distanceKm } = routeOrder(pts);
		const blocks = ordered.map((p) => byId.get(p.id) as BlockWithJobs);
		const overdue = blocks.reduce((sum, b) => sum + b.overdue, 0);
		const soon = blocks.reduce((sum, b) => sum + b.soon, 0);
		return {
			id: ordered.map((p) => p.id).join("|"),
			label: dominantOutward(blocks),
			blocks,
			overdue,
			soon,
			jobs: overdue + soon,
			distanceKm,
		};
	});
	groups.sort((a, z) => z.overdue - a.overdue || z.soon - a.soon || z.blocks.length - a.blocks.length);
	ungrouped.sort(byUrgency);

	return { groups, ungrouped };
}
