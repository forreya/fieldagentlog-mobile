// Turning a thrown thing into something worth reading on a doorstep.
//
// ApiError already carries wording written for the person holding the phone -
// the broker's own refusal where it gave one ("Your account is not active. Ask
// your managing agent."), our copy where it did not. Those are always better
// than anything generic, so they pass through untouched.
//
// Anything else is a bug rather than a condition, and gets the caller's
// fallback: a screen saying what it could not load beats a stack trace.

export function failureMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}
