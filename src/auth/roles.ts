// Which of the three signed-in personas a user is. Pure, so the rules can be
// tested without a Supabase client - they decide what someone can see, so they
// are worth pinning down exactly.
//
// Ported from the web app's src/state/authStore.tsx. The precedence matters:
//
//   1. A server-set `app_metadata.role === "cleaner"` claim wins outright.
//      Only staff, using the service role, can set app_metadata, so it is safe
//      to trust. A cleaner is never also an org member.
//   2. Otherwise, membership decides. Row-level security lets a user read only
//      the organization_members rows they belong to, so an empty result really
//      does mean "not staff" rather than "query failed".
//   3. No membership means an external field agent: least privilege, and the
//      broker functions gate what they can actually touch.
//
// The claim only chooses which UI to show. The backend's RLS and Edge Functions
// are the real gate, and nothing here should be treated as an authorisation
// decision.

export type UserRole = "staff" | "agent" | "cleaner";

/** The parts of a Supabase user this decision depends on. Index signatures
 *  rather than `{ role?: unknown }`, so supabase-js's own metadata types are
 *  assignable without a cast at the call site. */
export interface RoleUser {
	app_metadata?: { [key: string]: unknown } | null;
	user_metadata?: { [key: string]: unknown } | null;
}

/** The cleaner claim, or null when the user is not tagged as one. */
export function claimedRole(user: RoleUser): UserRole | null {
	const claim = user.app_metadata?.role ?? user.user_metadata?.role;
	return claim === "cleaner" ? "cleaner" : null;
}

/**
 * Resolve the persona. `organizationIds` is what the membership query returned:
 * an empty array for a non-member, and never a partial result - a failed query
 * must be treated as unknown by the caller, not passed in as empty.
 */
export function resolveRole(user: RoleUser, organizationIds: string[]): UserRole {
	return claimedRole(user) ?? (organizationIds.length > 0 ? "staff" : "agent");
}
