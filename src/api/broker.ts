// Client for the session-JWT broker functions: field-agent, cleaner and
// site-report. External personas (agents, cleaners) have no direct database
// access at all - these functions are their only route to the data, and they
// authorise the caller server-side before writing on the service role. That is
// the security model; never work around it by querying tables directly.
//
// Unlike the web app this calls the functions over plain fetch rather than
// supabase.functions.invoke, for three reasons: it reuses the timeout and abort
// handling already built for the visit endpoints, it keeps this layer testable
// without constructing a Supabase client, and invoke() hides the gateway's own
// error shape (see brokerMessage).

import { functionsBaseUrl } from "@/lib/config";

import { ApiError, brokerMessage, classifyBrokerStatus } from "./errors";
import { DEFAULT_TIMEOUT_MS, isFormData, postJson, UPLOAD_TIMEOUT_MS } from "./http";
import { notifySessionExpired } from "./session";

/** Supplies the caller's current access token, refreshing it if needed. */
export type TokenProvider = () => Promise<string | null>;

export interface BrokerOptions {
	timeoutMs?: number;
	baseUrl?: string;
}

let tokenProvider: TokenProvider = async () => null;

/** Wired once by the auth layer (phase B6). */
export function setTokenProvider(provider: TokenProvider): void {
	tokenProvider = provider;
}

/**
 * Call a broker function and return its JSON.
 *
 * A 401 raises the session-expired signal exactly once, here, so no screen has
 * to remember to check for it.
 */
export async function callBroker<T>(fn: string, body: object | FormData, options: BrokerOptions = {}): Promise<T> {
	const token = await tokenProvider();
	if (!token) {
		// No point spending a request to be told what we already know.
		notifySessionExpired();
		throw new ApiError("auth", "You're not signed in.");
	}

	const base = options.baseUrl ?? functionsBaseUrl();
	const timeoutMs = options.timeoutMs ?? (isFormData(body) ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

	// The body is read before the status is judged: the useful message lives
	// inside it, and a broker can also report failure inside a 200 (the web
	// client's `"error" in data` check exists for exactly that).
	const response = await postJson(`${base}/${fn}`, token, body, timeoutMs);
	const parsed = response.body ?? null;

	if (!response.ok) {
		const error = classifyBrokerStatus(response.status, parsed);
		if (error.kind === "auth") notifySessionExpired();
		throw error;
	}

	const said = brokerMessage(parsed);
	if (said && parsed && typeof parsed === "object" && "error" in parsed) {
		throw new ApiError("invalid", said, { status: response.status });
	}

	return parsed as T;
}
