// The grouping maths behind "Plan visits". Wrong clustering wastes someone's
// afternoon; these pin the behaviour to real London geography.

import { clusterByProximity, routeOrder, type GeoPoint } from "./cluster";

// Real places, so the distances mean something. Peckham and Camberwell are
// ~2 km apart; Manchester is ~260 km from both.
const CAMBERWELL = { lat: 51.4741, lng: -0.0888 };
const PECKHAM = { lat: 51.4735, lng: -0.0692 };
const DULWICH = { lat: 51.4457, lng: -0.0863 };
const MANCHESTER = { lat: 53.4436, lng: -2.2311 };

const point = (id: string, coord: { lat: number; lng: number }, weight = 1): GeoPoint => ({ id, coord, weight });

describe("clusterByProximity", () => {
	test("groups near neighbours and leaves the outlier alone", () => {
		const clusters = clusterByProximity([point("camberwell", CAMBERWELL), point("peckham", PECKHAM), point("manchester", MANCHESTER)], 8);

		const sets = clusters.map((c) => c.map((p) => p.id).sort());
		expect(sets).toContainEqual(["camberwell", "peckham"]);
		expect(sets).toContainEqual(["manchester"]);
	});

	test("seeds each cluster from the most urgent point", () => {
		const clusters = clusterByProximity([point("mild", CAMBERWELL, 1), point("urgent", PECKHAM, 30)], 8);
		// One cluster (they are neighbours), and it started from the urgent one.
		expect(clusters).toHaveLength(1);
		expect(clusters[0][0].id).toBe("urgent");
	});

	test("absorbs via the moving centroid - a chain joins one cluster", () => {
		// Dulwich is ~3 km from Camberwell but further from Peckham; the centroid
		// drifting toward Camberwell is what pulls it in.
		const clusters = clusterByProximity([point("peckham", PECKHAM, 3), point("camberwell", CAMBERWELL, 2), point("dulwich", DULWICH, 1)], 4);
		expect(clusters).toHaveLength(1);
		expect(clusters[0]).toHaveLength(3);
	});

	test("no points, no clusters", () => {
		expect(clusterByProximity([], 8)).toEqual([]);
	});
});

describe("routeOrder", () => {
	test("starts at the most urgent stop, then nearest-neighbour", () => {
		const { ordered } = routeOrder([point("dulwich", DULWICH, 1), point("peckham", PECKHAM, 9), point("camberwell", CAMBERWELL, 2)]);
		// Peckham first (urgency), then Camberwell (nearer than Dulwich), then Dulwich.
		expect(ordered.map((p) => p.id)).toEqual(["peckham", "camberwell", "dulwich"]);
	});

	test("the distance is the sum of the legs actually driven", () => {
		const { ordered, distanceKm } = routeOrder([point("a", CAMBERWELL, 2), point("b", PECKHAM, 1)]);
		expect(ordered.map((p) => p.id)).toEqual(["a", "b"]);
		expect(distanceKm).toBeGreaterThan(1);
		expect(distanceKm).toBeLessThan(2);
	});

	test("a single stop is a round of zero distance", () => {
		const { ordered, distanceKm } = routeOrder([point("only", CAMBERWELL)]);
		expect(ordered.map((p) => p.id)).toEqual(["only"]);
		expect(distanceKm).toBe(0);
	});
});
