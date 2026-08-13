// Client-generated identifiers.
//
// These are not cosmetic: `local_id` is the idempotency key the server upserts
// on for attendance and site reports, so a collision would silently merge two
// people's records. expo-crypto is backed by the platform's secure random
// generator, unlike Math.random.

import { randomUUID } from "expo-crypto";

/** A v4 UUID. Used for idempotency keys and for on-disk photo filenames. */
export function uuid(): string {
	return randomUUID();
}
