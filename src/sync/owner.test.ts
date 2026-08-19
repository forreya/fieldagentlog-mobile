// The ownership rule for queued work, pinned exactly - it decides whether a
// capture is sent, held, or (wrongly) sent as somebody else.

import { ownedByQueueOwner, queueOwner, setQueueOwner, visibleToUser } from "./owner";

afterEach(() => setQueueOwner(null));

test("starts with no owner - nothing user-owned may move before a session is adopted", () => {
	expect(queueOwner()).toBeNull();
});

describe("ownedByQueueOwner", () => {
	test("a row with no recorded owner predates ownership and is always sendable", () => {
		// Holding legacy rows forever would be data loss; sending them is what
		// every install did before ownership existed.
		setQueueOwner("user-b");
		expect(ownedByQueueOwner(undefined)).toBe(true);
		expect(ownedByQueueOwner(null)).toBe(true);
	});

	test("the owner's own work is sendable", () => {
		setQueueOwner("user-a");
		expect(ownedByQueueOwner("user-a")).toBe(true);
	});

	test("another account's work is not", () => {
		setQueueOwner("user-b");
		expect(ownedByQueueOwner("user-a")).toBe(false);
	});

	test("with nobody signed in, owned work is not sendable", () => {
		expect(ownedByQueueOwner("user-a")).toBe(false);
	});
});

describe("visibleToUser", () => {
	// The screen-side twin. Kept in lockstep with the engine's rule so what a
	// user can SEE never diverges from what their session may SEND.
	test("mirrors the engine rule exactly", () => {
		expect(visibleToUser(undefined, "user-a")).toBe(true);
		expect(visibleToUser(null, null)).toBe(true);
		expect(visibleToUser("user-a", "user-a")).toBe(true);
		expect(visibleToUser("user-a", "user-b")).toBe(false);
		expect(visibleToUser("user-a", null)).toBe(false);
	});
});
