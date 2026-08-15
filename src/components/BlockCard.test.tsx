import { fireEvent, render, screen } from "@testing-library/react-native";

import type { BlockWithJobs, Job } from "@/shared/fireData";

import { BlockCard, blockStatus } from "./BlockCard";

const job = (over: Partial<Job> = {}): Job => ({
	id: "j1",
	title: "Emergency lighting flick test",
	category: "emergency_lighting",
	frequency: "monthly",
	nextDueAt: "2026-08-01",
	daysUntil: -13,
	level: "overdue",
	...over,
});

const block = (over: Partial<BlockWithJobs> = {}): BlockWithJobs => ({
	id: "b1",
	organizationId: "o1",
	name: "Elm Court",
	address: "1 Elm Road, London SE1 2AB",
	postcode: "SE1 2AB",
	jobs: [],
	overdue: 0,
	soon: 0,
	upcoming: 0,
	specialist: 0,
	...over,
});

describe("blockStatus", () => {
	test("leads with the worst news", () => {
		// An agent scanning the list is deciding where to go next; "2 overdue"
		// is the sentence that decides it.
		expect(blockStatus(block({ overdue: 2, soon: 5 }))).toEqual({ text: "2 overdue", level: "overdue" });
		expect(blockStatus(block({ soon: 3 }))).toEqual({ text: "3 due soon", level: "soon" });
		expect(blockStatus(block())).toEqual({ text: "Up to date", level: "ok" });
	});
});

test("shows the block, its address and its status", async () => {
	await render(<BlockCard block={block({ overdue: 2, jobs: [job(), job({ id: "j2" })] })} onOpen={jest.fn()} />);

	expect(screen.getByText("Elm Court")).toBeTruthy();
	expect(screen.getByText("1 Elm Road, London SE1 2AB")).toBeTruthy();
	expect(screen.getByText("2 overdue")).toBeTruthy();
});

test("previews at most three jobs, then counts the rest", async () => {
	const jobs = [1, 2, 3, 4, 5].map((n) => job({ id: `j${n}` }));
	await render(<BlockCard block={block({ overdue: 5, jobs })} onOpen={jest.fn()} />);

	expect(screen.getAllByText("Emergency lighting flick test")).toHaveLength(3);
	expect(screen.getByText("and 2 more")).toBeTruthy();
});

test("upcoming jobs are not previewed - the card is about what needs doing", async () => {
	const jobs = [job({ level: "upcoming", daysUntil: 90, title: "Annual signage check" })];
	await render(<BlockCard block={block({ jobs })} onOpen={jest.fn()} />);

	expect(screen.queryByText("Annual signage check")).toBeNull();
	expect(screen.getByText("Up to date")).toBeTruthy();
});

test("the whole card opens the block", async () => {
	const onOpen = jest.fn();
	await render(<BlockCard block={block({ overdue: 1 })} onOpen={onOpen} />);

	fireEvent.press(screen.getByRole("button", { name: "Elm Court. 1 overdue" }));
	expect(onOpen).toHaveBeenCalled();
});
