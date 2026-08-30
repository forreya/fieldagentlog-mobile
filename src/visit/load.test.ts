import type { PacketCheck, VisitPacket } from "@/api/contract";
import { ApiError } from "@/api/errors";
import type { VisitRecord } from "@/db/types";

import { decideLoad, lockedRecord } from "./load";
import { buildRecord, inHouseChecks } from "./record";

const check = (over: Partial<PacketCheck> = {}): PacketCheck => ({
	id: "c1",
	code: "EL_MONTHLY",
	title: "Emergency lighting",
	todo: "Flick test",
	freq_label: "Monthly",
	standard_ref: "BS 5266-1",
	responsibility: "Caretaker",
	status: "overdue",
	status_label: "Overdue by 12 days",
	...over,
});

const packet = (over: Partial<VisitPacket> = {}): VisitPacket => ({
	visit: { id: "v1", status: "dispatched", block_name: "Elm Court", block_address: "1 Elm Rd", due_date: "2026-09-01" },
	profile: [],
	inspector: {},
	checks: [check()],
	fra_actions: [],
	...over,
});

const cachedRecord = (over: Partial<VisitRecord> = {}): VisitRecord => ({
	token: "tok",
	packet: packet(),
	inspector: { name: "A Smith", email: "a@example.com" },
	results: {},
	fra_updates: {},
	started_at: 1_000,
	updated_at: 1_000,
	submitted: null,
	...over,
});

const ok = (p = packet()) => ({ ok: true, packet: p }) as const;
const failed = (error: unknown) => ({ ok: false, error }) as const;

describe("a submitted visit is answered from cache, without asking", () => {
	test("locked in cache short-circuits everything", () => {
		const done = cachedRecord({ submitted: { visit_id: "v1", logbook_pdf_url: "u", completed_at: "2026-08-13T00:00:00Z" } });
		expect(lockedRecord(done)).toEqual(done);
		// Even against a dead link: the visit is finished, and saying so beats
		// an error. This is what lets a finished visit reopen with no signal.
		expect(decideLoad("tok", done, failed(new ApiError("dead_end", "gone"))).status).toBe("submitted");
	});

	test("an unsubmitted cache is not locked", () => {
		expect(lockedRecord(cachedRecord())).toBeNull();
		expect(lockedRecord(undefined)).toBeNull();
	});
});

describe("a successful fetch", () => {
	test("is ready, and not marked as stale", () => {
		const state = decideLoad("tok", undefined, ok());
		expect(state).toMatchObject({ status: "ready", fromCache: false });
	});

	test("carries over answers already given on this device", () => {
		const cached = cachedRecord({
			results: { c1: { verdict: "fail", note: "Blocked", severity: "high", photo_ref: null, photo_local_id: null } },
		});
		const state = decideLoad("tok", cached, ok());
		if (state.status !== "ready") throw new Error("expected ready");
		expect(state.record.results.c1.note).toBe("Blocked");
	});
});

describe("a dead link beats a usable cache", () => {
	test.each(["expired", "used", "revoked", "invalid"] as const)("%s ends the visit even with a cached packet", (reason) => {
		// The alternative would be an editable wizard built on a stale copy of a
		// visit that can no longer be submitted - work someone would lose.
		const state = decideLoad("tok", cachedRecord(), failed(new ApiError("dead_end", "no", { reason })));
		expect(state).toEqual({ status: "dead_end", reason });
	});

	test("a dead end with no reason falls back to unknown", () => {
		expect(decideLoad("tok", undefined, failed(new ApiError("dead_end", "no")))).toEqual({ status: "dead_end", reason: "unknown" });
	});
});

describe("a failed fetch falls back to the cache", () => {
	test.each([
		["network", new ApiError("network", "no signal")],
		["server", new ApiError("server", "500")],
		["unknown", new TypeError("boom")],
	])("%s carries on from cache, marked stale", (_kind, error) => {
		const state = decideLoad("tok", cachedRecord(), failed(error));
		expect(state).toMatchObject({ status: "ready", fromCache: true });
	});

	test("no signal and no cache is the offline dead stop, and retryable", () => {
		expect(decideLoad("tok", undefined, failed(new ApiError("network", "no signal")))).toEqual({ status: "offline_no_cache" });
	});

	test("any other failure with no cache is a generic, retryable error", () => {
		expect(decideLoad("tok", undefined, failed(new ApiError("server", "500")))).toEqual({ status: "error" });
		expect(decideLoad("tok", undefined, failed(new TypeError("boom")))).toEqual({ status: "error" });
	});
});

describe("specialist checks never reach the inspector", () => {
	test("contractor jobs are filtered out of the packet", () => {
		const p = packet({ checks: [check({ id: "mine" }), check({ id: "theirs", responsibility: "Contractor" })] });
		expect(inHouseChecks(p).map((c) => c.id)).toEqual(["mine"]);
	});

	test("the built record holds no result slot for them, so they cannot be submitted", () => {
		const p = packet({ checks: [check({ id: "mine" }), check({ id: "theirs", responsibility: "contractor" })] });
		const record = buildRecord("tok", p);
		expect(Object.keys(record.results)).toEqual(["mine"]);
	});
});

describe("buildRecord", () => {
	test("keeps the original start time across reloads - it is the logbook's", () => {
		const record = buildRecord("tok", packet(), cachedRecord({ started_at: 500 }), 9_999);
		expect(record.started_at).toBe(500);
		expect(record.updated_at).toBe(9_999);
	});

	test("stamps a start time on a first open", () => {
		expect(buildRecord("tok", packet(), undefined, 4_242).started_at).toBe(4_242);
	});

	test("prefills the inspector from the packet, and prefers what they typed", () => {
		expect(buildRecord("tok", packet({ inspector: { name: "Server Name", email: "s@x.com" } })).inspector.name).toBe("Server Name");
		const cached = cachedRecord({ inspector: { name: "Typed", email: "t@x.com" } });
		expect(buildRecord("tok", packet({ inspector: { name: "Server Name" } }), cached).inspector.name).toBe("Typed");
	});

	test("preserves a queued submit and the cleaner handoff flag", () => {
		const cached = cachedRecord({ submit_requested_at: 77, cleaner_handoff: true });
		const record = buildRecord("tok", packet(), cached);
		expect(record.submit_requested_at).toBe(77);
		expect(record.cleaner_handoff).toBe(true);
	});

	test("stamps the live handoff marker onto the record, where it outlives the marker", () => {
		// The production path: marker set, cached record from before the handoff
		// without the flag. The record must come out marked a cleaner visit.
		expect(buildRecord("tok", packet(), cachedRecord(), 1_000, true).cleaner_handoff).toBe(true);
		expect(buildRecord("tok", packet(), undefined, 1_000, true).cleaner_handoff).toBe(true);
		// Once a cleaner visit, always a cleaner visit - a later open with the
		// marker gone (the cleaner headed home) keeps the cached flag.
		expect(buildRecord("tok", packet(), cachedRecord({ cleaner_handoff: true }), 1_000, false).cleaner_handoff).toBe(true);
		expect(buildRecord("tok", packet(), cachedRecord(), 1_000, false).cleaner_handoff).toBe(false);
	});
});

describe("the handoff reaches the record through decideLoad", () => {
	test("on a fresh fetch and on the offline cached fallback alike", () => {
		const fetched = decideLoad("tok", cachedRecord(), ok(), 1_000, true);
		if (fetched.status !== "ready") throw new Error("expected ready");
		expect(fetched.record.cleaner_handoff).toBe(true);

		const stale = decideLoad("tok", cachedRecord(), failed(new ApiError("network", "no signal")), 1_000, true);
		if (stale.status !== "ready") throw new Error("expected ready");
		expect(stale.record.cleaner_handoff).toBe(true);
	});
});
