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

/** Mint a visit for an assigned block. Returns the raw token for /v/<token>. */
export async function agentStartVisit(blockId: string): Promise<string> {
	const res = await callBroker<{ token: string }>("field-agent", { action: "start-visit", block_id: blockId });
	return res.token;
}
