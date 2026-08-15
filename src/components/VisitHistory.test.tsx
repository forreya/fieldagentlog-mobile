import { render, screen } from "@testing-library/react-native";

import type { BlockVisit } from "@/api/agent";

import { howLongAgo, severityLabel, visitDate, VisitHistory } from "./VisitHistory";

const visit = (over: Partial<BlockVisit> = {}): BlockVisit => ({
	id: "v1",
	scope: "inspector",
	at: "2026-08-14T13:20:00Z",
	due_date: "2026-09-14",
	inspector_name: "Sam Okonkwo",
	pass: 1,
	fail: 1,
	na: 1,
	fails: [{ title: "Communal fire doors", severity: "critical", note: "Closer missing on level 2" }],
	logbook_url: null,
	...over,
});

describe("severityLabel", () => {
	test("the wire's `critical` is the wizard's `Intolerable`", () => {
		// The two halves of the app must call the same band the same thing.
		expect(severityLabel("critical")).toBe("Intolerable");
		expect(severityLabel("high")).toBe("high");
	});
});

describe("howLongAgo", () => {
	const now = Date.parse("2026-08-14T12:00:00Z");

	test.each([
		["2026-08-14T09:00:00Z", "today"],
		["2026-08-13T09:00:00Z", "yesterday"],
		["2026-07-26T09:00:00Z", "19 days ago"],
		["2026-05-14T09:00:00Z", "3 months ago"],
		["2023-08-14T09:00:00Z", "3 years ago"],
	])("%s -> %s", (iso, expected) => {
		expect(howLongAgo(iso, now)).toBe(expected);
	});

	test("a visit dated in the future says nothing rather than something silly", () => {
		expect(howLongAgo("2026-09-01T09:00:00Z", now)).toBeNull();
	});

	test("an unparseable date does not crash the list", () => {
		expect(howLongAgo("nonsense", now)).toBeNull();
		expect(visitDate("nonsense")).toBe("Unknown date");
	});
});

test("a visit shows who, when, the tally and the failure", async () => {
	await render(<VisitHistory visits={[visit()]} />);

	expect(screen.getByText(/14 Aug 2026/)).toBeTruthy();
	expect(screen.getByText(/Sam Okonkwo/)).toBeTruthy();
	expect(screen.getByText("1 failed")).toBeTruthy();
	expect(screen.getByText("Intolerable")).toBeTruthy();
	expect(screen.getByText("Closer missing on level 2")).toBeTruthy();
});

test("a clean visit says so instead of showing an empty failure list", async () => {
	await render(<VisitHistory visits={[visit({ fail: 0, fails: [] })]} />);
	expect(screen.getByText("All passed")).toBeTruthy();
});

test("a cleaner's visit is labelled, because it was a different checklist", async () => {
	await render(<VisitHistory visits={[visit({ scope: "cleaner" })]} />);
	expect(screen.getByText(/cleaner's checks/)).toBeTruthy();
});

test("only four failures show before the rest fold away", async () => {
	const fails = [1, 2, 3, 4, 5, 6].map((n) => ({ title: `Fault ${n}`, severity: "high", note: null }));
	await render(<VisitHistory visits={[visit({ fail: 6, fails })]} />);

	expect(screen.getByText("Fault 4")).toBeTruthy();
	expect(screen.queryByText("Fault 5")).toBeNull();
	expect(screen.getByText("Show 2 more failures")).toBeTruthy();
});

test("a visit with nothing recorded says that rather than showing three zeroes", async () => {
	await render(<VisitHistory visits={[visit({ pass: 0, fail: 0, na: 0, fails: [] })]} />);
	expect(screen.getByText("No checks were recorded on this visit.")).toBeTruthy();
});
