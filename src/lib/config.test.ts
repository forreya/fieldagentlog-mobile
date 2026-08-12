import { backendSummary, ConfigError, deriveFunctionsBaseUrl, functionsBaseUrl, supabaseConfig } from "./config";

const PROD = { EXPO_PUBLIC_SUPABASE_URL: "https://etkiptvblskvyfzdbsic.supabase.co", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" };
const LOCAL = { EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon" };

describe("supabaseConfig", () => {
	test("accepts a complete env and trims trailing slashes", () => {
		const c = supabaseConfig({ ...PROD, EXPO_PUBLIC_SUPABASE_URL: PROD.EXPO_PUBLIC_SUPABASE_URL + "/" });
		expect(c.url).toBe("https://etkiptvblskvyfzdbsic.supabase.co");
		expect(c.publishableKey).toBe("sb_publishable_x");
	});

	test("names every missing variable", () => {
		expect(() => supabaseConfig({})).toThrow(/EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
	});

	test("rejects a malformed URL", () => {
		expect(() => supabaseConfig({ ...PROD, EXPO_PUBLIC_SUPABASE_URL: "not-a-url" })).toThrow(ConfigError);
	});
});

describe("functionsBaseUrl", () => {
	test("derives the hosted functions domain from a *.supabase.co URL", () => {
		expect(functionsBaseUrl(PROD)).toBe("https://etkiptvblskvyfzdbsic.functions.supabase.co");
	});

	test("derives /functions/v1 for the local stack", () => {
		expect(functionsBaseUrl(LOCAL)).toBe("http://127.0.0.1:54321/functions/v1");
	});

	test("an explicit EXPO_PUBLIC_FUNCTIONS_BASE_URL wins over derivation", () => {
		expect(functionsBaseUrl({ ...PROD, EXPO_PUBLIC_FUNCTIONS_BASE_URL: "https://fns.example.com/" })).toBe("https://fns.example.com");
	});

	test("throws when nothing usable is set - the wizard has no backend", () => {
		expect(() => functionsBaseUrl({})).toThrow(ConfigError);
	});
});

test("deriveFunctionsBaseUrl only rewrites bare *.supabase.co origins", () => {
	expect(deriveFunctionsBaseUrl("https://abc.supabase.co")).toBe("https://abc.functions.supabase.co");
	expect(deriveFunctionsBaseUrl("https://supabase.co.evil.com")).toBe("https://supabase.co.evil.com/functions/v1");
});

test("backendSummary never throws and never contains the key", () => {
	expect(backendSummary({})).toBe("not configured");
	expect(backendSummary(PROD)).toBe("etkiptvblskvyfzdbsic.supabase.co");
	expect(backendSummary(PROD)).not.toContain("sb_publishable");
});
