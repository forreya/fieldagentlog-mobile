// The one POST both front doors go through. Everything above this line differs
// (visit tokens vs session JWTs, different error vocabularies); everything
// below it is identical, and was duplicated in two files until phase B7.
//
// This layer never classifies a failure and never retries. It answers one
// question - what did the server say, if anything - and turns "no answer at
// all" into an ApiError, because a raw fetch rejection tells a caller nothing
// useful about whether to queue, re-authenticate, or give up.

import { offlineError, timeoutError } from "./errors";

/** Long enough for a slow site, short enough that a dead link is not a hang. */
export const DEFAULT_TIMEOUT_MS = 20_000;
/** Photos are megabytes over a phone signal; they get their own budget. */
export const UPLOAD_TIMEOUT_MS = 60_000;

export interface RawResponse {
	ok: boolean;
	status: number;
	/** Parsed JSON body, or undefined when there was none we could read. */
	body: unknown;
	/** Whether the body parsed. Distinguishes an empty 200 from a broken one. */
	parsed: boolean;
}

export function isFormData(value: unknown): value is FormData {
	return typeof FormData !== "undefined" && value instanceof FormData;
}

/**
 * POST with a bearer token and a timeout, and read whatever came back.
 *
 * Throws only for "no usable answer" - no signal, DNS, or our own abort. Any
 * HTTP status, including 4xx and 5xx, is returned for the caller to classify,
 * because the two front doors read the same status differently: 401 ends a
 * visit link but only interrupts a session.
 */
export async function postJson(
	url: string,
	token: string,
	body: object | FormData | undefined,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<RawResponse> {
	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
	let payload: BodyInit | undefined;
	if (isFormData(body)) {
		// Content-Type is left unset on purpose: the runtime adds it with the
		// multipart boundary, and setting it by hand yields an unparseable body.
		payload = body;
	} else if (body !== undefined) {
		headers["Content-Type"] = "application/json";
		payload = JSON.stringify(body);
	}

	let response: Response;
	try {
		response = await fetch(url, { method: "POST", headers, body: payload, signal: controller.signal });
	} catch {
		throw timedOut ? timeoutError() : offlineError();
	} finally {
		clearTimeout(timer);
	}

	try {
		return { ok: response.ok, status: response.status, body: await response.json(), parsed: true };
	} catch {
		return { ok: response.ok, status: response.status, body: undefined, parsed: false };
	}
}
