// The Supabase client for the signed-in app.
//
// The keyless inspector wizard must never touch this: it talks only to the
// token-gated visit functions and ships no keys at all. The client is built
// lazily so that flow never depends on sign-in config being present, which is
// the same arrangement the web app uses.
//
// Only the publishable (anon) key is ever shipped. Row-level security and the
// broker Edge Functions decide what a session may actually reach.

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import { setTokenProvider } from "@/api/broker";
import { supabaseConfig } from "@/lib/config";

import { resolveRole, type UserRole } from "./roles";
import { secureSessionStorage } from "./secureStorage";

let client: SupabaseClient | null = null;

/** True when the signed-in app has the config it needs. */
export function supabaseConfigured(): boolean {
	try {
		supabaseConfig();
		return true;
	} catch {
		return false;
	}
}

export function getSupabase(): SupabaseClient {
	if (!client) {
		const { url, publishableKey } = supabaseConfig();
		client = createClient(url, publishableKey, {
			auth: {
				storage: secureSessionStorage,
				persistSession: true,
				autoRefreshToken: true,
				// No URL to parse in a native app; leaving it on makes supabase-js
				// look for browser globals that do not exist here.
				detectSessionInUrl: false,
			},
		});

		// One place supplies the JWT for every broker call, and it asks for the
		// session each time so a refreshed token is used rather than a stale one.
		setTokenProvider(async () => {
			const { data } = await client!.auth.getSession();
			return data.session?.access_token ?? null;
		});
	}
	return client;
}

/** Test seam, and used at sign-out to drop the cached client. */
export function resetSupabase(): void {
	client = null;
}

/**
 * Which persona the signed-in user is.
 *
 * A failed membership query is NOT treated as "no memberships": that would
 * silently demote a staff member to an external agent and hide their own
 * blocks. The caller gets null and can retry.
 */
export async function resolveUserRole(supabase: SupabaseClient, user: User): Promise<{ role: UserRole; organizationIds: string[] } | null> {
	// The claim needs no query, so a cleaner works even when offline.
	const claimed = resolveRole(user, []);
	if (claimed === "cleaner") return { role: "cleaner", organizationIds: [] };

	const { data, error } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id);
	if (error) return null;

	const organizationIds = (data ?? []).map((row) => (row as { organization_id: string }).organization_id);
	return { role: resolveRole(user, organizationIds), organizationIds };
}
