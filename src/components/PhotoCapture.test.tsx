// The photo-source picker, and the platform difference that makes its button
// order a correctness question rather than a style one.

import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, Platform } from "react-native";

import type { CheckResult } from "@/db/types";

import { PhotoCapture } from "./PhotoCapture";

jest.mock("@/visit/photos", () => ({
	capturePhoto: jest.fn(),
	deniedMessage: () => "denied",
}));

const emptyResult = { verdict: "fail", photo_local_id: null, photo_ref: null } as unknown as CheckResult;

async function openPicker() {
	await render(<PhotoCapture token="t" checkId="c1" result={emptyResult} onCaptured={jest.fn()} onCleared={jest.fn()} />);
	// fireEvent is async in RNTL 14; an unawaited press leaves a dangling act()
	// that stops every later render in the file from committing.
	await fireEvent.press(screen.getByLabelText("Add a photo"));
	const spy = Alert.alert as unknown as jest.Mock;
	return (spy.mock.calls[0][2] as { text: string }[]).map((b) => b.text);
}

beforeEach(() => {
	jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
	jest.restoreAllMocks();
	Platform.OS = "ios";
});

test("iOS gets the natural order and lets the cancel style do the work", async () => {
	Platform.OS = "ios";
	expect(await openPicker()).toEqual(["Take a photo", "Choose from library", "Cancel"]);
});

test("Android puts Cancel in the neutral slot and the camera in the emphasised one", async () => {
	// Android assigns the three buttons by index: [0] neutral (left),
	// [2] positive (right, emphasised). In iOS order, Cancel would sit under the
	// thumb of anyone tapping the right-hand button by habit.
	Platform.OS = "android";
	const order = await openPicker();

	expect(order[0]).toBe("Cancel");
	expect(order[order.length - 1]).toBe("Take a photo");
});

test("both platforms offer the same three choices, however they are arranged", async () => {
	Platform.OS = "ios";
	const ios = await openPicker();
	jest.clearAllMocks();
	Platform.OS = "android";
	const android = await openPicker();

	expect([...ios].sort()).toEqual([...android].sort());
});
