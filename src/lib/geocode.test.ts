// The postcode cache. A planning session should cost one round of lookups,
// and a field worker's data plan should never pay twice for the same answer.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { geocodePostcodes, normalizePostcode } from "./geocode";

const CAMBERWELL = { latitude: 51.4741, longitude: -0.0888 };

function respondWith(entries: { query: string; result: { latitude: number; longitude: number } | null }[]) {
	return jest.fn(async () => ({
		ok: true,
		json: async () => ({ result: entries }),
	})) as unknown as typeof fetch;
}

beforeEach(async () => {
	await AsyncStorage.clear();
	jest.restoreAllMocks();
});

describe("normalizePostcode", () => {
	test.each([
		["se5 9qq", "SE5 9QQ"],
		["  SE5  9QQ  ", "SE5 9QQ"],
		["se59qq", "SE59QQ"],
	])("%p -> %p", (raw, expected) => {
		expect(normalizePostcode(raw)).toBe(expected);
	});
});

test("a repeat lookup is served from the cache, not the network", async () => {
	const fetchMock = respondWith([{ query: "SE5 9QQ", result: CAMBERWELL }]);
	global.fetch = fetchMock;

	const first = await geocodePostcodes(["SE5 9QQ"]);
	expect(first.get("SE5 9QQ")).toEqual({ lat: 51.4741, lng: -0.0888 });
	expect(fetchMock).toHaveBeenCalledTimes(1);

	const second = await geocodePostcodes(["se5 9qq"]);
	expect(second.get("SE5 9QQ")).toEqual({ lat: 51.4741, lng: -0.0888 });
	// Same postcode, different spacing and case: still no second request.
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a confirmed miss is cached too - it will not resolve tomorrow either", async () => {
	const fetchMock = respondWith([{ query: "ZZ9 9ZZ", result: null }]);
	global.fetch = fetchMock;

	await geocodePostcodes(["ZZ9 9ZZ"]);
	const again = await geocodePostcodes(["ZZ9 9ZZ"]);

	expect(again.get("ZZ9 9ZZ")).toBeNull();
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a network failure is NOT cached, so the next attempt retries", async () => {
	const failing = jest.fn(async () => {
		throw new Error("offline");
	}) as unknown as typeof fetch;
	global.fetch = failing;

	const first = await geocodePostcodes(["SE5 9QQ"]);
	// Absent, not null: "don't know yet" rather than "will never resolve".
	expect(first.has("SE5 9QQ")).toBe(false);

	global.fetch = respondWith([{ query: "SE5 9QQ", result: CAMBERWELL }]);
	const second = await geocodePostcodes(["SE5 9QQ"]);
	expect(second.get("SE5 9QQ")).toEqual({ lat: 51.4741, lng: -0.0888 });
});

test("duplicates collapse into one lookup", async () => {
	const fetchMock = respondWith([{ query: "SE5 9QQ", result: CAMBERWELL }]);
	global.fetch = fetchMock;

	await geocodePostcodes(["SE5 9QQ", "se5 9qq", " SE5  9QQ "]);

	const body = JSON.parse((fetchMock as jest.Mock).mock.calls[0][1].body as string) as { postcodes: string[] };
	expect(body.postcodes).toEqual(["SE5 9QQ"]);
});
