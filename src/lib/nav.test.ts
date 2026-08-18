// Back, when there may be nothing behind you.

import { router } from "expo-router";

import { goBack } from "./nav";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() } }));

const nav = router as unknown as { back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };

beforeEach(() => jest.clearAllMocks());

test("goes back when there is history", () => {
	nav.canGoBack.mockReturnValue(true);

	goBack();

	expect(nav.back).toHaveBeenCalled();
	expect(nav.replace).not.toHaveBeenCalled();
});

test("falls back to the signed-in home when there is none", () => {
	// A deep link, or a notification tap in Milestone G: expo-router answers a
	// back() with no history by logging "GO_BACK was not handled", and the
	// button silently does nothing.
	nav.canGoBack.mockReturnValue(false);

	goBack();

	expect(nav.back).not.toHaveBeenCalled();
	expect(nav.replace).toHaveBeenCalledWith("/(app)");
});

test("the keyless screens fall back to the public landing instead", () => {
	// An inspector has no signed-in home to be sent to.
	nav.canGoBack.mockReturnValue(false);

	goBack("/");

	expect(nav.replace).toHaveBeenCalledWith("/");
});
