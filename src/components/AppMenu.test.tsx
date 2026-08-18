// The overflow menu, and the reason it exists: Your reports and About had
// nowhere to live, and Sign out was taking the most reachable place on the
// screen for the rarest thing anyone does.

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { AppMenu } from "./AppMenu";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const mockSignOut = jest.fn();
jest.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

const push = router.push as jest.Mock;

beforeEach(() => jest.clearAllMocks());

async function openMenu() {
	await render(<AppMenu />);
	await act(async () => fireEvent.press(screen.getByLabelText("Menu")));
}

test("the menu is shut until it is asked for", async () => {
	await render(<AppMenu />);

	expect(screen.queryByLabelText("Sign out")).toBeNull();
});

test("it holds the places a signed-in screen has nowhere else to put", async () => {
	await openMenu();

	expect(screen.getByLabelText("Your reports")).toBeTruthy();
	expect(screen.getByLabelText("About")).toBeTruthy();
	expect(screen.getByLabelText("Sign out")).toBeTruthy();
});

test("Your reports goes to the sent list", async () => {
	await openMenu();
	await act(async () => fireEvent.press(screen.getByLabelText("Your reports")));

	expect(push).toHaveBeenCalledWith("/(app)/reports");
});

test("signing out closes the menu behind it", async () => {
	await openMenu();
	await act(async () => fireEvent.press(screen.getByLabelText("Sign out")));

	expect(mockSignOut).toHaveBeenCalled();
	expect(screen.queryByLabelText("About")).toBeNull();
});

// On iOS there is no back gesture to fall back on, so without this the menu is
// a trap.
test("tapping away closes it without going anywhere", async () => {
	await openMenu();
	await act(async () => fireEvent.press(screen.getByLabelText("Close menu")));

	expect(screen.queryByLabelText("About")).toBeNull();
	expect(push).not.toHaveBeenCalled();
	expect(mockSignOut).not.toHaveBeenCalled();
});
