import {
	ApiError,
	classifyStatus,
	deadEndReasonFromStatus,
	deadEndReasonFromVisitStatus,
	isTerminalVisitStatus,
	offlineError,
	timeoutError,
} from "./errors";

describe("classifyStatus", () => {
	test.each([
		[500, "server"],
		[502, "server"],
		[503, "server"],
	])("%i is the server's problem, and retryable", (status, kind) => {
		const err = classifyStatus(status);
		expect(err.kind).toBe(kind);
		expect(err.retryable).toBe(true);
	});

	test.each([408, 429])("%i means busy, not broken - retryable, not a dead end", (status) => {
		const err = classifyStatus(status);
		expect(err.kind).toBe("network");
		expect(err.retryable).toBe(true);
	});

	test.each([
		[400, "unknown"],
		[401, "revoked"],
		[403, "revoked"],
		[404, "invalid"],
		[409, "used"],
		[410, "expired"],
		[418, "unknown"],
	])("%i ends the link (%s)", (status, reason) => {
		const err = classifyStatus(status);
		expect(err.kind).toBe("dead_end");
		expect(err.reason).toBe(reason);
		// The critical property: never retry a dead link. Retrying a 410 forever
		// is how a queue jams behind one bad visit.
		expect(err.retryable).toBe(false);
	});

	test("carries the status through for diagnostics", () => {
		expect(classifyStatus(503).status).toBe(503);
	});
});

describe("deadEndReasonFromStatus", () => {
	test("anything unmapped is unknown rather than a wrong guess", () => {
		expect(deadEndReasonFromStatus(422)).toBe("unknown");
	});
});

describe("deadEndReasonFromVisitStatus", () => {
	test.each([
		["submitted", "used"],
		["COMPLETED", "used"],
		["done", "used"],
		["used", "used"],
		["expired", "expired"],
		["revoked", "revoked"],
		["cancelled", "revoked"],
		["something else", "unknown"],
	])("%s -> %s", (status, reason) => {
		expect(deadEndReasonFromVisitStatus(status)).toBe(reason);
	});
});

describe("isTerminalVisitStatus", () => {
	test("recognises closed visits regardless of case or padding", () => {
		expect(isTerminalVisitStatus("Submitted")).toBe(true);
		expect(isTerminalVisitStatus("  locked ")).toBe(true);
	});

	test("an open visit is not terminal", () => {
		expect(isTerminalVisitStatus("dispatched")).toBe(false);
		expect(isTerminalVisitStatus("")).toBe(false);
	});
});

describe("ApiError", () => {
	test("survives instanceof - every call site branches on it", () => {
		const err = classifyStatus(404);
		expect(err).toBeInstanceOf(ApiError);
		expect(err).toBeInstanceOf(Error);
	});

	test("distinguishes a timeout from being offline, because the advice differs", () => {
		expect(timeoutError().timedOut).toBe(true);
		expect(offlineError().timedOut).toBe(false);
		// Both are still worth retrying when signal returns.
		expect(timeoutError().retryable).toBe(true);
		expect(offlineError().retryable).toBe(true);
	});

	test("messages are plain enough to show someone on a doorstep", () => {
		for (const err of [offlineError(), timeoutError(), classifyStatus(500), classifyStatus(404)]) {
			expect(err.message).toMatch(/[a-z]/);
			expect(err.message).not.toMatch(/undefined|\[object|Error:/);
		}
	});
});
