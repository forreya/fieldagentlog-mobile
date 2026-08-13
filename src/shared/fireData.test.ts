// First tests this logic has ever had. It ships in the FieldAgent web app too
// (src/lib/fireData.ts, mirrored byte-for-byte), so these guard both clients:
// a change that breaks one breaks the other, and until now nothing would say so.
//
// Deliberately NOT in src/shared - that directory is byte-mirrored, so adding a
// file there would break the mirror. Tests live beside it instead.

import {
	buildDashboardData,
	categoryLabel,
	daysUntil,
	dueLabel,
	dueLevel,
	frequencyLabel,
	isSpecialistResponsibility,
	type BlockRow,
	type CatalogueRow,
	type CheckRow,
} from "./fireData";

const block = (over: Partial<BlockRow> = {}): BlockRow => ({
	id: "b1",
	organization_id: "org1",
	name: "Elm Court",
	address: null,
	address_line_1: "1 Elm Road",
	address_town: "London",
	address_postcode: "SE5 8QQ",
	postcode: null,
	...over,
});

const check = (over: Partial<CheckRow> = {}): CheckRow => ({
	id: "c1",
	block_id: "b1",
	catalogue_code: "EL_MONTHLY",
	frequency: "monthly",
	responsibility: null,
	next_due_at: "2026-01-01",
	...over,
});

const catalogue: CatalogueRow[] = [
	{ code: "EL_MONTHLY", title: "Emergency lighting", category: "emergency_lighting", responsibility: "Caretaker" },
	{ code: "EL_ANNUAL", title: "EL annual test", category: "emergency_lighting", responsibility: "Contractor" },
];

describe("daysUntil", () => {
	const now = new Date(2026, 0, 15); // 15 Jan 2026, local

	test("counts whole days in both directions", () => {
		expect(daysUntil("2026-01-15", now)).toBe(0);
		expect(daysUntil("2026-01-16", now)).toBe(1);
		expect(daysUntil("2026-01-03", now)).toBe(-12);
	});

	test("ignores the time of day - a check due today is due today all day", () => {
		expect(daysUntil("2026-01-15", new Date(2026, 0, 15, 23, 59))).toBe(0);
	});

	test("crosses a DST boundary without gaining or losing a day", () => {
		// UK clocks go forward 29 Mar 2026. Naive UTC-millisecond maths returns
		// 30.958... here, which floors to the wrong day.
		expect(daysUntil("2026-04-01", new Date(2026, 2, 1))).toBe(31);
	});
});

describe("dueLevel and dueLabel", () => {
	test("classifies around the 30-day horizon", () => {
		expect(dueLevel(-1)).toBe("overdue");
		expect(dueLevel(0)).toBe("soon");
		expect(dueLevel(30)).toBe("soon");
		expect(dueLevel(31)).toBe("upcoming");
	});

	test("labels read naturally, singular and plural", () => {
		expect(dueLabel(-1)).toBe("Overdue by 1 day");
		expect(dueLabel(-12)).toBe("Overdue by 12 days");
		expect(dueLabel(0)).toBe("Due today");
		expect(dueLabel(1)).toBe("Due in 1 day");
		expect(dueLabel(31)).toBe("Scheduled");
	});
});

describe("isSpecialistResponsibility", () => {
	test("only 'contractor' is specialist, case and space insensitive", () => {
		expect(isSpecialistResponsibility("Contractor")).toBe(true);
		expect(isSpecialistResponsibility("  contractor ")).toBe(true);
		expect(isSpecialistResponsibility("Caretaker")).toBe(false);
		expect(isSpecialistResponsibility(null)).toBe(false);
		expect(isSpecialistResponsibility(undefined)).toBe(false);
	});
});

describe("buildDashboardData", () => {
	test("drops checks with no due date - they are not jobs to be done", () => {
		const data = buildDashboardData([block()], [check({ next_due_at: null })], catalogue);
		expect(data.blocks[0].jobs).toHaveLength(0);
	});

	test("excludes specialist checks from jobs but counts them for context", () => {
		const rows = [check({ id: "c1" }), check({ id: "c2", catalogue_code: "EL_ANNUAL" })];
		const data = buildDashboardData([block()], rows, catalogue);
		expect(data.blocks[0].jobs.map((j) => j.id)).toEqual(["c1"]);
		expect(data.blocks[0].specialist).toBe(1);
	});

	test("a per-block responsibility override beats the catalogue's", () => {
		// The catalogue says Caretaker; this block hires a contractor for it.
		const rows = [check({ responsibility: "Contractor" })];
		const data = buildDashboardData([block()], rows, catalogue);
		expect(data.blocks[0].jobs).toHaveLength(0);
		expect(data.blocks[0].specialist).toBe(1);
	});

	test("falls back to the catalogue code when the catalogue has no entry", () => {
		const data = buildDashboardData([block()], [check({ catalogue_code: "MYSTERY" })], []);
		expect(data.blocks[0].jobs[0].title).toBe("MYSTERY");
		expect(data.blocks[0].jobs[0].category).toBe("general");
	});

	test("orders jobs soonest-first within a block", () => {
		const rows = [
			check({ id: "late", next_due_at: "2030-01-01" }),
			check({ id: "early", next_due_at: "2020-01-01" }),
		];
		const data = buildDashboardData([block()], rows, catalogue);
		expect(data.blocks[0].jobs.map((j) => j.id)).toEqual(["early", "late"]);
	});

	test("sorts blocks by urgency: overdue first, then due-soon, then by name", () => {
		const blocks = [block({ id: "calm", name: "Alpha House" }), block({ id: "bad", name: "Zeta House" })];
		const rows = [
			check({ id: "j1", block_id: "calm", next_due_at: "2030-01-01" }),
			check({ id: "j2", block_id: "bad", next_due_at: "2020-01-01" }),
		];
		const data = buildDashboardData(blocks, rows, catalogue);
		// Zeta sorts after Alpha alphabetically, but it is overdue, so it leads.
		expect(data.blocks.map((b) => b.id)).toEqual(["bad", "calm"]);
	});

	test("totals count only work that needs doing (overdue + soon)", () => {
		const rows = [
			check({ id: "overdue", next_due_at: "2020-01-01" }),
			check({ id: "future", next_due_at: "2030-01-01" }),
		];
		const data = buildDashboardData([block()], rows, catalogue);
		expect(data.totals).toEqual({ blocks: 1, jobsDue: 1, overdue: 1 });
	});

	test("composes an address from the structured parts, preferring them over the legacy field", () => {
		const data = buildDashboardData([block({ address: "Legacy address" })], [], catalogue);
		expect(data.blocks[0].address).toBe("1 Elm Road, London, SE5 8QQ");
	});

	test("falls back to the legacy address when no parts are set", () => {
		const b = block({ address: "Legacy address", address_line_1: null, address_town: null, address_postcode: null });
		const data = buildDashboardData([b], [], catalogue);
		expect(data.blocks[0].address).toBe("Legacy address");
	});

	test("postcode prefers the structured column, falling back to the legacy one", () => {
		expect(buildDashboardData([block()], [], catalogue).blocks[0].postcode).toBe("SE5 8QQ");
		const legacy = block({ address_postcode: null, postcode: "N1 1AA" });
		expect(buildDashboardData([legacy], [], catalogue).blocks[0].postcode).toBe("N1 1AA");
	});
});

describe("labels", () => {
	test("known codes get human words, unknown ones pass through unchanged", () => {
		expect(frequencyLabel("six_monthly")).toBe("Six-monthly");
		expect(frequencyLabel("fortnightly")).toBe("fortnightly");
		expect(categoryLabel("fire_doors")).toBe("Fire doors");
		expect(categoryLabel("sprinklers")).toBe("sprinklers");
	});
});
