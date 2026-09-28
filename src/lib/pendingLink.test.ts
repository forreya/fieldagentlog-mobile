// A remembered link is honoured once, then gone.

import { setPendingBlockId, takePendingBlockId } from "./pendingLink";

beforeEach(() => {
	takePendingBlockId();
});

test("nothing pending reads as null", () => {
	expect(takePendingBlockId()).toBeNull();
});

test("a stored id comes back once and is then cleared", () => {
	setPendingBlockId("b1");

	expect(takePendingBlockId()).toBe("b1");
	// Honoured once: a second reader must not reopen the same block.
	expect(takePendingBlockId()).toBeNull();
});

test("a later link replaces an earlier one", () => {
	setPendingBlockId("b1");
	setPendingBlockId("b2");

	expect(takePendingBlockId()).toBe("b2");
});
