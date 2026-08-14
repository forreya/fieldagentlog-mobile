// Supabase's auth errors are written for developers. These are the ones a
// person standing outside a building actually sees.
//
// Its own module so it can be tested without pulling in the provider, the
// Supabase client and native storage behind it.

/** Turn a Supabase auth error into something worth showing someone. */
export function signInMessage(raw: string): string {
	const message = raw.toLowerCase();
	if (message.includes("invalid login credentials")) return "That email and password don't match an account.";
	if (message.includes("email not confirmed")) return "That account hasn't been confirmed yet. Check your email.";
	if (message.includes("network") || message.includes("fetch")) return "Couldn't reach the server. Check your connection and try again.";
	return raw;
}
