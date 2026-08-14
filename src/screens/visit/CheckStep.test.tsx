import { fireEvent, render, screen } from "@testing-library/react-native";

import type { PacketCheck, VisitPacket } from "@/api/contract";
import type { CheckResult, VisitRecord } from "@/db/types";
import type { WizardState } from "@/visit/wizard";

import { CheckStep } from "./CheckStep";

const check: PacketCheck = {
	id: "c1",
	code: "EL_MONTHLY",
	title: "Emergency lighting flick test",
	todo: "Operate the test key switch and confirm every fitting illuminates.",
	freq_label: "Monthly",
	standard_ref: "BS 5266-1",
	responsibility: "Caretaker",
	status: "overdue",
	status_label: "Overdue by 12 days",
};

const result = (over: Partial<CheckResult> = {}): CheckResult => ({
	verdict: null,
	note: "",
	severity: null,
	photo_ref: null,
	photo_local_id: null,
	...over,
});

const second: PacketCheck = { ...check, id: "c2", title: "Fire door inspection" };

/** Two checks by default, so the footer reads "Next"; pass index 1 for the last. */
function state(over: Partial<CheckResult> = {}, checks: PacketCheck[] = [check, second], index = 0): WizardState {
	const packet: VisitPacket = {
		visit: { id: "v1", status: "dispatched", block_name: "Elm Court", block_address: "1 Elm Rd", due_date: "2026-09-01" },
		profile: [],
		inspector: {},
		checks,
		fra_actions: [],
	};
	const record: VisitRecord = {
		token: "tok",
		packet,
		inspector: { name: "A Smith", email: "a@example.com" },
		results: { [checks[index].id]: result(over) },
		fra_updates: {},
		started_at: 1,
		updated_at: 1,
		submitted: null,
	};
	return { record, step: "checks", checkIndex: index };
}

describe("what the check card shows", () => {
	test("renders the server's words, not our own", async () => {
		await render(<CheckStep state={state()} dispatch={jest.fn()} />);
		expect(screen.getByText("Emergency lighting flick test")).toBeTruthy();
		expect(screen.getByText(/Operate the test key switch/)).toBeTruthy();
		// The due label is computed server-side and rendered verbatim.
		expect(screen.getByText("Overdue by 12 days")).toBeTruthy();
		expect(screen.getByText("Monthly")).toBeTruthy();
		expect(screen.getByText("BS 5266-1")).toBeTruthy();
	});

	test("shows progress through the visit", async () => {
		await render(<CheckStep state={state()} dispatch={jest.fn()} />);
		expect(screen.getByText(/Check 1 of 2/)).toBeTruthy();
	});
});

describe("the verdict control", () => {
	test("offers all three verdicts as radios with words, not colour alone", async () => {
		await render(<CheckStep state={state()} dispatch={jest.fn()} />);
		for (const label of ["PASS", "FAIL", "N/A"]) {
			expect(screen.getByRole("radio", { name: label })).toBeTruthy();
		}
	});

	test("marks the chosen verdict as checked for assistive tech", async () => {
		await render(<CheckStep state={state({ verdict: "pass" })} dispatch={jest.fn()} />);
		expect(screen.getByRole("radio", { name: "PASS", checked: true })).toBeTruthy();
		expect(screen.getByRole("radio", { name: "FAIL", checked: false })).toBeTruthy();
	});

	test("choosing one dispatches the verdict", async () => {
		const dispatch = jest.fn();
		await render(<CheckStep state={state()} dispatch={dispatch} />);
		fireEvent.press(screen.getByRole("radio", { name: "FAIL" }));
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_VERDICT", checkId: "c1", verdict: "fail" });
	});
});

describe("failing reveals what the logbook needs", () => {
	test("a pass shows no severity or note fields", async () => {
		await render(<CheckStep state={state({ verdict: "pass" })} dispatch={jest.fn()} />);
		expect(screen.queryByLabelText("What's wrong?")).toBeNull();
	});

	test("a failure reveals the severity ramp and the note", async () => {
		await render(<CheckStep state={state({ verdict: "fail" })} dispatch={jest.fn()} />);
		expect(screen.getByLabelText("What's wrong?")).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Intolerable" })).toBeTruthy();
	});

	test("typing the fault dispatches the note", async () => {
		const dispatch = jest.fn();
		await render(<CheckStep state={state({ verdict: "fail" })} dispatch={dispatch} />);
		fireEvent.changeText(screen.getByLabelText("What's wrong?"), "Two fittings dead");
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_NOTE", checkId: "c1", note: "Two fittings dead" });
	});
});

describe("advancing is gated on a usable answer", () => {
	test("Next is disabled until a verdict is chosen", async () => {
		await render(<CheckStep state={state()} dispatch={jest.fn()} />);
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
	});

	test("a pass unlocks it immediately", async () => {
		await render(<CheckStep state={state({ verdict: "pass" })} dispatch={jest.fn()} />);
		expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
	});

	// "Failed" on its own tells whoever has to fix it nothing, so a failure is
	// only advanceable once it carries both a severity and a note.
	test("a bare failure is locked", async () => {
		await render(<CheckStep state={state({ verdict: "fail" })} dispatch={jest.fn()} />);
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
	});

	test("a failure with a severity but no note is still locked", async () => {
		await render(<CheckStep state={state({ verdict: "fail", severity: "high" })} dispatch={jest.fn()} />);
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
	});

	test("a failure with both unlocks", async () => {
		await render(<CheckStep state={state({ verdict: "fail", severity: "high", note: "Two fittings dead" })} dispatch={jest.fn()} />);
		expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
	});

	test("whitespace does not count as a note", async () => {
		await render(<CheckStep state={state({ verdict: "fail", severity: "high", note: "    " })} dispatch={jest.fn()} />);
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
	});

	test("the last check offers Review rather than Next", async () => {
		await render(<CheckStep state={state({ verdict: "pass" }, [check, second], 1)} dispatch={jest.fn()} />);
		expect(screen.getByRole("button", { name: "Review" })).toBeTruthy();
	});

	test("Back always works, even with nothing answered", async () => {
		const dispatch = jest.fn();
		await render(<CheckStep state={state()} dispatch={dispatch} />);
		fireEvent.press(screen.getByRole("button", { name: "Back" }));
		expect(dispatch).toHaveBeenCalledWith({ type: "BACK" });
	});
});
