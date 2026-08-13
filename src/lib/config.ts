// Environment configuration. Fail fast and loud: a build pointing at the wrong
// backend is worse than one that refuses to start.
//
// EXPO_PUBLIC_* values come from .env in development and the EAS build
// profile's env in builds. They are inlined into the bundle and visible to
// anyone holding the app - publishable key only, never a service-role key.
//
// The two front doors have separate requirements, mirroring the web app:
// the keyless inspector wizard needs only the functions base URL, the
// signed-in app needs the Supabase URL + publishable key. Each flow asks for
// its own config so the wizard never depends on sign-in being configured.
//
// ── Why the literal process.env references below matter ─────────────────────
// Expo inlines EXPO_PUBLIC_* at build time by textually replacing
// `process.env.EXPO_PUBLIC_NAME` in the source. A dynamic read - env[name],
// destructuring, a computed key - is invisible to that transform and stays
// undefined in a release build. It still works in development, because the dev
// server populates process.env at runtime, so the mistake ships silently and
// only appears in a standalone build as "not configured". Read each variable
// once, literally, here.

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

type Env = Record<string, string | undefined>;

/** The build-time snapshot. Each name appears literally so Expo can inline it. */
const BUILD_ENV: Env = {
	EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
	EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
	EXPO_PUBLIC_FUNCTIONS_BASE_URL: process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL,
};

function readUrl(env: Env, name: string): string | null {
	const raw = (env[name] ?? "").trim().replace(/\/+$/, "");
	if (!raw) return null;
	try {
		const u = new URL(raw);
		if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
	} catch {
		throw new ConfigError(`${name} is not a valid http(s) URL: "${raw}"`);
	}
	return raw;
}

/** Supabase URL + publishable key - required by the signed-in app only. */
export function supabaseConfig(env: Env = BUILD_ENV): { url: string; publishableKey: string } {
	const url = readUrl(env, "EXPO_PUBLIC_SUPABASE_URL");
	const publishableKey = (env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
	const missing = [!url && "EXPO_PUBLIC_SUPABASE_URL", !publishableKey && "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter(Boolean);
	if (missing.length) throw new ConfigError(`Missing env: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`);
	return { url: url as string, publishableKey };
}

/** `https://<ref>.supabase.co` → `https://<ref>.functions.supabase.co`;
 *  anything else (the local stack) serves functions under `/functions/v1`. */
export function deriveFunctionsBaseUrl(supabaseUrl: string): string {
	const m = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/);
	return m ? `https://${m[1]}.functions.supabase.co` : `${supabaseUrl}/functions/v1`;
}

/** Where the token-gated visit-* Edge Functions live - the wizard's only config. */
export function functionsBaseUrl(env: Env = BUILD_ENV): string {
	const explicit = readUrl(env, "EXPO_PUBLIC_FUNCTIONS_BASE_URL");
	if (explicit) return explicit;
	const supabaseUrl = readUrl(env, "EXPO_PUBLIC_SUPABASE_URL");
	if (supabaseUrl) return deriveFunctionsBaseUrl(supabaseUrl);
	throw new ConfigError("Set EXPO_PUBLIC_FUNCTIONS_BASE_URL or EXPO_PUBLIC_SUPABASE_URL. Copy .env.example to .env.");
}

/** For About/dev screens: name the backend without throwing or leaking keys. */
export function backendSummary(env: Env = BUILD_ENV): string {
	try {
		return new URL(supabaseConfig(env).url).host;
	} catch {
		return "not configured";
	}
}
