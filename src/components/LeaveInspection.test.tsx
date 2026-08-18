// Leaving an inspection, and the promise the confirmation makes.
//
// Parity item 14. The reducer has always had GO_INTRO; nothing dispatched it,
// so a started inspection had Back to the first check and then no way out. An
// inspector who opened the wrong link was stuck in it.

import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import { LeaveInspection } from "./LeaveInspection";

type Button = { text?: string; style?: string; onPress?: () => void };

function pressLeave(): Button[] {
	fireEvent.press(screen.getByLabelText("Leave inspection"));
	const spy = Alert.alert as unknown as jest.Mock;
	return (spy.mock.calls[0][2] ?? []) as Button[];
}

beforeEach(() => {
	jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

test("it asks before leaving, rather than dropping out on one tap", async () => {
	await render(<LeaveInspection onLeave={jest.fn()} />);
	pressLeave();

	const spy = Alert.alert as unknown as jest.Mock;
	expect(spy.mock.calls[0][0]).toBe("Leave this inspection?");
});

// "Leave" reads like "discard" unless you are told otherwise, and the one thing
// an inspector needs to know here is that their answers survive.
test("the confirmation says the answers are kept", async () => {
	await render(<LeaveInspection onLeave={jest.fn()} />);
	pressLeave();

	const spy = Alert.alert as unknown as jest.Mock;
	expect(spy.mock.calls[0][1]).toContain("saved on this phone");
});

test("confirming leaves; the cancel option does not", async () => {
	const onLeave = jest.fn();
	await render(<LeaveInspection onLeave={onLeave} />);
	const buttons = pressLeave();

	const stay = buttons.find((b) => b.text === "Stay");
	expect(stay?.style).toBe("cancel");
	stay?.onPress?.();
	expect(onLeave).not.toHaveBeenCalled();

	buttons.find((b) => b.text === "Leave")?.onPress?.();
	expect(onLeave).toHaveBeenCalledTimes(1);
});
