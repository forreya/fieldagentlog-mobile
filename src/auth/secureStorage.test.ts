import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { secureSessionStorage } from "./secureStorage";

jest.mock("@react-native-async-storage/async-storage", () => {
	const store = new Map<string, string>();
	return {
		__store: store,
		getItem: jest.fn(async (k: string) => store.get(k) ?? null),
		setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
		removeItem: jest.fn(async (k: string) => void store.delete(k)),
	};
});

jest.mock("expo-secure-store", () => {
	const keys = new Map<string, string>();
	return {
		__keys: keys,
		getItemAsync: jest.fn(async (k: string) => keys.get(k) ?? null),
		setItemAsync: jest.fn(async (k: string, v: string) => void keys.set(k, v)),
		deleteItemAsync: jest.fn(async (k: string) => void keys.delete(k)),
	};
});

const store = (AsyncStorage as unknown as { __store: Map<string, string> }).__store;
const keys = (SecureStore as unknown as { __keys: Map<string, string> }).__keys;

const KEY = "sb-etkiptvblskvyfzdbsic-auth-token";
const session = JSON.stringify({ access_token: "a".repeat(900), refresh_token: "r".repeat(64), user: { id: "u1" } });

beforeEach(() => {
	store.clear();
	keys.clear();
	jest.clearAllMocks();
});

describe("round trip", () => {
	test("stores and returns a session unchanged", async () => {
		await secureSessionStorage.setItem(KEY, session);
		expect(await secureSessionStorage.getItem(KEY)).toBe(session);
	});

	test("handles a session far larger than SecureStore's own limit", async () => {
		// The reason for this design: Android's Keystore rejects values past
		// ~2 KB, and sessions grow as claims are added.
		const large = JSON.stringify({ token: "x".repeat(20_000) });
		await secureSessionStorage.setItem(KEY, large);
		expect(await secureSessionStorage.getItem(KEY)).toBe(large);
	});

	test("an absent session reads as null, not an error", async () => {
		expect(await secureSessionStorage.getItem(KEY)).toBeNull();
	});
});

describe("what is written where", () => {
	test("the session in AsyncStorage is ciphertext, not the token", async () => {
		await secureSessionStorage.setItem(KEY, session);
		const written = store.get(KEY) as string;
		expect(written).not.toContain("access_token");
		expect(written).not.toContain("aaaa");
		expect(written).toMatch(/^[0-9a-f]+$/);
	});

	test("only the key goes to the keychain, and it is small", async () => {
		await secureSessionStorage.setItem(KEY, session);
		const [alias, value] = [...keys.entries()][0];
		// 32 bytes as hex. Comfortably inside every platform limit.
		expect(value).toHaveLength(64);
		// SecureStore rejects keys with characters like ':' that Supabase uses.
		expect(alias).toMatch(/^[A-Za-z0-9._-]+$/);
	});

	test("each write uses a fresh key, so one leaked key does not read the next session", async () => {
		await secureSessionStorage.setItem(KEY, session);
		const first = [...keys.values()][0];
		await secureSessionStorage.setItem(KEY, session);
		expect([...keys.values()][0]).not.toBe(first);
	});
});

describe("recovery - a bad session must never stop the app opening", () => {
	test("a corrupt blob reads as signed out and clears itself", async () => {
		store.set(KEY, "not-valid-hex-!!");
		keys.set(`session_key_${KEY.replace(/[^A-Za-z0-9._-]/g, "_")}`, "00".repeat(32));

		expect(await secureSessionStorage.getItem(KEY)).toBeNull();
		// Cleared, so the next launch does not repeat the failure.
		expect(store.has(KEY)).toBe(false);
	});

	test("a session whose key is gone reads as signed out", async () => {
		// What a restore-from-backup looks like: AsyncStorage came back, the
		// keychain entry did not.
		await secureSessionStorage.setItem(KEY, session);
		keys.clear();
		expect(await secureSessionStorage.getItem(KEY)).toBeNull();
	});

	test("removing clears both halves, leaving nothing recoverable", async () => {
		await secureSessionStorage.setItem(KEY, session);
		await secureSessionStorage.removeItem(KEY);
		expect(store.size).toBe(0);
		expect(keys.size).toBe(0);
	});

	test("removing something that was never stored is harmless", async () => {
		await expect(secureSessionStorage.removeItem(KEY)).resolves.toBeUndefined();
	});
});
