// Where the Supabase session lives on the device.
//
// Not AsyncStorage on its own: that is a plaintext file in the app sandbox, and
// it holds a refresh token that is effectively a long-lived credential for a
// cleaner's or an agent's account. gena-mobile keeps its bearer token that way
// and it is the first thing to fix here, not to copy.
//
// Not SecureStore on its own either: it is backed by the iOS keychain and
// Android Keystore, which are sized for secrets, not payloads. Android throws
// past ~2 KB and a Supabase session (access JWT + refresh token + user object)
// can exceed that once claims grow. Storing it there works right up until the
// day a claim is added and every field user is silently signed out.
//
// So: a random AES key in SecureStore (small, exactly what it is for), and the
// session encrypted with it in AsyncStorage (large, and useless without the
// key). This is the pattern Supabase documents for React Native.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as aesjs from "aes-js";
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/** SecureStore keys must be alphanumeric plus ._-; Supabase's contain colons. */
function keyAlias(key: string): string {
	return `session_key_${key.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

/** Encrypt with a fresh key, keep the key in the keychain, return the ciphertext. */
async function encrypt(key: string, value: string): Promise<string> {
	const encryptionKey = getRandomBytes(32);
	const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
	const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

	await SecureStore.setItemAsync(keyAlias(key), aesjs.utils.hex.fromBytes(encryptionKey));
	return aesjs.utils.hex.fromBytes(encryptedBytes);
}

async function decrypt(key: string, value: string): Promise<string | null> {
	const stored = await SecureStore.getItemAsync(keyAlias(key));
	if (!stored) return null;

	const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(stored), new aesjs.Counter(1));
	return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
}

/**
 * The storage adapter handed to supabase-js.
 *
 * Every read is defensive. A session that cannot be decrypted - a partial
 * write, a keychain entry cleared by a restore-from-backup, a corrupted blob -
 * must read as "signed out", never as a crash on launch. Signing in again is a
 * minor annoyance; an app that cannot open is not.
 */
export const secureSessionStorage = {
	async getItem(key: string): Promise<string | null> {
		try {
			const encrypted = await AsyncStorage.getItem(key);
			if (!encrypted) return null;
			return await decrypt(key, encrypted);
		} catch {
			// Unreadable session: drop it rather than fail the launch.
			await secureSessionStorage.removeItem(key).catch(() => undefined);
			return null;
		}
	},

	async setItem(key: string, value: string): Promise<void> {
		const encrypted = await encrypt(key, value);
		await AsyncStorage.setItem(key, encrypted);
	},

	async removeItem(key: string): Promise<void> {
		await AsyncStorage.removeItem(key).catch(() => undefined);
		await SecureStore.deleteItemAsync(keyAlias(key)).catch(() => undefined);
	},
};
