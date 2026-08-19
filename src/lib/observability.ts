// Crash reporting, and the things it is not allowed to carry.
//
// Worth having because the failures that matter here happen where nobody can
// watch them: a cleaner in a basement, an inspector on a roof, a phone that has
// been offline since Tuesday. A crash there is currently invisible to us - the
// person shrugs and stops using the app.
//
// Worth being careful about because of what this app holds. A site report is
// somebody's account of a building they work in; an attendance record is where
// a named person stood at a named time. None of that belongs in a third-party
// dashboard, and a crash reporter that scoops up request bodies and screen
// contents would put it there by default. So the configuration below is mostly
// a list of refusals.

import * as Sentry from "@sentry/react-native";

import { APP_VERSION, BUILD_COMMIT, BUILD_NUMBER, BUILD_PROFILE } from "./version";

/**
 * Off unless a DSN is supplied at build time.
 *
 * There is no fallback DSN and no default project: a build that was not given
 * one reports nothing at all, which is the right behaviour for a fork, a local
 * run, or a test. `EXPO_PUBLIC_` because it has to reach the client bundle;
 * a Sentry DSN is a write-only ingest key and is not a secret, unlike the auth
 * token used to upload source maps at build time.
 */
function dsn(): string {
	return process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
}

export function observabilityEnabled(): boolean {
	return dsn().length > 0;
}

export function startObservability(): void {
	if (!observabilityEnabled()) return;

	Sentry.init({
		dsn: dsn(),
		// The build, not the marketing version: "which exact bundle is on that
		// phone" is the question a stack trace has to answer, and it is the same
		// string the About screen reads out down a phone line.
		release: `${APP_VERSION}+${BUILD_COMMIT || "local"}`,
		dist: BUILD_NUMBER || "0",
		environment: BUILD_PROFILE || "development",

		// Everything below is a refusal.
		//
		// No breadcrumb of what was typed, tapped or requested: those carry note
		// text, addresses and tokens.
		enableAutoPerformanceTracing: false,
		enableCaptureFailedRequests: false,
		// Screenshots and view hierarchies would photograph a half-written report.
		attachScreenshot: false,
		attachViewHierarchy: false,
		// Off by default; naming it so nobody turns it on without thinking.
		sendDefaultPii: false,

		beforeBreadcrumb(breadcrumb) {
			// http breadcrumbs carry full URLs, and a visit URL contains the token
			// that IS the credential for that inspection.
			if (breadcrumb.category === "http" || breadcrumb.category === "xhr") return null;
			return breadcrumb;
		},

		beforeSend(event) {
			// Belt and braces: strip the request even if a future SDK version
			// starts attaching one.
			delete event.request;
			delete event.user;
			return event;
		},
	});
}

/** Report something we caught and handled. Silent when there is no DSN. */
export function reportProblem(error: unknown, context: string): void {
	if (!observabilityEnabled()) return;
	Sentry.captureException(error, { tags: { context } });
}
