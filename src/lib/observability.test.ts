// Crash reporting, and specifically what it refuses to send.
//
// This app holds a cleaner's whereabouts and an inspector's account of a
// building. A crash reporter's defaults - breadcrumbs of every request,
// screenshots, the view hierarchy - would put all of it in a third-party
// dashboard, and nobody would ever know. Every assertion here is about
// something NOT leaving the phone.

import * as Sentry from "@sentry/react-native";

import { observabilityEnabled, reportProblem, startObservability } from "./observability";

jest.mock("@sentry/react-native", () => ({ init: jest.fn(), captureException: jest.fn() }));

const init = Sentry.init as jest.Mock;
const capture = Sentry.captureException as jest.Mock;

function options() {
	startObservability();
	return init.mock.calls[0][0];
}

beforeEach(() => jest.clearAllMocks());

describe("with no DSN, which is every build until one is supplied", () => {
	test("it does not start", () => {
		expect(observabilityEnabled()).toBe(false);
		startObservability();

		expect(init).not.toHaveBeenCalled();
	});

	// A caller should not have to check first, or the check gets forgotten once.
	test("reporting a handled problem is a no-op rather than a crash", () => {
		expect(() => reportProblem(new Error("nope"), "sync")).not.toThrow();
		expect(capture).not.toHaveBeenCalled();
	});
});

describe("with a DSN", () => {
	const original = process.env.EXPO_PUBLIC_SENTRY_DSN;

	beforeEach(() => {
		process.env.EXPO_PUBLIC_SENTRY_DSN = "https://key@example.ingest.sentry.io/1";
	});

	afterEach(() => {
		if (original === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
		else process.env.EXPO_PUBLIC_SENTRY_DSN = original;
	});

	test("it sends nothing that photographs the screen", () => {
		const opts = options();

		expect(opts.attachScreenshot).toBe(false);
		expect(opts.attachViewHierarchy).toBe(false);
		expect(opts.sendDefaultPii).toBe(false);
		expect(opts.enableCaptureFailedRequests).toBe(false);
	});

	// A visit URL contains the token that IS the credential for that inspection.
	// An http breadcrumb would carry it out of the building.
	test("http breadcrumbs are dropped, so no visit token travels in one", () => {
		const { beforeBreadcrumb } = options();

		expect(beforeBreadcrumb({ category: "http", data: { url: "https://x/v/secret-token" } })).toBeNull();
		expect(beforeBreadcrumb({ category: "xhr" })).toBeNull();
		expect(beforeBreadcrumb({ category: "navigation" })).not.toBeNull();
	});

	test("the request and the user are stripped from every event", () => {
		const { beforeSend } = options();

		const event = beforeSend({ request: { url: "https://x/v/secret-token" }, user: { email: "a@b.c" }, message: "boom" });

		expect(event.request).toBeUndefined();
		expect(event.user).toBeUndefined();
		expect(event.message).toBe("boom");
	});
});

// Not privacy, but the reason the whole thing is worth having: a stack trace
// nobody can tie to a build is a stack trace nobody can act on.
test("events are stamped with the exact build, so a trace can be tied to one", () => {
	process.env.EXPO_PUBLIC_SENTRY_DSN = "https://key@example.ingest.sentry.io/1";
	const opts = options();
	delete process.env.EXPO_PUBLIC_SENTRY_DSN;

	// The version plus the commit: "0.1.0" alone is the same string for every
	// build that month, which is no use to somebody reading a stack trace.
	expect(opts.release).toMatch(/.+\+.+/);
	expect(opts.dist).toBeTruthy();
});
