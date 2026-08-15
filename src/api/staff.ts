// What a signed-in staff member can do, and the one way it differs from an
// agent: staff read the database directly under RLS, rather than through a
// broker. Same screens, same assembled shape, different source.
//
// Starting a checklist is a self-dispatch: staff INSERT the same `fire_visits`
// row BalanceBuddy creates when it sends an external inspector a link, then
// hand off to the token-gated wizard. RLS authorises the insert
// (owner/admin/accountant on the block); nothing here decides permissions.

import * as Crypto from "expo-crypto";
import type { User } from "@supabase/supabase-js";

import { getSupabase } from "@/auth/supabase";
import { loadDashboard, type DashboardData } from "@/shared/fireData";

const TOKEN_TTL_DAYS = 14;
/** The visit covers everything overdue or due within this window - matches the
 *  dashboard's "due soon" horizon so the checklist holds the jobs it flagged. */
const VISIT_WINDOW_DAYS = 30;

/** Every block in the staff member's organisations, under RLS. */
export async function loadStaffDashboard(): Promise<DashboardData> {
	return loadDashboard(getSupabase());
}

function hex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 32 random bytes as lowercase hex - byte-for-byte what the broker functions
 * mint, so a staff-dispatched link is indistinguishable from a sent one.
 *
 * expo-crypto rather than Web Crypto: React Native has no `crypto.subtle`, and
 * a token generated from Math.random would be guessable.
 */
async function randomToken(): Promise<string> {
	return hex(await Crypto.getRandomBytesAsync(32));
}

/** Plain SHA-256, lowercase hex - exactly what the visit-* functions compare. */
async function sha256Hex(input: string): Promise<string> {
	return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, { encoding: Crypto.CryptoEncoding.HEX });
}

function ymd(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

/** The name that goes on the logbook when staff dispatch to themselves. */
export function inspectorName(user: User): string {
	const full = (user.user_metadata?.full_name as string | undefined)?.trim();
	return full || (user.email ?? "").split("@")[0] || "Inspector";
}

/**
 * Create a visit for `block` against the signed-in user and return its raw
 * token. Throws if RLS rejects the insert - which is the correct outcome for a
 * staff member with no role on that block.
 */
export async function staffStartVisit(user: User, block: { id: string; organizationId: string }, now: Date = new Date()): Promise<string> {
	const raw = await randomToken();

	const { error } = await getSupabase()
		.from("fire_visits")
		.insert({
			organization_id: block.organizationId,
			block_id: block.id,
			due_date: ymd(addDays(now, VISIT_WINDOW_DAYS)),
			status: "dispatched",
			// Only the hash is stored. The raw token exists in this function and
			// on the phone that is about to open it, and nowhere else.
			access_token_hash: await sha256Hex(raw),
			token_expires_at: addDays(now, TOKEN_TTL_DAYS).toISOString(),
			inspector_name: inspectorName(user),
			inspector_email: user.email ?? null,
			created_by: user.id,
		});
	if (error) throw new Error(error.message);

	return raw;
}
