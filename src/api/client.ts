// The visit-endpoint caller: token in, parsed JSON out, ApiError on anything
// else. The transport itself lives in http.ts, shared with the broker client.
//
// This layer does not retry. Retrying is ordering-sensitive (photos before
// submit, one flush at a time) and belongs to the sync engine, which is the
// only thing that can see the whole queue.

import { functionsBaseUrl } from "@/lib/config";

import { ApiError, classifyStatus } from "./errors";
import { DEFAULT_TIMEOUT_MS, postJson } from "./http";

export { DEFAULT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "./http";

export interface RequestOptions {
	/** JSON body, or a FormData for multipart. Omit for a bare POST.
	 *  Deliberately not `unknown`: a string here would be JSON-encoded into a
	 *  quoted string, which the server would reject in a confusing way. */
	body?: object | FormData;
	timeoutMs?: number;
	/** Injectable for tests; defaults to the resolved functions base URL. */
	baseUrl?: string;
}

/**
 * POST to a visit endpoint with `Authorization: Bearer <visit token>`, and
 * return the parsed JSON. Throws ApiError - never a raw fetch error.
 */
export async function postVisit<T>(path: string, token: string, options: RequestOptions = {}): Promise<T> {
	const base = options.baseUrl ?? functionsBaseUrl();
	const response = await postJson(`${base}${path}`, token, options.body, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

	// Any non-OK status on a token-gated endpoint is about the link itself.
	if (!response.ok) throw classifyStatus(response.status);

	if (!response.parsed) {
		// 200 with an unreadable body is the server's fault, and retryable.
		throw new ApiError("server", "The server sent something we couldn't read. Try again in a moment.", { status: response.status });
	}
	return response.body as T;
}
