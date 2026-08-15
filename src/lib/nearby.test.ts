// Searching and ordering a list of blocks. Cosmetic logic, but the kind that
// is quietly wrong for years if nobody pins it down.

import { byDistance, distancesFrom, formatDistance, matches, postcodeOf } from "./nearby";

const block = (over: Partial<Parameters<typeof matches>[0]> = {}) => ({
	id: "b1",
	name: "Elm Court",
	address: "1 Elm Road, London SE1 2AB",
	...over,
});

describe("postcodeOf", () => {
	test("prefers the block's own postcode", () => {
		expect(postcodeOf(block({ postcode: "SE5 9QQ" }))).toBe("SE5 9QQ");
	});

	test("reads one out of the address when there isn't one", () => {
		// A cleaner's site carries only an address.
		expect(postcodeOf(block())).toBe("SE1 2AB");
	});

	test("finds one typed without its space", () => {
		expect(postcodeOf(block({ address: "1 Elm Road, London se12ab" }))).toBe("se1 2ab");
	});

	test("no postcode anywhere is null, not a guess", () => {
		expect(postcodeOf(block({ address: "The old dairy, behind the church" }))).toBeNull();
	});
});

describe("matches", () => {
	test("an empty query matches everything", () => {
		expect(matches(block(), "  ")).toBe(true);
	});

	test.each(["elm", "ELM", "elm road", "se1", "SE12AB", "elm se1"])("%p finds it", (query) => {
		expect(matches(block(), query)).toBe(true);
	});

	test("every term must appear, so a second word narrows", () => {
		expect(matches(block(), "elm beech")).toBe(false);
	});

	test("a postcode typed without its space still matches one stored with it", () => {
		expect(matches(block({ postcode: "SE1 2AB", address: null }), "se12ab")).toBe(true);
	});
});

describe("byDistance", () => {
	const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

	test("nearest first", () => {
		const distances = new Map([
			["a", 5],
			["b", 1],
			["c", 3],
		]);
		expect(byDistance(items, distances).map((i) => i.id)).toEqual(["b", "c", "a"]);
	});

	test("anything that couldn't be placed keeps its order, last", () => {
		// Sorting an unplaceable block to the top would be a lie about where it is.
		const distances = new Map([["c", 3]]);
		expect(byDistance(items, distances).map((i) => i.id)).toEqual(["c", "a", "b"]);
	});
});

describe("distancesFrom", () => {
	test("measures from where you are", () => {
		const here = { lat: 51.5, lng: -0.1 };
		const located = new Map([["a", { lat: 51.5, lng: -0.1 }]]);
		expect(distancesFrom(here, located).get("a")).toBeCloseTo(0, 5);
	});

	test("roughly right over a known distance", () => {
		// London to Brighton is about 75 km as the crow flies.
		const london = { lat: 51.5074, lng: -0.1278 };
		const km = distancesFrom(london, new Map([["brighton", { lat: 50.8225, lng: -0.1372 }]])).get("brighton");
		expect(km).toBeGreaterThan(70);
		expect(km).toBeLessThan(80);
	});
});

describe("formatDistance", () => {
	test.each([
		[0.216, "220 m"],
		[0.999, "1000 m"],
		[1.44, "1.4 km"],
		[9.9, "9.9 km"],
		[10, "10 km"],
		[12.4, "12 km"],
	])("%s km reads as %s", (km, expected) => {
		expect(formatDistance(km)).toBe(expected);
	});
});
