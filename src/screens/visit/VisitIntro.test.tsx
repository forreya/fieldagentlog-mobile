import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";

import type { VisitPacket } from "@/api/contract";
import type { VisitRecord } from "@/db/types";
import { syncEngine } from "@/sync/engine";

import { VisitIntro } from "./VisitIntro";

const packet: VisitPacket = {
	visit: { id: "v1", status: "dispatched", block_name: "Elm Court", block_address: "1 Elm Rd", due_date: "2026-09-01" },
	profile: [],
	inspector: {},
	checks: [
		{
			id: "c1",
			code: "EL_MONTHLY",
			title: "Emergency lighting",
			todo: "",
			freq_label: "Monthly",
			standard_ref: "",
			responsibility: "",
			status: "due",
			status_label: "Due now",
		},
	],
	fra_actions: [],
};

const record: VisitRecord = {
	token: "tok",
	packet,
	inspector: { name: "", email: "" },
	results: {},
	fra_updates: {},
	started_at: 1_000,
	updated_at: 1_000,
	submitted: null,
};

beforeEach(() => syncEngine.reset());

async function show(fromCache = false) {
	const onStart = jest.fn();
	await render(<VisitIntro record={record} fromCache={fromCache} onStart={onStart} />);
	return onStart;
}

describe("starting a visit", () => {
	test("needs a name and a valid email, because both go on the logbook", async () => {
		const onStart = await show();

		fireEvent.press(screen.getByRole("button", { name: "Start inspection" }));
		expect(await screen.findByText("Please enter your name.")).toBeTruthy();
		expect(screen.getByText("Please enter a valid email address.")).toBeTruthy();
		expect(onStart).not.toHaveBeenCalled();
	});

	test("nobody is scolded before they have tried", async () => {
		await show();
		expect(screen.queryByText("Please enter your name.")).toBeNull();
	});

	test("trims what it passes on - a trailing space in an email is not an email", async () => {
		const onStart = await show();

		// userEvent, not fireEvent: it awaits each interaction, which is what
		// RNTL 14 needs for the typed value to be committed before the press -
		// and what stops a half-finished act scope leaking into the next test.
		const user = userEvent.setup();
		await user.type(screen.getByLabelText("Your name"), "  Sam Okonkwo ");
		await user.type(screen.getByLabelText("Your email"), " sam@example.com ");
		await user.press(screen.getByRole("button", { name: "Start inspection" }));

		expect(onStart).toHaveBeenCalledWith("Sam Okonkwo", "sam@example.com");
	});
});

describe("the offline notice", () => {
	test("a cached packet says so - it may be out of date", async () => {
		await show(true);
		expect(await screen.findByText("You're working offline")).toBeTruthy();
	});

	test("no signal says so even when the packet is fresh", async () => {
		syncEngine.setOnline(false);
		await show(false);
		expect(await screen.findByText("You're working offline")).toBeTruthy();
	});

	test("online with a fresh packet says nothing", async () => {
		await show(false);
		// The block name is in the app bar as well as the card, so wait on
		// something that appears exactly once.
		await screen.findByLabelText("Your name");
		expect(screen.queryByText("You're working offline")).toBeNull();
	});
});
