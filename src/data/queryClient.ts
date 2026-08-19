// Server state - the things BalanceBuddy owns and this app only reads.
//
// Deliberately NOT the sync engine. That queues writes the device owns and must
// never lose; this caches reads the server owns and can always re-fetch. Mixing
// them would put a dashboard refresh in the same retry loop as an inspection
// somebody spent an hour on.
//
// The cache is persisted, because a field agent opening the app in a car park
// should see yesterday's round rather than a spinner. Anything shown from the
// cache is stamped with when it was fetched, so nobody is misled about how old
// it is.

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Long enough that walking between blocks does not re-fetch; short enough that
 *  a check completed this morning shows up. */
const STALE_MS = 5 * 60_000;

/** How long a persisted cache is still worth showing. A week-old round is
 *  misleading rather than helpful, and the stamp would have to shout about it. */
const MAX_AGE_MS = 24 * 60 * 60_000;

export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: STALE_MS,
				gcTime: MAX_AGE_MS,
				// The app has its own connectivity signal and its own retry
				// thinking; two systems guessing at the network is one too many.
				retry: 1,
				refetchOnReconnect: true,
				refetchOnWindowFocus: false,
			},
		},
	});
}

const PERSIST_KEY = "fa.query";

export function createPersister() {
	return createAsyncStoragePersister({ storage: AsyncStorage, key: PERSIST_KEY });
}

/**
 * Drop the persisted snapshot. Called on sign-out: signing out is deliberate,
 * and the read cache is that user's data at rest in plain AsyncStorage - it
 * must not wait 24 hours to age off a shared phone.
 *
 * Belt and braces, not the whole defence: every user-owned query key also
 * carries the user id, so a snapshot that somehow survives can never hydrate
 * under another account anyway.
 */
export async function clearPersistedReadCache(): Promise<void> {
	try {
		await AsyncStorage.removeItem(PERSIST_KEY);
	} catch {
		/* storage refused; the user-scoped keys still make the snapshot inert */
	}
}

export const persistOptions = { maxAge: MAX_AGE_MS } as const;
