// The wire shape of a submitted visit. This is the last translation before a
// compliance record exists, so the vocabulary mapping is pinned here rather
// than trusted to review: "intolerable" must reach the column as "critical",
// and "resolved" as "done", or the insert is rejected by a CHECK constraint
// hours after the inspector has left the building.

import type { CheckResult, VisitRecord } from "@/db/types";

import { buildSubmitBody } from "./submitBody";

const answer = (over: Partial<CheckResult> = {}): CheckResult => ({
	verdict: "pass",
	note: "",
	severity: null,
	photo_ref: null,
	photo_local_id: null,
	...over,
});

const record = (over: Partial<VisitRecord> = {}): VisitRecord => ({
	token: "tok",
	packet: {},
	inspector: { name: "A Smith", email: "a@example.com" },
	results: {},
	fra_updates: {},
	started_at: Date.parse("2026-08-14T09:00:00Z"),
	updated_at: Date.parse("2026-08-14T09:30:00Z"),
	submitted: null,
	...over,
});

const NOW = new Date("2026-08-14T09:45:00Z");

describe("results", () => {
	test("an unanswered check is left out entirely, so the server leaves it due", () => {
		const body = buildSubmitBody(record({ results: { c1: answer({ verdict: null }), c2: answer() } }), NOW);
		expect(body.results).toEqual([{ check_id: "c2", status: "pass" }]);
	});

	test("a failure carries its severity as the wire word", () => {
		const body = buildSubmitBody(record({ results: { c1: answer({ verdict: "fail", severity: "intolerable", note: "Door wedged open" }) } }), NOW);
		expect(body.results[0]).toEqual({ check_id: "c1", status: "fail", note: "Door wedged open", severity: "critical" });
	});

	test.each([
		["low", "low"],
		["medium", "medium"],
		["high", "high"],
		["intolerable", "critical"],
	] as const)("severity %s goes on the wire as %s", (ui, wire) => {
		const body = buildSubmitBody(record({ results: { c1: answer({ verdict: "fail", severity: ui, note: "n" }) } }), NOW);
		expect(body.results[0].severity).toBe(wire);
	});

	test("a severity left over from a failure never rides along with a pass", () => {
		// The reducer clears it, but a record restored from an older build might
		// still hold one and a passed check with a severity is nonsense.
		const body = buildSubmitBody(record({ results: { c1: answer({ verdict: "pass", severity: "high" }) } }), NOW);
		expect(body.results[0]).not.toHaveProperty("severity");
	});

	test("a whitespace-only note is omitted rather than sent empty", () => {
		const body = buildSubmitBody(record({ results: { c1: answer({ note: "   " }) } }), NOW);
		expect(body.results[0]).not.toHaveProperty("note");
	});

	test("the photo ref is sent; the local id never is", () => {
		const body = buildSubmitBody(
			record({ results: { c1: answer({ verdict: "fail", severity: "low", note: "n", photo_ref: "visits/x.jpg", photo_local_id: "local-1" }) } }),
			NOW,
		);
		expect(body.results[0].photo_ref).toBe("visits/x.jpg");
		expect(JSON.stringify(body)).not.toContain("local-1");
	});
});

describe("fire risk assessment updates", () => {
	test("outstanding and resolved map to the statuses the column accepts", () => {
		const body = buildSubmitBody(
			record({ fra_updates: { a1: { status: "outstanding", note: "" }, a2: { status: "resolved", note: "Replaced" } } }),
			NOW,
		);
		expect(body.fra_action_updates).toEqual([
			{ id: "a1", status: "open" },
			{ id: "a2", status: "done", note: "Replaced" },
		]);
	});

	test("an untouched assessment submits no updates at all", () => {
		expect(buildSubmitBody(record(), NOW).fra_action_updates).toEqual([]);
	});
});

describe("timestamps", () => {
	test("started_at is when the visit was opened, not when it was sent", () => {
		const body = buildSubmitBody(record(), NOW);
		expect(body.started_at).toBe("2026-08-14T09:00:00.000Z");
		expect(body.completed_at).toBe("2026-08-14T09:45:00.000Z");
	});
});
