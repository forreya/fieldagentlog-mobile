// Self-dispatch: staff INSERT the same fire_visits row BalanceBuddy creates
// when it sends an inspector a link. The row has to be right in three ways or
// the wizard cannot open it - the hash algorithm, the status, and the window.

import type { User } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";

import { inspectorName, staffStartVisit } from "./staff";

// `mock`-prefixed so the hoisted factory may close over it.
// PostgREST errors carry a code as well as a message, and the code is what
// decides which of them a person is allowed to read.
const mockInsert = jest.fn(async (_row: Record<string, unknown>) => ({ error: null as { code?: string; message: string } | null }));
jest.mock("@/auth/supabase", () => ({ getSupabase: () => ({ from: () => ({ insert: mockInsert }) }) }));

const user = { id: "u1", email: "sam@company.co.uk", user_metadata: {} } as unknown as User;
const block = { id: "b1", organizationId: "o1" };
const NOW = new Date("2026-08-15T09:00:00Z");

beforeEach(() => {
	mockInsert.mockClear();
	mockInsert.mockResolvedValue({ error: null });
});

describe("inspectorName", () => {
	test("prefers a real name", () => {
		expect(inspectorName({ ...user, user_metadata: { full_name: "Sam Okonkwo" } } as User)).toBe("Sam Okonkwo");
	});

	test("falls back to the email's local part, then to something printable", () => {
		expect(inspectorName(user)).toBe("sam");
		expect(inspectorName({ id: "u", email: null, user_metadata: {} } as unknown as User)).toBe("Inspector");
	});
});

test("returns a 64-hex token and stores only its SHA-256", async () => {
	const raw = await staffStartVisit(user, block, NOW);

	expect(raw).toMatch(/^[0-9a-f]{64}$/);
	const row = mockInsert.mock.calls[0][0];
	// The raw token must never reach the database.
	expect(JSON.stringify(row)).not.toContain(raw);
	const expected = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw, { encoding: Crypto.CryptoEncoding.HEX });
	expect(row.access_token_hash).toBe(expected);
});

test("the row is dispatched, scoped to the block, and signed by the user", async () => {
	await staffStartVisit(user, block, NOW);
	const row = mockInsert.mock.calls[0][0];

	expect(row).toMatchObject({
		organization_id: "o1",
		block_id: "b1",
		status: "dispatched",
		inspector_name: "sam",
		inspector_email: "sam@company.co.uk",
		created_by: "u1",
	});
});

test("the visit window matches the dashboard's due-soon horizon, and the link outlives it", async () => {
	// 30 days of jobs, a 14-day token: the checklist holds what the dashboard
	// flagged, and the link expires well before the work does.
	await staffStartVisit(user, block, NOW);
	const row = mockInsert.mock.calls[0][0] as Record<string, string>;

	expect(row.due_date).toBe("2026-09-14");
	expect(row.token_expires_at.slice(0, 10)).toBe("2026-08-29");
});

test("the token comes from the platform CSPRNG, 32 bytes of it", async () => {
	// Uniqueness itself cannot be shown here - expo-crypto is stubbed under
	// Jest and returns a fixed buffer - so assert the property that makes it
	// unique on a device: where the bytes come from, and how many.
	const random = jest.spyOn(Crypto, "getRandomBytesAsync");

	await staffStartVisit(user, block, NOW);

	expect(random).toHaveBeenCalledWith(32);
	random.mockRestore();
});

test("an RLS refusal surfaces as an error rather than a broken link", async () => {
	// A staff member with no role on the block: the correct outcome is a
	// refusal, not a visit nobody can open. 42501 is what PostgREST sends.
	mockInsert.mockResolvedValue({ error: { code: "42501", message: 'new row violates row-level security policy for table "fire_visits"' } });

	// Deliberately NOT the database's wording. This test used to assert the
	// screen showed "row-level security", which is how the leak stayed put.
	await expect(staffStartVisit(user, block, NOW)).rejects.toThrow("You don't have access to that block. Ask whoever manages your account.");
});

// Anything that is not an RLS refusal is a fault, not a condition. It still has
// to say something, and it must not name a table.
test("any other database failure says something a person can act on", async () => {
	mockInsert.mockResolvedValue({ error: { code: "23503", message: 'insert or update on table "fire_visits" violates foreign key constraint' } });

	await expect(staffStartVisit(user, block, NOW)).rejects.toThrow("Couldn't start the checklist. Try again in a moment.");
	await expect(staffStartVisit(user, block, NOW)).rejects.not.toThrow(/fire_visits|constraint/);
});
