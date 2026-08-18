// Who is signed in, for the whole app.
//
// The keyless inspector wizard does NOT depend on any of this. It must open
// with no account, no config and no signal, so nothing here may gate it - the
// provider sits above the router but the visit route ignores it entirely.
//
// Sign-out deliberately leaves the offline queues alone. A cleaner whose
// session expires mid-shift still has un-synced attendance on the device; it is
// keyed for idempotent replay and belongs to the device, not to the session.

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { onSessionExpired } from "@/api/session";
import { requestSync } from "@/sync/triggers";

import { signInMessage } from "./messages";
import { forgetRole, recallRole, rememberRole } from "./roleCache";
import type { UserRole } from "./roles";
import { getSupabase, resolveUserRole, supabaseConfigured } from "./supabase";

export type AuthState =
	/** Still restoring a stored session. Show nothing that depends on the answer. */
	| { status: "loading" }
	/** No session, or it ended. */
	| { status: "signed_out" }
	/** Signed in, persona known. */
	| { status: "signed_in"; user: User; role: UserRole }
	/** Signed in, but which persona could not be established and was never
	 *  cached - almost always a first sign-in with no signal. Retryable. */
	| { status: "role_unknown"; user: User }
	/** This build has no Supabase config, so signing in is impossible. The
	 *  wizard still works; saying so beats a login form that cannot succeed. */
	| { status: "unconfigured" };

export interface Auth {
	state: AuthState;
	signIn: (email: string, password: string) => Promise<{ error: string | null }>;
	signOut: () => Promise<void>;
	/** Re-attempt persona resolution after a `role_unknown`. */
	retryRole: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
	const value = useContext(AuthContext);
	if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
	return value;
}

/** Decide the persona for a session. Closes over nothing, so it can be tested
 *  and reasoned about on its own. */
async function personaFor(session: Session | null): Promise<AuthState> {
	if (!session?.user) return { status: "signed_out" };
	const user = session.user;

	const resolved = await resolveUserRole(getSupabase(), user);
	if (resolved) {
		void rememberRole(user.id, resolved.role);
		return { status: "signed_in", user, role: resolved.role };
	}
	// The query failed - offline, or the server is unwell. Never guess: treating
	// that as "no memberships" would demote a staff member to an external agent
	// and hide their own blocks.
	const remembered = await recallRole(user.id);
	return remembered ? { status: "signed_in", user, role: remembered } : { status: "role_unknown", user };
}

async function signIn(email: string, password: string): Promise<{ error: string | null }> {
	if (!supabaseConfigured()) return { error: "This build isn't configured for signing in." };
	const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
	// onAuthStateChange adopts the session; there is nothing to set here.
	return { error: error ? signInMessage(error.message) : null };
}

/** The sign-out sequence. Exported so a test can prove what it does NOT do. */
export async function endSession(): Promise<void> {
	try {
		// Local scope, not the library's global default.
		//
		// Global revokes every refresh token the account has, so one person
		// tapping Sign out at the end of a shift signs out every other device on
		// that account - and a shared company login across a team's phones is
		// normal here. Watched on a device: signing out on one phone dropped
		// another mid-shift, with no explanation on the phone it happened to.
		//
		// Signing out everywhere is a real thing to want, but it is an account
		// action taken deliberately, not what this button means.
		if (supabaseConfigured()) await getSupabase().auth.signOut({ scope: "local" });
	} catch {
		// Already gone server-side, or no signal. The local session is cleared
		// either way, which is what signing out means here.
	}
	await forgetRole();
	// The client deliberately OUTLIVES the sign-out. AuthProvider subscribes to
	// onAuthStateChange once, on the instance it captured at mount; dropping the
	// cached client here meant the next sign-in built a second instance and
	// signed in on that, while the listener still watched the first. Auth
	// returned 200, no event ever arrived, and the app sat on the sign-in form
	// with no error - only an app restart cleared it.
	//
	// signOut() has already emptied the session, so there is nothing stale to
	// throw away. The offline queues are untouched on purpose.
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AuthState>(() => (supabaseConfigured() ? { status: "loading" } : { status: "unconfigured" }));

	const adopt = useCallback(async (session: Session | null) => {
		setState(await personaFor(session));
		// A session arriving is a sync trigger in its own right.
		//
		// Work that failed with "You're not signed in." is retryable, not dead -
		// signing back in is exactly what makes it succeed. Without this nudge the
		// queue sat there while the app was open and signed in, and only moved at
		// the next unrelated trigger. Watched on device: a report waited through a
		// whole session and left on the next foreground.
		//
		// Fires on token refresh too, which is the same situation arriving by a
		// different route. The engine is single-flight and skips when there is no
		// work, so a spare call costs nothing.
		if (session) requestSync("signed in");
	}, []);

	useEffect(() => {
		if (!supabaseConfigured()) return;
		const supabase = getSupabase();
		void supabase.auth.getSession().then(({ data }) => adopt(data.session));

		const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => void adopt(session));
		// A 401 from any broker call means the session is gone; the api layer
		// announces it and this is the one place that reacts.
		const stopExpiry = onSessionExpired(() => setState({ status: "signed_out" }));

		return () => {
			sub.subscription.unsubscribe();
			stopExpiry();
		};
	}, [adopt]);

	const signOut = useCallback(async () => {
		setState({ status: "signed_out" });
		await endSession();
	}, []);

	const retryRole = useCallback(async () => {
		const { data } = await getSupabase().auth.getSession();
		await adopt(data.session);
	}, [adopt]);

	const value = useMemo<Auth>(() => ({ state, signIn, signOut, retryRole }), [state, signOut, retryRole]);
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
