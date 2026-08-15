// What an external field agent can ask for. Everything goes through the
// `field-agent` broker Edge Function: an agent has no direct database access at
// all, and RLS gives them nothing, so this is the whole surface.
//
// The rows come back raw and are assembled by the SAME mirrored function the
// web app uses (`buildDashboardData`). Two clients computing "overdue"
// differently is a compliance bug, not a cosmetic one.

import { buildDashboardData, type BlockRow, type CatalogueRow, type CheckRow, type DashboardData } from "@/shared/fireData";

import { callBroker } from "./broker";

interface MyBlocksResponse {
	blocks?: BlockRow[];
	checks?: CheckRow[];
	catalogue?: CatalogueRow[];
}

/** The agent's assigned blocks and the checks due on them. */
export async function loadAgentDashboard(): Promise<DashboardData> {
	const res = await callBroker<MyBlocksResponse>("field-agent", { action: "my-blocks" });
	return buildDashboardData(res.blocks ?? [], res.checks ?? [], res.catalogue ?? []);
}

/** One failed check on a past visit, as the logbook recorded it. */
export interface VisitFailure {
	title: string;
	/** The wire's word - `critical` is what the UI calls "Intolerable". */
	severity: string | null;
	note: string | null;
}

/** A completed visit on this block. */
export interface BlockVisit {
	id: string;
	/** Who the checklist was for: a full inspection, or a cleaner's duties. */
	scope: "inspector" | "cleaner";
	/** When it was completed - an ISO instant. */
	at: string;
	due_date: string | null;
	inspector_name: string | null;
	pass: number;
	fail: number;
	na: number;
	fails: VisitFailure[];
	/** Short-lived signed link to the Gena logbook PDF, or null. */
	logbook_url: string | null;
}

/**
 * What has already been done at this block. Bounded server-side (25 max), so
 * asking for more than a screenful is not possible by accident.
 */
export async function loadBlockVisits(blockId: string, limit?: number): Promise<BlockVisit[]> {
	const res = await callBroker<{ visits?: BlockVisit[] }>("field-agent", { action: "block-visits", block_id: blockId, limit });
	return res.visits ?? [];
}

/** Mint a visit for an assigned block. Returns the raw token for /v/<token>. */
export async function agentStartVisit(blockId: string): Promise<string> {
	const res = await callBroker<{ token: string }>("field-agent", { action: "start-visit", block_id: blockId });
	return res.token;
}
