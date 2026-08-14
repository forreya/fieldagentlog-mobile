// The persona is remembered so a field agent opening the app with no signal
// still lands on their own screens instead of being asked to guess.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { forgetRole, recallRole, rememberRole } from "./roleCache";

// Same shape as the mock in secureStorage.test.ts - the native module is null
// under Jest, and these three calls are all this file needs.
jest.mock("@react-native-async-storage/async-storage", () => {
	const store = new Map<string, string>();
	return {
		__store: store,
		getItem: jest.fn(async (k: string) => store.get(k) ?? null),
		setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
		removeItem: jest.fn(async (k: string) => void store.delete(k)),
	};
});

const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => store.clear());

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
	store.set("fa.role", JSON.stringify({ userId: "user-1", role: "admin" }));
	expect(await recallRole("user-1")).toBeNull();

	store.set("fa.role", "not json");
	expect(await recallRole("user-1")).toBeNull();
});
