// Greedy proximity clustering for the "Plan visits" view: group blocks that are
// close enough to visit in one trip. Not a route optimiser - just sensible
// geographic buckets, seeded by the most urgent block.
//
// Ported from the web app's src/lib/cluster.ts (deliberately not mirrored - see
// shared-mirror.json). One structural difference: haversineKm lives in geo.ts
// here rather than being defined inline, because nearby.ts needs it too and two
// copies of the Earth's radius is one too many.

import { haversineKm, type LatLng } from "./geo";

export interface GeoPoint {
	id: string;
	coord: LatLng;
	/** Higher = more urgent; used to seed clusters from the worst block first. */
	weight: number;
}

/**
 * Repeatedly seed a cluster from the highest-weight ungrouped point, then
 * absorb every ungrouped point within `radiusKm` of the cluster's running
 * centroid.
 */
export function clusterByProximity(points: GeoPoint[], radiusKm: number): GeoPoint[][] {
	const remaining = [...points].sort((a, z) => z.weight - a.weight);
	const clusters: GeoPoint[][] = [];

	while (remaining.length > 0) {
		const group = [remaining.shift() as GeoPoint];
		let centroid = group[0].coord;
		let changed = true;
		while (changed) {
			changed = false;
			for (let i = remaining.length - 1; i >= 0; i--) {
				if (haversineKm(centroid, remaining[i].coord) <= radiusKm) {
					group.push(remaining[i]);
					remaining.splice(i, 1);
					changed = true;
				}
			}
			centroid = {
				lat: group.reduce((sum, p) => sum + p.coord.lat, 0) / group.length,
				lng: group.reduce((sum, p) => sum + p.coord.lng, 0) / group.length,
			};
		}
		clusters.push(group);
	}
	return clusters;
}

/**
 * Order one cluster into a drive sequence with a nearest-neighbour heuristic,
 * starting from the most urgent point. Returns the ordered points and the
 * total leg distance. Good enough to plan a round; not an optimal TSP.
 */
export function routeOrder(points: GeoPoint[]): { ordered: GeoPoint[]; distanceKm: number } {
	if (points.length <= 1) return { ordered: [...points], distanceKm: 0 };

	const start = points.reduce((best, p) => (p.weight > best.weight ? p : best), points[0]);
	const remaining = points.filter((p) => p !== start);
	const ordered: GeoPoint[] = [start];
	let total = 0;
	let current = start;

	while (remaining.length > 0) {
		let bestIndex = 0;
		let bestDistance = Infinity;
		for (let i = 0; i < remaining.length; i++) {
			const d = haversineKm(current.coord, remaining[i].coord);
			if (d < bestDistance) {
				bestDistance = d;
				bestIndex = i;
			}
		}
		total += bestDistance;
		current = remaining[bestIndex];
		ordered.push(current);
		remaining.splice(bestIndex, 1);
	}

	return { ordered, distanceKm: total };
}
