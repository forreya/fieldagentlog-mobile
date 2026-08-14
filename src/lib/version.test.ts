// The one string someone reads out over the phone. It has to be short, exact,
// and never the word "undefined".

import { buildDateLabel, versionLabel } from "./version";

describe("versionLabel", () => {
	test("prefers the build number, which is what the stores show", () => {
		expect(versionLabel("0.1.0", "41", "3bb6217")).toBe("v0.1.0 (41)");
	});

	test("falls back to the commit when no build number has been assigned", () => {
		// Every run from a laptop, and any build before EAS applies a version.
		expect(versionLabel("0.1.0", "", "3bb6217")).toBe("v0.1.0 · 3bb6217");
	});

	test("still says something useful with neither", () => {
		expect(versionLabel("0.1.0", "", "")).toBe("v0.1.0");
	});
});

describe("buildDateLabel", () => {
	test("reads as a date a person would say", () => {
		expect(buildDateLabel("2026-08-14T09:05:00Z")).toMatch(/14 Aug 2026/);
	});

	test("an unparseable stamp is shown raw rather than as Invalid Date", () => {
		expect(buildDateLabel("whenever")).toBe("whenever");
	});

	test("no stamp at all says so", () => {
		expect(buildDateLabel("")).toBe("unknown");
	});
});
