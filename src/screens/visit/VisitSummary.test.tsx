import { fireEvent, render, screen } from "@testing-library/react-native";

import type { PacketCheck, VisitPacket } from "@/api/contract";
import type { CheckResult, VisitRecord } from "@/db/types";
import type { SubmitPhase } from "@/visit/useSubmit";
import type { WizardState } from "@/visit/wizard";

import { submitAction, VisitSummary } from "./VisitSummary";

const check = (id: string, title: string): PacketCheck => ({
	id,
	code: "EL_MONTHLY",
	title,
	todo: "Do the thing.",
	freq_label: "Monthly",
	standard_ref: "BS 5266-1",
	responsibility: "Caretaker",
	status: "due",
	status_label: "Due now",
});

const answer = (over: Partial<CheckResult> = {}): CheckResult => ({
	verdict: null,
	note: "",
	severity: null,
	photo_ref: null,
	photo_local_id: null,
	...over,
});

const CHECKS = [check("c1", "Emergency lighting"), check("c2", "Fire door inspection")];

function state(results: Record<string, CheckResult>, over: Partial<VisitRecord> = {}): WizardState {
	const packet: VisitPacket = {
		visit: { id: "v1", status: "dispatched", block_name: "Elm Court", block_address: "1 Elm Rd", due_date: "2026-09-01" },
		profile: [],
		inspector: {},
		checks: CHECKS,
		fra_actions: [{ id: "a1", title: "Replace missing signage", detail: "Stair core 2", severity: "high" }],
	};
	const record: VisitRecord = {
		token: "tok",
		packet,
		inspector: { name: "A Smith", email: "a@example.com" },
		results,
		fra_updates: {},
		started_at: 1_000,
		updated_at: 1_000,
		submitted: null,
		...over,
	};
	return { record, step: "summary", checkIndex: 0 };
}

const DONE = { c1: answer({ verdict: "pass" }), c2: answer({ verdict: "fail", severity: "high", note: "Closer broken" }) };

const IDLE: SubmitPhase = { kind: "idle" };

/** `render` is async in RNTL 14; one render per test keeps `screen` honest. */
async function show(wizard: WizardState, phase: SubmitPhase = IDLE, dispatch = jest.fn(), onSubmit = jest.fn()) {
	await render(<VisitSummary state={wizard} dispatch={dispatch} phase={phase} onSubmit={onSubmit} />);
	return { dispatch, onSubmit };
}

describe("the review list", () => {
	test("every check is listed with its verdict", async () => {
		await show(state(DONE));
		await screen.findByText("Emergency lighting");

		expect(screen.getByLabelText("Emergency lighting: Pass. Edit")).toBeTruthy();
		expect(screen.getByLabelText("Fire door inspection: Fail - high. Edit")).toBeTruthy();
	});

	test("an unanswered check says so rather than looking finished", async () => {
		await show(state({ c1: answer({ verdict: "pass" }) }));
		expect(await screen.findByLabelText("Fire door inspection: Not answered. Edit")).toBeTruthy();
	});

	test("tapping a row jumps straight back to that check", async () => {
		const { dispatch } = await show(state(DONE));
		fireEvent.press(await screen.findByLabelText("Fire door inspection: Fail - high. Edit"));
		expect(dispatch).toHaveBeenCalledWith({ type: "GO_CHECK", index: 1 });
	});
});

describe("what stops a submit", () => {
	test("an unanswered check disables it and says how many", async () => {
		await show(state({ c1: answer({ verdict: "pass" }) }));
		expect(await screen.findByText(/1 check still needs a verdict/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Submit inspection", disabled: true })).toBeTruthy();
	});

	test("a failure with no severity or note disables it too", async () => {
		await show(state({ ...DONE, c2: answer({ verdict: "fail" }) }));
		expect(await screen.findByText(/1 failed check needs a severity and a note/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Submit inspection", disabled: true })).toBeTruthy();
	});

	test("a complete visit submits", async () => {
		const { onSubmit } = await show(state(DONE));
		fireEvent.press(await screen.findByRole("button", { name: "Submit inspection" }));
		expect(onSubmit).toHaveBeenCalled();
	});
});

describe("the offline submit state", () => {
	test("says the inspection is safe on the phone and stops asking", async () => {
		await show(state(DONE), { kind: "queued", online: false });
		expect(await screen.findByText(/stored on the device and sends itself/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Waiting for signal", disabled: true })).toBeTruthy();
	});

	test("a dead link is reported as dead, not as waiting", async () => {
		await show(state(DONE), { kind: "blocked", message: "This link can't be used." });
		expect(await screen.findByText("This link can't be used.")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Try again", disabled: false })).toBeTruthy();
	});
});

describe("fire risk assessment actions", () => {
	test("are offered for review, and touching one records a status", async () => {
		const { dispatch } = await show(state(DONE));
		fireEvent.press(await screen.findByLabelText("Resolved"));
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_FRA", actionId: "a1", status: "resolved", note: "" });
	});

	test("offer all three statuses, so 'work under way' need not be misfiled as outstanding", async () => {
		const { dispatch } = await show(state(DONE));
		expect(await screen.findByLabelText("Still outstanding")).toBeTruthy();
		expect(screen.getByLabelText("Resolved")).toBeTruthy();
		fireEvent.press(screen.getByLabelText("Work under way"));
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_FRA", actionId: "a1", status: "in_progress", note: "" });
	});

	test("pressing the chosen status again clears it, back to untouched", async () => {
		const wizard = state(DONE, { fra_updates: { a1: { status: "resolved", note: "" } } });
		const { dispatch } = await show(wizard);
		fireEvent.press(await screen.findByLabelText("Resolved"));
		expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_FRA", actionId: "a1" });
	});

	test("are hidden from a cleaner - judging them is not their call", async () => {
		await show(state(DONE, { cleaner_handoff: true }));
		await screen.findByText("Emergency lighting");
		expect(screen.queryByText("Replace missing signage")).toBeNull();
	});
});

describe("submitAction", () => {
	test.each([
		[{ kind: "idle" } as SubmitPhase, true, { label: "Submit inspection", busy: false, disabled: false }],
		[{ kind: "idle" } as SubmitPhase, false, { label: "Submit inspection", busy: false, disabled: true }],
		[{ kind: "submitting" } as SubmitPhase, true, { label: "Submitting", busy: true, disabled: true }],
		[{ kind: "queued", online: false } as SubmitPhase, true, { label: "Waiting for signal", busy: false, disabled: true }],
		[{ kind: "queued", online: true } as SubmitPhase, true, { label: "Try again", busy: false, disabled: false }],
	])("%o with ready=%s", (phase, ready, expected) => {
		expect(submitAction(phase, ready)).toEqual(expected);
	});
});
