// The last persona we successfully resolved for a user.
//
// Resolving staff-vs-agent needs a query, and a field agent opening the app in
// a car park has no network. Guessing is not an option - `resolveUserRole`
// returns null rather than treat a failed query as "no memberships", because
// that would silently demote a staff member and hide their own blocks. So the
// answer is remembered instead, per user id, and only ever used as a fallback
// when the query could not run.
//
// Not secret, and not an authorisation decision: it chooses which screens to
// show. RLS and the broker functions decide what the session may actually
// reach, and they are re-checked on every request.

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { UserRole } from "./roles";

const KEY = "fa.role";
const ROLES: UserRole[] = ["staff", "agent", "cleaner"];

interface Cached {
	userId: string;
	role: UserRole;
}

function parse(raw: string | null): Cached | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<Cached>;
		if (typeof value.userId !== "string" || !ROLES.includes(value.role as UserRole)) return null;
		return { userId: value.userId, role: value.role as UserRole };
	} catch {
		return null;
	}
}

export async function rememberRole(userId: string, role: UserRole): Promise<void> {
	try {
		await AsyncStorage.setItem(KEY, JSON.stringify({ userId, role } satisfies Cached));
	} catch {
		/* a missed cache costs a retry, never the session */
	}
}

/** The remembered role for this user, or null. Another user's is never used. */
export async function recallRole(userId: string): Promise<UserRole | null> {
	try {
		const cached = parse(await AsyncStorage.getItem(KEY));
		return cached && cached.userId === userId ? cached.role : null;
	} catch {
		return null;
	}
}

export async function forgetRole(): Promise<void> {
	try {
		await AsyncStorage.removeItem(KEY);
	} catch {
		/* nothing to do; it is only a cache */
	}
}
