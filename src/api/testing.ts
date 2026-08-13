// Test helpers for the api layer. Not shipped: nothing under src/ imports this
// outside *.test.ts.

import { ApiError } from "./errors";

/**
 * Await a call that must reject with an ApiError, and return it narrowed.
 *
 * Preferable to `.catch((e) => e)`: that pattern quietly passes when the call
 * *succeeds*, so a broken guard looks like a green test.
 */
export async function captureApiError(promise: Promise<unknown>): Promise<ApiError> {
	try {
		await promise;
	} catch (err) {
		if (err instanceof ApiError) return err;
		throw err;
	}
	throw new Error("Expected the call to reject with an ApiError, but it resolved.");
}

/** A fetch stand-in returning one JSON response. */
export function jsonResponse(body: unknown, status = 200): Response {
	return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}
