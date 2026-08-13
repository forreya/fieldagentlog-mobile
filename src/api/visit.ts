// The three token-gated endpoints an inspector's phone talks to. Nothing here
// is authenticated beyond the per-visit token in the link: no Supabase client,
// no keys. That is the whole point of this flow and must stay true.

import { postVisit, UPLOAD_TIMEOUT_MS, type RequestOptions } from "./client";
import type { LocalFile, PhotoRef, SubmitBody, SubmitResponse, VisitPacket } from "./contract";
import { ApiError, deadEndReasonFromVisitStatus, isTerminalVisitStatus } from "./errors";

type Options = Pick<RequestOptions, "baseUrl">;

/**
 * Load the visit: block, profile, due checks, open FRA actions.
 *
 * A closed visit can arrive as a perfectly good 200 whose `visit.status` says
 * it is finished, so the body is checked as well as the status code - otherwise
 * an already-submitted visit would open as an editable wizard.
 */
export async function fetchPacket(token: string, options: Options = {}): Promise<VisitPacket> {
	const packet = await postVisit<VisitPacket>("/visit-packet", token, options);
	const status = packet?.visit?.status ?? "";
	if (status && isTerminalVisitStatus(status)) {
		throw new ApiError("dead_end", "This visit is already closed.", { reason: deadEndReasonFromVisitStatus(status) });
	}
	return packet;
}

/**
 * Upload one photo and get back the opaque ref to cite on submit.
 *
 * The file is streamed from disk by the platform: `file.uri` is a local path,
 * not bytes we have loaded into memory. Ten full-resolution photos held in JS
 * memory is how a field app runs a phone out of it.
 */
export async function uploadPhoto(token: string, file: LocalFile, options: Options = {}): Promise<PhotoRef> {
	const form = new FormData();
	// The contract names the field `file`. React Native accepts a file
	// descriptor here, which the DOM typings do not describe.
	form.append("file", file as unknown as Blob);
	return postVisit<PhotoRef>("/visit-photo", token, { ...options, body: form, timeoutMs: UPLOAD_TIMEOUT_MS });
}

/**
 * Submit the completed visit. Safe to retry: the server is idempotent on the
 * visit token, so a replay after a lost response returns the stored result
 * rather than submitting twice.
 */
export async function submitVisit(token: string, body: SubmitBody, options: Options = {}): Promise<SubmitResponse> {
	return postVisit<SubmitResponse>("/visit-submit", token, { ...options, body });
}
