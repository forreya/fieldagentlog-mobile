// The request primitive for the token-gated endpoints. One place that knows how
// to attach the visit token, time a request out, and turn every failure into an
// ApiError - so no caller ever sees a raw fetch rejection.
//
// This layer does not retry. Retrying is ordering-sensitive (photos before
// submit, one flush at a time) and belongs to the sync engine, which is the only
// thing that can see the whole queue.

import { functionsBaseUrl } from "@/lib/config";

import { ApiError, classifyStatus, offlineError, timeoutError } from "./errors";

/** Long enough for a slow site, short enough that a dead link is not a hang. */
export const DEFAULT_TIMEOUT_MS = 20_000;
/** Photos are megabytes over a phone signal; they get their own budget. */
export const UPLOAD_TIMEOUT_MS = 60_000;

export interface RequestOptions {
	/** JSON body, or a FormData for multipart. Omit for a bare POST.
	 *  Deliberately not `unknown`: a string here would be JSON-encoded into a
	 *  quoted string, which the server would reject in a confusing way. */
	body?: object | FormData;
	timeoutMs?: number;
	/** Injectable for tests; defaults to the resolved functions base URL. */
	baseUrl?: string;
}

function isFormData(value: unknown): value is FormData {
	return typeof FormData !== "undefined" && value instanceof FormData;
}

/**
 * POST to a visit endpoint with `Authorization: Bearer <visit token>`, and
 * return the parsed JSON. Throws ApiError - never a raw fetch error.
 */
export async function postVisit<T>(path: string, token: string, options: RequestOptions = {}): Promise<T> {
	const base = options.baseUrl ?? functionsBaseUrl();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
	let body: BodyInit | undefined;
	if (isFormData(options.body)) {
		// Leave Content-Type unset: the runtime adds it with the multipart
		// boundary, and setting it by hand produces an unparseable body.
		body = options.body;
	} else if (options.body !== undefined) {
		headers["Content-Type"] = "application/json";
		body = JSON.stringify(options.body);
	}

	let response: Response;
	try {
		response = await fetch(`${base}${path}`, { method: "POST", headers, body, signal: controller.signal });
	} catch {
		// A thrown fetch means no usable answer: no signal, DNS, or our own abort.
		throw timedOut ? timeoutError() : offlineError();
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) throw classifyStatus(response.status);

	try {
		return (await response.json()) as T;
	} catch {
		// 200 with an unreadable body is the server's fault, and retryable.
		throw new ApiError("server", "The server sent something we couldn't read. Try again in a moment.", { status: response.status });
	}
}
