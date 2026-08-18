// Turning a thrown thing into something worth reading on a doorstep.
//
// ApiError already carries wording written for the person holding the phone -
// the broker's own refusal where it gave one ("Your account is not active. Ask
// your managing agent."), our copy where it did not. Those are always better
// than anything generic, so they pass through untouched.
//
// Anything else is a bug rather than a condition, and gets the caller's
// fallback: a screen saying what it could not load beats a stack trace.
//
// That last paragraph described the intent from the start; the check was
// `instanceof Error`, which is every thrown thing in JavaScript. A PostgREST
// refusal ("new row violates row-level security policy for table
// \"fire_visits\"") reached the screen through here, because a Supabase error
// is an Error like any other. Only OUR errors are vetted copy, and ApiError is
// what marks them.

import { ApiError } from "@/api/errors";

export function failureMessage(error: unknown, fallback: string): string {
	return error instanceof ApiError && error.message ? error.message : fallback;
}
