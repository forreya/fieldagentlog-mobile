// MIRRORED FILE - do not edit in isolation.
// This file must stay byte-identical in both repos (see shared-mirror.json in
// fieldagentlog-mobile): fieldagent/src/lib/fireData.ts <-> fieldagentlog-mobile/src/shared/fireData.ts.
// Change both copies in the same piece of work and update the recorded hash.
// Reads the staff dashboard straight from BalanceBuddy via the authenticated
// Supabase client. RLS scopes every query to what the signed-in user may see:
//   • blocks            → their organisation's managed blocks
//   • block_fire_checks → the per-block fire checks (due dates live here)
//   • fire_check_catalogue → titles/categories (world-readable reference data)
// We only pull checks that are enabled and have a next_due_at — those are the
// "jobs to be done" — and classify each as overdue / due-soon / upcoming.

import type { SupabaseClient } from "@supabase/supabase-js";

export type DueLevel = "overdue" | "soon" | "upcoming";

export interface Job {
  id: string;
  title: string;
  category: string;
  frequency: string;
  nextDueAt: string; // YYYY-MM-DD
  daysUntil: number;
  level: DueLevel;
}

export interface BlockWithJobs {
  id: string;
  organizationId: string;
  name: string;
  address: string | null;
  /** Postcode for the "Plan visits" geocoding (address_postcode ?? postcode). */
  postcode: string | null;
  jobs: Job[]; // only checks with a due date, soonest first
  overdue: number;
  soon: number;
  upcoming: number;
  /** Specialist (contractor) due checks hidden from FieldAgent, for context. */
  specialist: number;
}

export interface DashboardData {
  blocks: BlockWithJobs[];
  totals: { blocks: number; jobsDue: number; overdue: number };
}

const SOON_DAYS = 30;

const FREQ_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  six_monthly: "Six-monthly",
  annual: "Annual",
};
export function frequencyLabel(f: string): string {
  return FREQ_LABEL[f] ?? f;
}

const CATEGORY_LABEL: Record<string, string> = {
  emergency_lighting: "Emergency lighting",
  fire_alarm: "Fire alarm",
  smoke_control: "Smoke control",
  fire_doors: "Fire doors",
  lift: "Lift",
  general: "General",
};
export function categoryLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c;
}

/** The catalogue's free-text `responsibility` marks the specialist (contractor)
 *  jobs — the annual/periodic services and compartmentation. FieldAgent owns the
 *  in-house periodic checks; anything marked "Contractor" stays in BalanceBuddy. */
export function isSpecialistResponsibility(responsibility: string | null | undefined): boolean {
  return (responsibility ?? "").trim().toLowerCase() === "contractor";
}

/** Whole-day difference between a YYYY-MM-DD date and today, in local time. */
export function daysUntil(dateStr: string, now = new Date()): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const due = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function dueLevel(days: number): DueLevel {
  if (days < 0) return "overdue";
  if (days <= SOON_DAYS) return "soon";
  return "upcoming";
}

export function dueLabel(days: number): string {
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  if (days <= SOON_DAYS) return `Due in ${days} day${days === 1 ? "" : "s"}`;
  return "Scheduled";
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export interface BlockRow {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  address_line_1: string | null;
  address_town: string | null;
  address_postcode: string | null;
  postcode: string | null;
}
export interface CheckRow {
  id: string;
  block_id: string;
  catalogue_code: string;
  frequency: string;
  responsibility: string | null;
  next_due_at: string | null;
}
export interface CatalogueRow {
  code: string;
  title: string;
  category: string;
  responsibility: string | null;
}

function blockAddress(b: BlockRow): string | null {
  const parts = [b.address_line_1, b.address_town, b.address_postcode ?? b.postcode].filter(Boolean);
  return parts.length ? parts.join(", ") : b.address;
}

export async function loadDashboard(supabase: SupabaseClient): Promise<DashboardData> {
  const [blocksRes, checksRes, catRes] = await Promise.all([
    supabase
      .from("blocks")
      .select("id,organization_id,name,address,address_line_1,address_town,address_postcode,postcode")
      .order("name"),
    supabase
      .from("block_fire_checks")
      .select("id,block_id,catalogue_code,frequency,responsibility,next_due_at")
      .eq("enabled", true)
      .not("next_due_at", "is", null),
    supabase.from("fire_check_catalogue").select("code,title,category,responsibility"),
  ]);
  if (blocksRes.error) throw blocksRes.error;
  if (checksRes.error) throw checksRes.error;
  if (catRes.error) throw catRes.error;
  return buildDashboardData(
    (blocksRes.data ?? []) as BlockRow[],
    (checksRes.data ?? []) as CheckRow[],
    (catRes.data ?? []) as CatalogueRow[],
  );
}

/** Pure: assemble the dashboard from raw rows. Used by staff (direct reads) and
 *  by agents (same rows fetched through the field-agent Edge Function). */
export function buildDashboardData(
  blockRows: BlockRow[],
  checkRows: CheckRow[],
  catRows: CatalogueRow[],
): DashboardData {
  const catalogue = new Map<string, CatalogueRow>();
  for (const c of catRows) catalogue.set(c.code, c);

  const jobsByBlock = new Map<string, Job[]>();
  const specialistByBlock = new Map<string, number>();
  for (const r of checkRows) {
    if (!r.next_due_at) continue;
    const meta = catalogue.get(r.catalogue_code);
    // FieldAgent owns the non-specialist (in-house) checks only; specialist
    // contractor jobs stay in BalanceBuddy. Count them for context, then skip.
    if (isSpecialistResponsibility(r.responsibility ?? meta?.responsibility)) {
      specialistByBlock.set(r.block_id, (specialistByBlock.get(r.block_id) ?? 0) + 1);
      continue;
    }
    const days = daysUntil(r.next_due_at);
    const job: Job = {
      id: r.id,
      title: meta?.title ?? r.catalogue_code,
      category: meta?.category ?? "general",
      frequency: r.frequency,
      nextDueAt: r.next_due_at,
      daysUntil: days,
      level: dueLevel(days),
    };
    const arr = jobsByBlock.get(r.block_id) ?? [];
    arr.push(job);
    jobsByBlock.set(r.block_id, arr);
  }

  const blocks: BlockWithJobs[] = blockRows.map((b) => {
    const jobs = (jobsByBlock.get(b.id) ?? []).sort((a, z) => a.daysUntil - z.daysUntil);
    return {
      id: b.id,
      organizationId: b.organization_id,
      name: b.name,
      address: blockAddress(b),
      postcode: b.address_postcode ?? b.postcode,
      jobs,
      overdue: jobs.filter((j) => j.level === "overdue").length,
      soon: jobs.filter((j) => j.level === "soon").length,
      upcoming: jobs.filter((j) => j.level === "upcoming").length,
      specialist: specialistByBlock.get(b.id) ?? 0,
    };
  });

  // Urgency first: overdue blocks (worst first), then due-soon, then by name.
  blocks.sort((a, z) => {
    if (a.overdue !== z.overdue && (a.overdue === 0 || z.overdue === 0)) return z.overdue - a.overdue;
    if (a.overdue && z.overdue) return (a.jobs[0]?.daysUntil ?? 0) - (z.jobs[0]?.daysUntil ?? 0);
    if ((a.soon > 0) !== (z.soon > 0)) return a.soon > 0 ? -1 : 1;
    return a.name.localeCompare(z.name);
  });

  return {
    blocks,
    totals: {
      blocks: blocks.length,
      jobsDue: blocks.reduce((n, b) => n + b.overdue + b.soon, 0),
      overdue: blocks.reduce((n, b) => n + b.overdue, 0),
    },
  };
}
