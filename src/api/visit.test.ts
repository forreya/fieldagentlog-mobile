import type { SubmitBody, VisitPacket } from "./contract";
import { ApiError } from "./errors";
import { captureApiError } from "./testing";
import { fetchPacket, submitVisit, uploadPhoto } from "./visit";

jest.mock("expo-file-system");

const opts = { baseUrl: "https://fns.test" };

const packet = (status: string): VisitPacket => ({
	visit: { id: "v1", status, block_name: "Elm Court", block_address: "1 Elm Rd", due_date: "2026-09-01" },
	profile: [],
	inspector: {},
	checks: [],
	fra_actions: [],
});

const mockFetch = jest.fn();
beforeEach(() => {
	mockFetch.mockReset();
	globalThis.fetch = mockFetch as unknown as typeof fetch;
});

function respond(body: unknown, status = 200) {
	mockFetch.mockResolvedValue({ ok: status < 300, status, json: async () => body } as unknown as Response);
}

describe("fetchPacket", () => {
	test("returns an open visit", async () => {
		respond(packet("dispatched"));
		await expect(fetchPacket("tok", opts)).resolves.toMatchObject({ visit: { block_name: "Elm Court" } });
	});

	test.each(["submitted", "completed", "revoked", "expired", "locked"])(
		"rejects a visit the server reports as %s, even inside a 200",
		async (status) => {
			// The dangerous case: a closed visit arriving as a perfectly good 200.
			// Without this the wizard would open, editable, over finished work.
			respond(packet(status));
			const err = await captureApiError(fetchPacket("tok", opts));
			expect(err).toBeInstanceOf(ApiError);
			expect(err.kind).toBe("dead_end");
			expect(err.retryable).toBe(false);
		},
	);

	test("maps the visit's own wording to a reason for the copy", async () => {
		respond(packet("submitted"));
		expect((await captureApiError(fetchPacket("tok", opts))).reason).toBe("used");
	});

	test("an absent status is not treated as terminal", async () => {
		respond(packet(""));
		await expect(fetchPacket("tok", opts)).resolves.toBeDefined();
	});

	test("hits the packet endpoint", async () => {
		respond(packet("dispatched"));
		await fetchPacket("tok", opts);
		expect(mockFetch.mock.calls[0][0]).toBe("https://fns.test/visit-packet");
	});
});

describe("uploadPhoto", () => {
	test("sends the file under the field name the contract specifies", async () => {
		respond({ ref: "org/visit/photo.jpg" });
		const file = { uri: "file:///tmp/a.jpg", name: "a.jpg", type: "image/jpeg" };

		const result = await uploadPhoto("tok", file, opts);

		expect(result.ref).toBe("org/visit/photo.jpg");
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("https://fns.test/visit-photo");
		expect(init.body).toBeInstanceOf(FormData);
	});

	test("sends a part the runtime's fetch accepts - never the {uri} descriptor", async () => {
		// FIND-011: Expo's fetch owns global fetch in every build and throws
		// "Unsupported FormDataPart implementation" on RN's classic descriptor,
		// before any network I/O. The part must expose bytes()/name/type and
		// carry no uri - asserted at the append() boundary, since this suite
		// runs against the DOM's FormData.
		const append = jest.spyOn(FormData.prototype, "append");
		respond({ ref: "r" });
		const file = { uri: "file:///tmp/big.jpg", name: "big.jpg", type: "image/jpeg" };

		await uploadPhoto("tok", file, opts);

		const [field, part] = append.mock.calls[0] as unknown as [string, Record<string, unknown>];
		expect(field).toBe("file");
		expect(part).not.toHaveProperty("uri");
		expect(typeof part.bytes).toBe("function");
		expect(part).toMatchObject({ name: "big.jpg", type: "image/jpeg" });
		append.mockRestore();
	});
});

describe("submitVisit", () => {
	const body: SubmitBody = {
		inspector: { name: "A Smith", email: "a@example.com" },
		started_at: "2026-08-13T09:00:00.000Z",
		completed_at: "2026-08-13T09:30:00.000Z",
		results: [{ check_id: "c1", status: "pass" }],
		fra_action_updates: [],
	};

	test("posts the body and returns the logbook link", async () => {
		respond({ ok: true, visit_id: "v1", logbook_pdf_url: "https://pdf" });

		await expect(submitVisit("tok", body, opts)).resolves.toEqual({ ok: true, visit_id: "v1", logbook_pdf_url: "https://pdf" });
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("https://fns.test/visit-submit");
		expect(JSON.parse(init.body)).toEqual(body);
	});

	test("a replayed submit is a success, not an error - the server is idempotent", async () => {
		// What a retry after a lost response looks like: the visit is already
		// completed, and the server returns the stored result again.
		respond({ ok: true, visit_id: "v1", logbook_pdf_url: "https://pdf" });
		await expect(submitVisit("tok", body, opts)).resolves.toMatchObject({ ok: true });
	});

	test("a dead link surfaces as a non-retryable error", async () => {
		respond({}, 410);
		const err = await captureApiError(submitVisit("tok", body, opts));
		expect(err.kind).toBe("dead_end");
		expect(err.retryable).toBe(false);
	});
});
