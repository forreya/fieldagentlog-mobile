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

import { DEFAULT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "./client";
import { ApiError, brokerMessage, classifyBrokerStatus, offlineError, timeoutError } from "./errors";
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

function isFormData(value: unknown): value is FormData {
	return typeof FormData !== "undefined" && value instanceof FormData;
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

	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
	let payload: BodyInit;
	if (isFormData(body)) {
		// No Content-Type: the runtime supplies it with the multipart boundary.
		payload = body;
	} else {
		headers["Content-Type"] = "application/json";
		payload = JSON.stringify(body);
	}

	let response: Response;
	try {
		response = await fetch(`${base}/${fn}`, { method: "POST", headers, body: payload, signal: controller.signal });
	} catch {
		throw timedOut ? timeoutError() : offlineError();
	} finally {
		clearTimeout(timer);
	}

	// Read the body before deciding: the useful message is inside it, and a
	// broker can also report failure inside a 200 (the web client's `"error" in
	// data` check exists for exactly that).
	let parsed: unknown = null;
	try {
		parsed = await response.json();
	} catch {
		parsed = null;
	}

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
