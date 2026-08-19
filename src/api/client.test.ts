import { postVisit } from "./client";
import { ApiError } from "./errors";
import { captureApiError, jsonResponse } from "./testing";

const BASE = "https://fns.test";
const opts = { baseUrl: BASE };

const mockFetch = jest.fn();
beforeEach(() => {
	mockFetch.mockReset();
	globalThis.fetch = mockFetch as unknown as typeof fetch;
});

describe("request shape", () => {
	test("POSTs to the base URL with the visit token as a bearer", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
		await postVisit("/visit-packet", "tok123", opts);

		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("https://fns.test/visit-packet");
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toBe("Bearer tok123");
	});

	test("a bare POST sends no body and no content type", async () => {
		mockFetch.mockResolvedValue(jsonResponse({}));
		await postVisit("/visit-packet", "t", opts);

		const [, init] = mockFetch.mock.calls[0];
		expect(init.body).toBeUndefined();
		expect(init.headers["Content-Type"]).toBeUndefined();
	});

	test("an object body is sent as JSON", async () => {
		mockFetch.mockResolvedValue(jsonResponse({}));
		await postVisit("/visit-submit", "t", { ...opts, body: { hello: "world" } });

		const [, init] = mockFetch.mock.calls[0];
		expect(init.headers["Content-Type"]).toBe("application/json");
		expect(init.body).toBe('{"hello":"world"}');
	});

	test("FormData is passed through with NO content type - the boundary must be the runtime's", async () => {
		mockFetch.mockResolvedValue(jsonResponse({}));
		const form = new FormData();
		form.append("file", "x");
		await postVisit("/visit-photo", "t", { ...opts, body: form });

		const [, init] = mockFetch.mock.calls[0];
		expect(init.body).toBe(form);
		// Setting this by hand omits the boundary and the server cannot parse it.
		expect(init.headers["Content-Type"]).toBeUndefined();
	});

	test("returns the parsed body", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ ref: "abc" }));
		await expect(postVisit("/visit-photo", "t", opts)).resolves.toEqual({ ref: "abc" });
	});
});

describe("failures", () => {
	test("a thrown fetch becomes an offline error, not a raw rejection", async () => {
		mockFetch.mockRejectedValue(new TypeError("Network request failed"));
		const err = await captureApiError(postVisit("/visit-packet", "t", opts));
		expect(err).toBeInstanceOf(ApiError);
		expect(err.kind).toBe("network");
		expect(err.timedOut).toBe(false);
	});

	test("expo fetch's transport failures are network too", async () => {
		// The winter runtime rejects genuine network failures as FetchError,
		// whose name is still "Error" - the message prefix is its only marker.
		mockFetch.mockRejectedValue(new Error("fetch failed: java.net.UnknownHostException: fns.test"));
		const err = await captureApiError(postVisit("/visit-packet", "t", opts));
		expect(err.kind).toBe("network");
		expect(err.retryable).toBe(true);
	});

	test("a request that could not be BUILT is not weather - it is a bug, and permanent", async () => {
		// FIND-011: the body converter's throw spent weeks classified as "check
		// your signal", retrying quietly forever. It must surface as invalid so
		// the failed-state UI can show it instead of the queue hiding it.
		const quiet = jest.spyOn(console, "error").mockImplementation(() => undefined);
		mockFetch.mockRejectedValue(new Error("Unsupported FormDataPart implementation"));
		const err = await captureApiError(postVisit("/visit-photo", "t", opts));
		expect(err.kind).toBe("invalid");
		expect(err.retryable).toBe(false);
		// The user copy is honest and non-technical; the real cause is logged.
		expect(err.message).not.toMatch(/FormDataPart|signal/);
		expect(quiet).toHaveBeenCalled();
		quiet.mockRestore();
	});

	test("a non-OK status is classified", async () => {
		mockFetch.mockResolvedValue(jsonResponse({}, 410));
		const err = await captureApiError(postVisit("/visit-packet", "t", opts));
		expect(err.kind).toBe("dead_end");
		expect(err.reason).toBe("expired");
	});

	test("200 with an unreadable body is the server's fault, and retryable", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => {
				throw new SyntaxError("Unexpected token <");
			},
		} as unknown as Response);

		const err = await captureApiError(postVisit("/visit-packet", "t", opts));
		expect(err.kind).toBe("server");
		expect(err.retryable).toBe(true);
	});

	test("an error body is never parsed as success", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ error: "nope" }, 404));
		await expect(postVisit("/visit-packet", "t", opts)).rejects.toThrow(ApiError);
	});
});

describe("timeouts", () => {
	test("aborts a hanging request and reports it as a timeout, not as offline", async () => {
		jest.useFakeTimers();
		// A fetch that only settles when its abort signal fires - a hung request.
		mockFetch.mockImplementation(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init.signal.addEventListener("abort", () => reject(new Error("Aborted")));
				}),
		);

		const promise = captureApiError(postVisit("/visit-packet", "t", { ...opts, timeoutMs: 20_000 }));
		jest.advanceTimersByTime(20_000);
		const err = await promise;

		expect(err).toBeInstanceOf(ApiError);
		expect(err.timedOut).toBe(true);
		expect(err.kind).toBe("network");
		jest.useRealTimers();
	});

	test("clears its timer when the request succeeds, so nothing fires later", async () => {
		jest.useFakeTimers();
		const clearSpy = jest.spyOn(globalThis, "clearTimeout");
		mockFetch.mockResolvedValue(jsonResponse({}));

		await postVisit("/visit-packet", "t", opts);

		expect(clearSpy).toHaveBeenCalled();
		expect(jest.getTimerCount()).toBe(0);
		clearSpy.mockRestore();
		jest.useRealTimers();
	});

	test("passes an abort signal on every request", async () => {
		mockFetch.mockResolvedValue(jsonResponse({}));
		await postVisit("/visit-packet", "t", opts);
		expect(mockFetch.mock.calls[0][1].signal).toBeDefined();
	});
});
