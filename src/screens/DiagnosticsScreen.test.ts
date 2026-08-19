// The queue description on the diagnostics screen. Three states, three
// different answers to "why hasn't it sent?": waiting sends itself, needing
// attention will not move without a person, and another account's is held
// for whoever captured it. Counts only - the row exposes no content.

import { setQueueOwner } from "@/sync/owner";

import { describeQueue } from "./DiagnosticsScreen";

afterEach(() => setQueueOwner(null));

const always = () => true;

test("an empty queue is two zeros, with no mention of other accounts", () => {
	expect(describeQueue([], always)).toBe("0 waiting · 0 need attention");
});

test("waiting, failed and held are counted apart", () => {
	setQueueOwner("user-a");
	const rows = [
		{ owner_user_id: "user-a" },
		{ owner_user_id: "user-a" },
		{ owner_user_id: "user-a", sync_error: { message: "no", at: 1 } },
		{ owner_user_id: "user-b" },
	];
	expect(describeQueue(rows, always)).toBe("2 waiting · 1 needs attention · 1 another account's");
});

test("a held row is held even if it also failed - it is not this session's problem", () => {
	setQueueOwner("user-b");
	expect(describeQueue([{ owner_user_id: "user-a", sync_error: { message: "no", at: 1 } }], always)).toBe(
		"0 waiting · 0 need attention · 1 another account's",
	);
});

test("rows with nothing owed are not counted as waiting", () => {
	// An on-site session whose check-in already synced holds no queue work.
	setQueueOwner("user-a");
	const rows = [{ owner_user_id: "user-a", owes: false }];
	expect(describeQueue(rows, (row: { owes?: boolean }) => row.owes !== false)).toBe("0 waiting · 0 need attention");
});
