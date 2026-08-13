// The one place that decides WHEN queued work is pushed. Each queue decides
// WHAT to send by registering a source; the engine owns single-flight, the
// triggers, and how hard to retry.
//
// The web app hand-rolls this loop three times (visits, attendance, reports),
// each with its own `syncing` guard and its own online listener. Three copies
// is three chances for them to disagree about whether a pass is already
// running, and on mobile there are more triggers than the browser's `online`
// event - foregrounding, a fresh capture, a regained connection - so the
// duplication would only get worse.
//
// Rules that matter on a phone in a basement:
//   - One pass at a time. Two concurrent passes upload the same photo twice.
//   - A failed task never blocks a different task; each is independent.
//   - Only retryable failures schedule a retry. A dead link or a rejected
//     session fails identically forever, and retrying it is how a queue jams
//     behind one poisoned item.
//   - Backoff is capped and jittered, so a hundred phones regaining signal in
//     the same building do not arrive together.

import { ApiError } from "@/api/errors";

/** One unit of queued work. Throws to signal failure. */
export interface SyncTask {
	/** Stable id, for logging and for not reporting the same failure twice. */
	id: string;
	run(): Promise<void>;
}

/** A queue that can say what it currently needs to push. */
export interface SyncSource {
	name: string;
	pending(): Promise<SyncTask[]>;
}

export interface SyncState {
	status: "idle" | "syncing";
	/** Tasks still queued after the last pass. */
	pending: number;
	/** Last failure worth showing, or null. */
	lastError: string | null;
	/** Consecutive passes that ended with retryable failures. */
	failures: number;
}

export interface PassResult {
	attempted: number;
	succeeded: number;
	/** Failures worth trying again (no signal, server trouble). */
	retryable: number;
	/** Failures that will never succeed as-is; the source must resolve them. */
	permanent: number;
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

/** Exponential with full jitter, capped. Exported for the tests. */
export function backoffDelay(failures: number, random: () => number = Math.random): number {
	const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, failures - 1));
	// Full jitter rather than a fixed delay: without it, every phone that
	// regained signal at the same moment retries at the same moment.
	return Math.round(random() * ceiling);
}

type Listener = (state: SyncState) => void;

/** Deliver to one subscriber. A broken screen must never stop the queue. */
function notify(listener: Listener, state: SyncState): void {
	try {
		listener(state);
	} catch {
		/* ignored on purpose */
	}
}

export class SyncEngine {
	private sources: SyncSource[] = [];
	private listeners = new Set<Listener>();
	private running = false;
	/** A pass requested while one was already running. */
	private rerunRequested = false;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private state: SyncState = { status: "idle", pending: 0, lastError: null, failures: 0 };

	/** Whether the device currently has a usable connection. */
	private online = true;

	register(source: SyncSource): () => void {
		this.sources.push(source);
		return () => {
			this.sources = this.sources.filter((s) => s !== source);
		};
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		// Guarded like every other delivery: a screen that throws on its first
		// render must not take the queue with it.
		notify(listener, this.state);
		return () => {
			this.listeners.delete(listener);
		};
	}

	getState(): SyncState {
		return this.state;
	}

	/** Tell the engine whether there is signal. Flushes when it returns. */
	setOnline(online: boolean): void {
		const regained = online && !this.online;
		this.online = online;
		if (regained) void this.sync("connection regained");
	}

	isOnline(): boolean {
		return this.online;
	}

	/**
	 * Run a pass. Safe to call from anywhere, as often as you like: while a pass
	 * is running, further calls set a flag so exactly one more pass follows,
	 * rather than queueing an unbounded pile of them.
	 */
	async sync(reason: string): Promise<PassResult | null> {
		if (!this.online) return null;
		if (this.running) {
			this.rerunRequested = true;
			return null;
		}

		this.clearTimer();
		this.running = true;
		this.emit({ status: "syncing" });

		let result: PassResult = { attempted: 0, succeeded: 0, retryable: 0, permanent: 0 };
		try {
			result = await this.runPass();
		} finally {
			this.running = false;
		}

		const failures = result.retryable > 0 ? this.state.failures + 1 : 0;
		this.emit({ status: "idle", pending: await this.countPending(), failures });

		if (result.retryable > 0) this.scheduleRetry(failures);
		if (this.rerunRequested) {
			this.rerunRequested = false;
			// Something changed mid-pass; make sure it is not left until the next
			// trigger, which might be hours away.
			void this.sync(`${reason} (follow-up)`);
		}
		return result;
	}

	private async runPass(): Promise<PassResult> {
		const result: PassResult = { attempted: 0, succeeded: 0, retryable: 0, permanent: 0 };
		let lastError: string | null = null;

		for (const source of this.sources) {
			let tasks: SyncTask[] = [];
			try {
				tasks = await source.pending();
			} catch {
				// A source that cannot even list its work is a local problem;
				// skip it rather than abandoning the other queues.
				continue;
			}

			for (const task of tasks) {
				result.attempted += 1;
				try {
					await task.run();
					result.succeeded += 1;
				} catch (err) {
					const retryable = !(err instanceof ApiError) || err.retryable;
					if (retryable) result.retryable += 1;
					else result.permanent += 1;
					lastError = err instanceof Error ? err.message : "Something went wrong.";
				}
			}
		}

		this.state = { ...this.state, lastError };
		return result;
	}

	private async countPending(): Promise<number> {
		let total = 0;
		for (const source of this.sources) {
			try {
				total += (await source.pending()).length;
			} catch {
				/* unknown; do not let it break the count */
			}
		}
		return total;
	}

	private scheduleRetry(failures: number): void {
		this.clearTimer();
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.sync("backoff retry");
		}, backoffDelay(failures));
	}

	private clearTimer(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private emit(patch: Partial<SyncState>): void {
		this.state = { ...this.state, ...patch };
		for (const listener of [...this.listeners]) notify(listener, this.state);
	}

	/** Test seam: drop timers, sources and listeners. */
	reset(): void {
		this.clearTimer();
		this.sources = [];
		this.listeners.clear();
		this.running = false;
		this.rerunRequested = false;
		this.online = true;
		this.state = { status: "idle", pending: 0, lastError: null, failures: 0 };
	}
}

/** The app's engine. Sources register at startup; screens subscribe for the pill. */
export const syncEngine = new SyncEngine();
