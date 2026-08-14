import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import { EnterCode } from "./EnterCode";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), back: jest.fn() } }));

const replace = router.replace as jest.Mock;
const TOKEN = "b".repeat(64);

beforeEach(() => jest.clearAllMocks());

test("a pasted link opens the visit", async () => {
	await render(<EnterCode />);

	fireEvent.changeText(screen.getByLabelText("Visit link or code"), `https://fieldagentlog.com/v/${TOKEN}`);
	fireEvent.press(await screen.findByRole("button", { name: "Open visit", disabled: false }));

	// Replaced rather than pushed, so Back from the visit behaves the way it
	// does when the link opened the app directly.
	expect(replace).toHaveBeenCalledWith({ pathname: "/v/[token]", params: { token: TOKEN } });
});

test("a bare code works too - not everyone gets a tappable link", async () => {
	await render(<EnterCode />);

	fireEvent.changeText(screen.getByLabelText("Visit link or code"), ` ${TOKEN.toUpperCase()} `);
	fireEvent.press(await screen.findByRole("button", { name: "Open visit", disabled: false }));

	expect(replace).toHaveBeenCalledWith({ pathname: "/v/[token]", params: { token: TOKEN } });
});

test("nonsense is refused here rather than sent to the server", async () => {
	await render(<EnterCode />);

	fireEvent.changeText(screen.getByLabelText("Visit link or code"), "the link from carol");
	fireEvent.press(await screen.findByRole("button", { name: "Open visit", disabled: false }));

	expect(await screen.findByText(/doesn't look like a visit link/)).toBeTruthy();
	expect(replace).not.toHaveBeenCalled();
});

test("the error clears as soon as they start fixing it", async () => {
	await render(<EnterCode />);
	const input = screen.getByLabelText("Visit link or code");

	fireEvent.changeText(input, "nope");
	fireEvent.press(await screen.findByRole("button", { name: "Open visit", disabled: false }));
	expect(await screen.findByText(/doesn't look like a visit link/)).toBeTruthy();

	fireEvent.changeText(input, TOKEN);
	await waitFor(() => expect(screen.queryByText(/doesn't look like a visit link/)).toBeNull());
});

test("an empty field cannot be submitted", async () => {
	await render(<EnterCode />);
	expect(screen.getByRole("button", { name: "Open visit", disabled: true })).toBeTruthy();
});
