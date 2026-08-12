import { fireEvent, render, screen } from "@testing-library/react-native";

import { Button } from "./Button";
import { TAP } from "@/theme/tokens";

test("fires onPress and exposes a button role", async () => {
	const onPress = jest.fn();
	await render(<Button label="Submit" onPress={onPress} />);
	fireEvent.press(screen.getByRole("button", { name: "Submit" }));
	expect(onPress).toHaveBeenCalledTimes(1);
});

test("a disabled button is inert and says so to assistive tech", async () => {
	const onPress = jest.fn();
	await render(<Button label="Submit" disabled onPress={onPress} />);
	const button = screen.getByRole("button");
	fireEvent.press(button);
	expect(onPress).not.toHaveBeenCalled();
	expect(button).toBeDisabled();
});

test("a busy button swaps the label for a spinner and blocks double-submits", async () => {
	const onPress = jest.fn();
	await render(<Button label="Submitting" busy onPress={onPress} />);
	expect(screen.queryByText("Submitting")).toBeNull();
	fireEvent.press(screen.getByRole("button"));
	expect(onPress).not.toHaveBeenCalled();
});

test("default size meets the glove-friendly minimum target", async () => {
	await render(<Button label="Tap" onPress={jest.fn()} />);
	expect(screen.getByRole("button")).toHaveStyle({ minHeight: TAP });
});
