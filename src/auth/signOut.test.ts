// Signing out ends the session and nothing else.
//
// The queues belong to the device, not to the session. A cleaner whose session
// expires mid-shift still has un-synced attendance on the phone, keyed for
// idempotent replay; clearing it on sign-out would destroy work that nobody can
// recreate, and the person doing it would have no idea.

import * as SQLite from "expo-sqlite";

import { resetDatabase } from "@/db/database";
import { addPendingPhoto, pendingPhotosForToken } from "@/db/photos";
import type { PendingPhoto, VisitRecord } from "@/db/types";
import { allVisits, saveVisit } from "@/db/visits";

import { endSession } from "./AuthProvider";
import { recallRole, rememberRole } from "./roleCache";

jest.mock("expo-sqlite");
// `mock`-prefixed so the factory may close over it (a jest hoisting rule).
const mockSignOut = jest.fn(async () => ({ error: null }));
jest.mock("./supabase", () => ({
	supabaseConfigured: () => true,
	getSupabase: () => ({ auth: { signOut: mockSignOut } }),
	resetSupabase: jest.fn(),
	resolveUserRole: jest.fn(),
}));

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const record: VisitRecord = {
	token: "mid-shift",
	packet: {},
	inspector: { name: "Sam Okonkwo", email: "sam@company.co.uk" },
	results: { c1: { verdict: "fail", note: "Closer missing", severity: "high", photo_ref: null, photo_local_id: "p1" } },
	fra_updates: {},
	started_at: 1_000,
	updated_at: 1_000,
	submit_requested_at: 2_000,
	submitted: null,
};

const photo: PendingPhoto = {
	local_id: "p1",
	token: "mid-shift",
	check_id: "c1",
	file: { uri: "file:///photos/p1.jpg", name: "p1.jpg", type: "image/jpeg" },
	ref: null,
	created_at: 1_000,
};

beforeEach(() => {
	resetDatabase();
	__resetAllDatabases();
	jest.clearAllMocks();
});

test("leaves a queued visit and its photo exactly where they were", async () => {
	await saveVisit(record);
	await addPendingPhoto(photo);
	await rememberRole("u1", "cleaner");

	await endSession();

	// The session is gone...
	expect(mockSignOut).toHaveBeenCalledTimes(1);
	expect(await recallRole("u1")).toBeNull();

	// ...and the work is not.
	const held = await allVisits();
	expect(held).toHaveLength(1);
	expect(held[0].submit_requested_at).toBe(2_000);
	expect(held[0].results.c1.photo_local_id).toBe("p1");
	expect(await pendingPhotosForToken("mid-shift")).toHaveLength(1);
});

test("a sign-out with no signal still ends the session locally", async () => {
	// Being unable to tell the server must not leave someone signed in on a
	// phone they are handing back.
	mockSignOut.mockRejectedValueOnce(new Error("Network request failed"));
	await rememberRole("u1", "agent");

	await expect(endSession()).resolves.toBeUndefined();
	expect(await recallRole("u1")).toBeNull();
});
