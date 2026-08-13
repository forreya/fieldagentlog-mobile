import { callBroker, setTokenProvider } from "./broker";
import { ApiError } from "./errors";
import { onSessionExpired, resetSessionListeners } from "./session";
import { captureApiError, jsonResponse } from "./testing";

const opts = { baseUrl: "https://fns.test" };

const mockFetch = jest.fn();
beforeEach(() => {
	mockFetch.mockReset();
	globalThis.fetch = mockFetch as unknown as typeof fetch;
	resetSessionListeners();
	setTokenProvider(async () => "session.jwt.here");
});

describe("request shape", () => {
	test("posts to /<function> with the session JWT", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ blocks: [] }));
		await callBroker("field-agent", { action: "my-blocks" }, opts);

		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("https://fns.test/field-agent");
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toBe("Bearer session.jwt.here");
		expect(JSON.parse(init.body)).toEqual({ action: "my-blocks" });
	});

	test("multipart bodies keep the runtime's boundary and get the upload timeout", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ ref: "r" }));
		const form = new FormData();
		form.append("block_id", "b1");

		await callBroker("site-report", form, opts);

		const [, init] = mockFetch.mock.calls[0];
		expect(init.body).toBe(form);
		expect(init.headers["Content-Type"]).toBeUndefined();
	});

	test("asks for a fresh token on every call, so a refreshed session is used", async () => {
		const provider = jest.fn().mockResolvedValue("t1");
		setTokenProvider(provider);
		mockFetch.mockResolvedValue(jsonResponse({}));

		await callBroker("cleaner", { action: "my-sites" }, opts);
		await callBroker("cleaner", { action: "my-sites" }, opts);

		expect(provider).toHaveBeenCalledTimes(2);
	});
});

describe("session expiry", () => {
	test("a 401 raises the signal exactly once, so no screen has to check", async () => {
		const listener = jest.fn();
		onSessionExpired(listener);
		mockFetch.mockResolvedValue(jsonResponse({ error: "Invalid session." }, 401));

		const err = await captureApiError(callBroker("field-agent", { action: "my-blocks" }, opts));

		expect(err.kind).toBe("auth");
		expect(listener).toHaveBeenCalledTimes(1);
	});

	test("no token means no wasted request, but still a clear auth error", async () => {
		setTokenProvider(async () => null);
		const listener = jest.fn();
		onSessionExpired(listener);

		const err = await captureApiError(callBroker("cleaner", { action: "my-sites" }, opts));

		expect(err.kind).toBe("auth");
		expect(mockFetch).not.toHaveBeenCalled();
		expect(listener).toHaveBeenCalledTimes(1);
	});

	test("a 403 is NOT a session problem - do not sign the user out over it", async () => {
		// "That site isn't assigned to you" must not look like an expired login,
		// or a cleaner gets kicked to the sign-in screen for tapping the wrong row.
		const listener = jest.fn();
		onSessionExpired(listener);
		mockFetch.mockResolvedValue(jsonResponse({ error: "Site not assigned to you." }, 403));

		const err = await captureApiError(callBroker("cleaner", { action: "check-in" }, opts));

		expect(err.kind).toBe("forbidden");
		expect(err.message).toBe("Site not assigned to you.");
		expect(listener).not.toHaveBeenCalled();
	});

	test("a throwing listener cannot mask the auth error", async () => {
		onSessionExpired(() => {
			throw new Error("listener blew up");
		});
		mockFetch.mockResolvedValue(jsonResponse({ error: "Invalid session." }, 401));

		const err = await captureApiError(callBroker("field-agent", { action: "my-blocks" }, opts));
		expect(err.kind).toBe("auth");
	});
});

describe("error messages", () => {
	test("surfaces the function's own wording", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ error: "No sites assigned to your account." }, 403));
		const err = await captureApiError(callBroker("site-report", { action: "my-blocks" }, opts));
		expect(err.message).toBe("No sites assigned to your account.");
	});

	test("surfaces the Supabase gateway's shape too, which supabase-js would hide", async () => {
		// Verified against production: the gateway answers { code, message },
		// the function answers { error }. Both must reach the user.
		mockFetch.mockResolvedValue(jsonResponse({ code: "UNAUTHORIZED_INVALID_JWT_FORMAT", message: "Invalid JWT" }, 401));
		const err = await captureApiError(callBroker("field-agent", { action: "my-blocks" }, opts));
		expect(err.message).toBe("Invalid JWT");
	});

	test("falls back to our own wording when the server says nothing useful", async () => {
		mockFetch.mockResolvedValue(jsonResponse(null, 500));
		const err = await captureApiError(callBroker("cleaner", { action: "my-sites" }, opts));
		expect(err.kind).toBe("server");
		expect(err.message).toMatch(/server had a problem/i);
	});

	test("an error reported inside a 200 is still an error", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ error: "Bad photo list." }, 200));
		const err = await captureApiError(callBroker("site-report", { action: "create" }, opts));
		expect(err.kind).toBe("invalid");
		expect(err.message).toBe("Bad photo list.");
	});

	test("a normal success is returned untouched", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ sites: [{ id: "s1" }] }));
		await expect(callBroker("cleaner", { action: "my-sites" }, opts)).resolves.toEqual({ sites: [{ id: "s1" }] });
	});
});

describe("retryability", () => {
	test.each([
		[401, false],
		[403, false],
		[400, false],
		[429, true],
		[500, true],
		[503, true],
	])("%i -> retryable=%s", async (status, retryable) => {
		mockFetch.mockResolvedValue(jsonResponse({}, status));
		const err = await captureApiError(callBroker("cleaner", { action: "my-sites" }, opts));
		expect(err.retryable).toBe(retryable);
	});

	test("no signal is retryable and not an auth problem", async () => {
		mockFetch.mockRejectedValue(new TypeError("Network request failed"));
		const err = await captureApiError(callBroker("cleaner", { action: "my-sites" }, opts));
		expect(err).toBeInstanceOf(ApiError);
		expect(err.kind).toBe("network");
		expect(err.retryable).toBe(true);
	});
});
