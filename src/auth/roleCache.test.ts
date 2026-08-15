// The persona is remembered so a field agent opening the app with no signal
// still lands on their own screens instead of being asked to guess.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { forgetRole, recallRole, rememberRole } from "./roleCache";

beforeEach(async () => AsyncStorage.clear());

test("remembers and recalls a role for the same user", async () => {
	await rememberRole("user-1", "staff");
	expect(await recallRole("user-1")).toBe("staff");
});

test("never hands one user's role to another", async () => {
	// A shared phone signed into a second account must not inherit the first
	// account's screens.
	await rememberRole("user-1", "staff");
	expect(await recallRole("user-2")).toBeNull();
});

test("forgetting clears it, so signing out leaves nothing behind", async () => {
	await rememberRole("user-1", "cleaner");
	await forgetRole();
	expect(await recallRole("user-1")).toBeNull();
});

test("a corrupt or hand-edited value is ignored rather than trusted", async () => {
	await AsyncStorage.setItem("fa.role", JSON.stringify({ userId: "user-1", role: "admin" }));
	expect(await recallRole("user-1")).toBeNull();

	await AsyncStorage.setItem("fa.role", "not json");
	expect(await recallRole("user-1")).toBeNull();
});
