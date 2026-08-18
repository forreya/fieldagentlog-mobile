import {
	ApiError,
	brokerMessage,
	classifyBrokerStatus,
	classifyStatus,
	deadEndReasonFromStatus,
	deadEndReasonFromVisitStatus,
	isTerminalVisitStatus,
	offlineError,
	timeoutError,
	unfixable,
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

describe("a server message that is not worth showing", () => {
	test("a stringified object falls back to our own copy", () => {
		// Real: field-agent's catch-all sends {"error":"[object Object]"} when a
		// query throws. The block screen rendered it word for word.
		expect(brokerMessage({ error: "[object Object]" })).toBeNull();
		expect(classifyBrokerStatus(500, { error: "[object Object]" }).message).toBe("The server had a problem. Try again in a moment.");
	});

	test.each(["", "   ", "undefined", "null"])("%p is ignored too", (value) => {
		expect(brokerMessage({ error: value })).toBeNull();
	});

	test("a real message still wins", () => {
		expect(brokerMessage({ error: "You are not assigned to this block." })).toBe("You are not assigned to this block.");
	});
});

describe("unfixable", () => {
	// The predicate a queue uses to decide "stop offering this forever".

	test.each([["dead_end"], ["forbidden"], ["invalid"]] as const)("%s can never succeed", (kind) => {
		expect(unfixable(new ApiError(kind, "nope"))).toBe(true);
	});

	test.each([["network"], ["server"]] as const)("%s is worth retrying", (kind) => {
		expect(unfixable(new ApiError(kind, "later"))).toBe(false);
	});

	test("an expired session is NOT unfixable - signing back in fixes it", () => {
		// The bug this exists for. `auth` is not retryable as-is, so a queue keying
		// off `retryable` marks the work permanently failed - throwing away a
		// visit, shift or report that would send the moment somebody signs in.
		// Found on device: two queued reports came back "You're not signed in."
		// and were never offered again.
		expect(unfixable(new ApiError("auth", "You're not signed in."))).toBe(false);
		expect(new ApiError("auth", "x").retryable).toBe(false);
	});

	test("anything that is not an ApiError is not our call to make", () => {
		expect(unfixable(new Error("kaboom"))).toBe(false);
		expect(unfixable("kaboom")).toBe(false);
		expect(unfixable(null)).toBe(false);
	});
});
