import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Linking } from "react-native";

import { SuccessScreen } from "./SuccessScreen";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));

const mockSignedIn = { current: false };
jest.mock("@/auth/AuthProvider", () => ({
	useAuth: () => ({ state: mockSignedIn.current ? { status: "signed_in", user: { id: "u1" }, role: "agent" } : { status: "signed_out" } }),
}));

const mockHandoff = { current: { fromCleaner: false, goBack: jest.fn() } };
jest.mock("@/cleaner/useHandoff", () => ({ useHandoff: () => mockHandoff.current }));

const submitted = { visit_id: "v1", logbook_pdf_url: "https://example.test/logbook.pdf", completed_at: "2026-08-14T10:00:00Z" };

beforeEach(() => {
	jest.restoreAllMocks();
	jest.clearAllMocks();
	mockSignedIn.current = false;
	mockHandoff.current = { fromCleaner: false, goBack: jest.fn() };
});

test("names the block and says the visit is locked", async () => {
	await render(<SuccessScreen blockName="Elm Court" submitted={submitted} />);

	expect(screen.getByText(/Elm Court is done/)).toBeTruthy();
	expect(screen.getByText("This visit is now locked.")).toBeTruthy();
});

test("the logbook opens in the system browser, not in the app", async () => {
	// A signed PDF people forward, print and file - every phone already has a
	// viewer that does all three, and an in-app one would do none of them.
	const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
	await render(<SuccessScreen submitted={submitted} />);

	fireEvent.press(screen.getByRole("button", { name: "Open the logbook (PDF)" }));

	expect(open).toHaveBeenCalledWith("https://example.test/logbook.pdf");
});

test("a link that will not open says so, rather than doing nothing", async () => {
	jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
	await render(<SuccessScreen submitted={submitted} />);

	fireEvent.press(screen.getByRole("button", { name: "Open the logbook (PDF)" }));

	expect(await screen.findByText(/inspection itself is safely recorded/)).toBeTruthy();
});

test("no PDF yet is a wait, not a failure - the inspection is already in", async () => {
	await render(<SuccessScreen submitted={{ ...submitted, logbook_pdf_url: "" }} />);

	expect(screen.getByText("The logbook PDF will be available shortly.")).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Open the logbook (PDF)" })).toBeNull();
});

describe("who gets a way out", () => {
	test("an external inspector does not - the link is the whole journey", async () => {
		// Offering "your blocks" to someone with no account leads to a sign-in
		// wall, which is a worse dead end than the one it replaced.
		await render(<SuccessScreen blockName="Elm Court" submitted={submitted} />);

		expect(screen.queryByRole("button", { name: "Back to your blocks" })).toBeNull();
	});

	test("a signed-in agent does - they started from their own list and have more to do", async () => {
		mockSignedIn.current = true;
		await render(<SuccessScreen blockName="Elm Court" submitted={submitted} />);

		fireEvent.press(screen.getByRole("button", { name: "Back to your blocks" }));

		// Replace: a finished visit should not sit under the list waiting to be
		// swiped back into.
		expect(router.replace).toHaveBeenCalledWith("/(app)");
	});
});

describe("a cleaner handed off mid-visit", () => {
	beforeEach(() => {
		mockHandoff.current = { fromCleaner: true, goBack: jest.fn() };
	});

	test("is reminded to check out, not told there is nothing left to do", async () => {
		// "There's nothing else you need to do" with a timer still running invites
		// them to drive off checked in. Same sentence swap as the web app.
		await render(<SuccessScreen blockName="Elm Court" submitted={submitted} token="tok-1" />);

		expect(screen.getByText(/You're still checked in to this site - go back and check out when you leave/)).toBeTruthy();
		expect(screen.queryByText(/nothing else you need to do/)).toBeNull();
	});

	test("their way back is the site visit, marked as submitted", async () => {
		await render(<SuccessScreen blockName="Elm Court" submitted={submitted} token="tok-1" />);

		fireEvent.press(screen.getByRole("button", { name: "Back to your site visit" }));
		expect(mockHandoff.current.goBack).toHaveBeenCalledWith(true);
	});
});
