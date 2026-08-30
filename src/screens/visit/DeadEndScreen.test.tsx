// A spent link, and who gets offered a way off it.

import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { DeadEndScreen } from "./DeadEndScreen";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

const mockStatus = { current: "signed_out" as "signed_out" | "signed_in" };
jest.mock("@/auth/AuthProvider", () => ({
	useAuth: () => ({
		state: mockStatus.current === "signed_in" ? { status: "signed_in", user: { id: "u1" }, role: "agent" } : { status: "signed_out" },
	}),
}));

const mockHandoff = { current: { fromCleaner: false, goBack: jest.fn() } };
jest.mock("@/cleaner/useHandoff", () => ({ useHandoff: () => mockHandoff.current }));

beforeEach(() => {
	jest.clearAllMocks();
	mockHandoff.current = { fromCleaner: false, goBack: jest.fn() };
});

test("each reason says what happened and what to do about it", async () => {
	mockStatus.current = "signed_out";
	await render(<DeadEndScreen reason="expired" />);
	expect(screen.getByText("This link has expired")).toBeTruthy();
	expect(screen.getByText(/Ask whoever sent it for a fresh link/)).toBeTruthy();
});

test("an unknown reason still lands on usable copy rather than blank", async () => {
	mockStatus.current = "signed_out";
	await render(<DeadEndScreen reason={"nonsense" as never} />);
	expect(screen.getByText("This link can't be used")).toBeTruthy();
});

test("an inspector with no account is offered nothing - there is nowhere to send them", async () => {
	mockStatus.current = "signed_out";
	await render(<DeadEndScreen reason="used" />);
	expect(screen.queryByRole("button")).toBeNull();
});

test("a signed-in agent gets a way back, because they do have somewhere to be", async () => {
	// Reachable from Start checklist since D3. Without this they are stranded on
	// a screen with no navigation at all.
	mockStatus.current = "signed_in";
	await render(<DeadEndScreen reason="used" />);

	fireEvent.press(screen.getByRole("button", { name: "Back to your blocks" }));
	expect(router.replace).toHaveBeenCalledWith("/(app)");
});

test("a cleaner handed off mid-visit goes back to their site visit, not their blocks", async () => {
	// Their attendance timer is still running behind this screen. "Back to your
	// blocks" is somewhere they are not going; the visit they left is. Same
	// split as the web DeadEndScreen.
	mockStatus.current = "signed_in";
	mockHandoff.current = { fromCleaner: true, goBack: jest.fn() };
	await render(<DeadEndScreen reason="expired" token="tok-1" />);

	expect(screen.queryByRole("button", { name: "Back to your blocks" })).toBeNull();
	fireEvent.press(screen.getByRole("button", { name: "Back to your site visit" }));
	// Nothing was submitted on this dead end.
	expect(mockHandoff.current.goBack).toHaveBeenCalledWith(false);
});

test("still no retry, for anyone", async () => {
	// Retrying a spent link only reproduces this screen, and offering it implies
	// the problem might be the reader's.
	for (const status of ["signed_out", "signed_in"] as const) {
		mockStatus.current = status;
		const view = await render(<DeadEndScreen reason="expired" />);
		expect(screen.queryByText(/Try again/i)).toBeNull();
		view.unmount();
	}
});
