import { signInMessage } from "./messages";

test.each([
	["Invalid login credentials", "That email and password don't match an account."],
	["Email not confirmed", "That account hasn't been confirmed yet. Check your email."],
	["Network request failed", "Couldn't reach the server. Check your connection and try again."],
	["TypeError: Failed to fetch", "Couldn't reach the server. Check your connection and try again."],
])("%s", (raw, expected) => {
	expect(signInMessage(raw)).toBe(expected);
});

test("anything unrecognised is passed through rather than swallowed", () => {
	// Better an odd message than a generic one that hides what happened.
	expect(signInMessage("Signups not allowed for this instance")).toBe("Signups not allowed for this instance");
});
