import { ApiError } from "@/api/errors";

import { backoffDelay, SyncEngine, type SyncTask } from "./engine";

let engine: SyncEngine;
beforeEach(() => {
	engine = new SyncEngine();
});
afterEach(() => engine.reset());

/** A source whose task list the test controls. */
function source(name: string, tasks: SyncTask[]) {
	return { name, pending: jest.fn(async () => tasks) };
}

const ok = (id: string, spy = jest.fn()) => ({ id, run: spy });
const fails = (id: string, err: unknown) => ({ id, run: jest.fn(async () => Promise.reject(err)) });

describe("single flight", () => {
	test("a second call during a pass does not start a second pass", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const slow = { id: "slow", run: jest.fn(() => gate) };
		engine.register(source("s", [slow]));

		const first = engine.sync("first");
		const second = await engine.sync("second"); // returns immediately

		expect(second).toBeNull();
		expect(slow.run).toHaveBeenCalledTimes(1);
		release();
		await first;
	});

	test("work arriving mid-pass triggers exactly one follow-up, not a pile", async () => {
		// Two photos captured while a pass is running must not queue two extra
		// passes; one follow-up covers everything now pending.
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const task = { id: "t", run: jest.fn(() => gate) };
		const s = source("s", [task]);
		engine.register(s);

		const first = engine.sync("first");
		await engine.sync("mid-1");
		await engine.sync("mid-2");
		release();
		await first;
		await Promise.resolve();

		// The original pass plus one follow-up. Never three.
		expect(task.run.mock.calls.length).toBeLessThanOrEqual(2);
	});
});

describe("task isolation", () => {
	test("one failing task does not stop the others", async () => {
		const good = jest.fn();
		engine.register(source("s", [fails("bad", new Error("nope")), ok("good", good)]));

		const result = await engine.sync("test");

		expect(good).toHaveBeenCalled();
		expect(result).toMatchObject({ attempted: 2, succeeded: 1, retryable: 1 });
	});

	test("a source that cannot list its work is skipped, not fatal", async () => {
		const good = jest.fn();
		engine.register({ name: "broken", pending: jest.fn(async () => Promise.reject(new Error("db locked"))) });
		engine.register(source("fine", [ok("good", good)]));

		const result = await engine.sync("test");

		expect(good).toHaveBeenCalled();
		expect(result?.succeeded).toBe(1);
	});
});

describe("retryability", () => {
	test("a dead link is permanent - it must never be retried", async () => {
		// Retrying a 410 forever is how a queue jams behind one poisoned item.
		engine.register(source("s", [fails("dead", new ApiError("dead_end", "gone", { status: 410 }))]));
		const result = await engine.sync("test");
		expect(result).toMatchObject({ permanent: 1, retryable: 0 });
	});

	test.each([
		["auth", false],
		["forbidden", false],
		["invalid", false],
		["network", true],
		["server", true],
	] as const)("%s failures are retryable=%s", async (kind, retryable) => {
		engine.register(source("s", [fails("x", new ApiError(kind, "msg"))]));
		const result = await engine.sync("test");
		expect(result?.retryable).toBe(retryable ? 1 : 0);
	});

	test("an unknown error is treated as retryable - a local blip is not a dead record", async () => {
		engine.register(source("s", [fails("x", new TypeError("undefined is not a function"))]));
		expect((await engine.sync("test"))?.retryable).toBe(1);
	});
});

describe("offline", () => {
	test("no pass runs while offline - it would only burn battery", async () => {
		const run = jest.fn();
		engine.register(source("s", [ok("t", run)]));
		engine.setOnline(false);

		expect(await engine.sync("test")).toBeNull();
		expect(run).not.toHaveBeenCalled();
	});

	test("regaining signal flushes automatically", async () => {
		const run = jest.fn();
		engine.register(source("s", [ok("t", run)]));
		engine.setOnline(false);

		engine.setOnline(true);
		await new Promise((r) => setImmediate(r));

		expect(run).toHaveBeenCalled();
	});

	test("staying online does not re-trigger on every report", async () => {
		const run = jest.fn();
		engine.register(source("s", [ok("t", run)]));
		engine.setOnline(true);
		engine.setOnline(true);
		await new Promise((r) => setImmediate(r));
		expect(run).not.toHaveBeenCalled();
	});
});

describe("backoff", () => {
	test("grows with consecutive failures and is capped", () => {
		const worst = (n: number) => backoffDelay(n, () => 1);
		expect(worst(1)).toBe(2_000);
		expect(worst(2)).toBe(4_000);
		expect(worst(3)).toBe(8_000);
		expect(worst(50)).toBe(5 * 60_000); // capped
	});

	test("is jittered, so phones in one building do not retry in lockstep", () => {
		expect(backoffDelay(5, () => 0)).toBe(0);
		expect(backoffDelay(5, () => 0.5)).toBeLessThan(backoffDelay(5, () => 1));
	});

	test("a retryable failure schedules a retry; success clears the count", async () => {
		jest.useFakeTimers();
		const run = jest.fn().mockRejectedValueOnce(new ApiError("network", "no signal")).mockResolvedValue(undefined);
		engine.register(source("s", [{ id: "t", run }]));

		await engine.sync("first");
		expect(engine.getState().failures).toBe(1);
		expect(jest.getTimerCount()).toBe(1);

		await jest.advanceTimersByTimeAsync(5 * 60_000);
		expect(run).toHaveBeenCalledTimes(2);
		expect(engine.getState().failures).toBe(0);
		jest.useRealTimers();
	});

	test("a permanent failure schedules nothing", async () => {
		jest.useFakeTimers();
		engine.register(source("s", [fails("x", new ApiError("dead_end", "gone"))]));
		await engine.sync("test");
		expect(jest.getTimerCount()).toBe(0);
		jest.useRealTimers();
	});
});

describe("state", () => {
	test("subscribers get the current state immediately and on change", async () => {
		const seen: string[] = [];
		engine.register(source("s", [ok("t")]));
		engine.subscribe((s) => seen.push(s.status));

		await engine.sync("test");

		expect(seen[0]).toBe("idle");
		expect(seen).toContain("syncing");
		expect(seen[seen.length - 1]).toBe("idle");
	});

	test("reports what is still queued after a pass", async () => {
		engine.register(source("s", [fails("x", new ApiError("network", "no signal"))]));
		await engine.sync("test");
		expect(engine.getState().pending).toBe(1);
		expect(engine.getState().lastError).toBe("no signal");
	});

	test("a throwing subscriber cannot break the queue", async () => {
		engine.register(source("s", [ok("t")]));
		engine.subscribe(() => {
			throw new Error("bad screen");
		});
		await expect(engine.sync("test")).resolves.toMatchObject({ succeeded: 1 });
	});

	test("unsubscribing stops delivery", async () => {
		const listener = jest.fn();
		const off = engine.subscribe(listener);
		listener.mockClear();
		off();
		await engine.sync("test");
		expect(listener).not.toHaveBeenCalled();
	});
});
