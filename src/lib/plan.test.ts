// From "these blocks need visits" to "do these rounds": labels, ordering,
// urgency, and the blocks that could not be placed.

import { buildPlan, needsVisit } from "./plan";
import type { BlockWithJobs } from "@/shared/fireData";

const block = (over: Partial<BlockWithJobs>): BlockWithJobs => ({
	id: "b",
	organizationId: "o1",
	name: "Block",
	address: null,
	postcode: null,
	jobs: [],
	overdue: 0,
	soon: 0,
	upcoming: 0,
	specialist: 0,
	...over,
});

const CAMBERWELL = { lat: 51.4741, lng: -0.0888 };
const PECKHAM = { lat: 51.4735, lng: -0.0692 };
const MANCHESTER = { lat: 53.4436, lng: -2.2311 };

const coords = new Map([
	["SE5 9QQ", CAMBERWELL],
	["SE15 5DT", PECKHAM],
	["M14 6HR", MANCHESTER],
]);

describe("needsVisit", () => {
	test("anything overdue or due soon; upcoming alone does not", () => {
		expect(needsVisit(block({ overdue: 1 }))).toBe(true);
		expect(needsVisit(block({ soon: 2 }))).toBe(true);
		expect(needsVisit(block({ upcoming: 5 }))).toBe(false);
	});
});

describe("buildPlan", () => {
	test("nearby blocks make a round in drive order; the far one is its own trip", () => {
		const plan = buildPlan(
			[
				block({ id: "far", name: "Oak Rise", postcode: "M14 6HR", soon: 1 }),
				block({ id: "cam", name: "Beech House", postcode: "SE5 9QQ", overdue: 2 }),
				block({ id: "pec", name: "Peckham Court", postcode: "SE15 5DT", soon: 1 }),
			],
			coords,
		);

		expect(plan.groups).toHaveLength(2);
		// The London round leads: it has the overdue work.
		expect(plan.groups[0].blocks.map((b) => b.id)).toEqual(["cam", "pec"]);
		expect(plan.groups[1].blocks.map((b) => b.id)).toEqual(["far"]);
		expect(plan.ungrouped).toEqual([]);
	});

	test("the label is the round's dominant postcode area", () => {
		const plan = buildPlan([block({ id: "a", postcode: "SE5 9QQ", overdue: 1 }), block({ id: "b", postcode: "SE15 5DT", soon: 1 })], coords);
		// Tie between SE5 and SE15 - first counted wins; either is honest. What
		// matters is that it IS an outward code, not a full postcode.
		expect(["SE5", "SE15"]).toContain(plan.groups[0].label);
	});

	test("a block with no postcode, or one that would not geocode, is listed rather than lost", () => {
		const plan = buildPlan(
			[
				block({ id: "known", postcode: "SE5 9QQ", overdue: 1 }),
				block({ id: "nopc", name: "Barn", postcode: null, overdue: 3 }),
				block({ id: "failed", name: "Mill", postcode: "ZZ9 9ZZ", soon: 1 }),
			],
			new Map([...coords, ["ZZ9 9ZZ", null]]),
		);

		expect(plan.groups).toHaveLength(1);
		// Most urgent first: whoever plans still needs to see the barn's 3 overdue.
		expect(plan.ungrouped.map((b) => b.id)).toEqual(["nopc", "failed"]);
	});

	test("a block's postcode round-trips through the same normalisation as the geocoder", () => {
		// geocodePostcodes keys its result by normalizePostcode of what it was
		// given, and buildPlan looks up with the same function - so a spaceless
		// "se59qq" hits its own entry. (It would NOT hit "SE5 9QQ" cached from a
		// differently-spaced sibling; the web app has the same property.)
		const plan = buildPlan([block({ id: "a", postcode: "se59qq", overdue: 1 })], new Map([["SE59QQ", CAMBERWELL]]));
		expect(plan.groups).toHaveLength(1);
	});

	test("rounds are ordered by urgency, and totals add up", () => {
		const plan = buildPlan(
			[
				block({ id: "calm", postcode: "M14 6HR", soon: 1 }),
				block({ id: "bad1", postcode: "SE5 9QQ", overdue: 2, soon: 1 }),
				block({ id: "bad2", postcode: "SE15 5DT", overdue: 1 }),
			],
			coords,
		);

		expect(plan.groups[0].overdue).toBe(3);
		expect(plan.groups[0].soon).toBe(1);
		expect(plan.groups[0].jobs).toBe(4);
		expect(plan.groups[1].overdue).toBe(0);
	});
});
