# CLAUDE.md - FieldAgentLog mobile

Invariants only: things whose ignorance causes a wrong edit. Budget: ≤120 lines, prune on every
consolidation phase. How-to-run lives in README.md; the module map in docs/architecture.md.

## The one that prevents the worst mistake

**This app talks to BalanceBuddy (Supabase), NOT gena-backend.** Ignore any Gena Go/Django
convention (DRF `Token` auth, `/api/` endpoints, S3 presign). Contracts live in the
BalanceBuddy Edge Functions (`../../balancebuddy-web/supabase/functions/`) and are mirrored in
`../fieldagent` (the web sibling).

## Security invariants

- **No service-role key in this repo, ever.** Ship only the publishable (anon) key.
- External personas (agent, cleaner) have **no direct DB access** - broker Edge Functions only
  (`field-agent`, `cleaner`, `site-report`). Staff read PostgREST under RLS. Never widen either.
- The inspector wizard is **keyless**: per-visit token, works fully signed-out. Don't gate it on
  auth, config, or Supabase being reachable.

## Offline invariants (the product's core)

- **Persist before network, always.** A capture (answer, photo, check-in, report) is written to
  SQLite/disk before any request. A failed post must never lose what someone saw.
- **Idempotency keys**: attendance + site reports carry a client `client_id` (server-unique);
  visit submit is idempotent on its token. Generate keys at capture time, never at send time.
- Site reports post **only after every photo has a server ref**; refs persist as they land.
- N/A verdicts don't advance a check's cadence (server rule - don't imply otherwise in UI).
- Never reload/update the app mid-visit; updates apply on cold start only.

## Two rules that have already been broken more than once

- **After ANY dependency change: `npm run lock:linux`, same commit.** `npm install` on macOS
  writes a lockfile `npm ci` on Linux rejects, and CI and EAS both run `npm ci` on Linux. Broken
  twice.
- **"Green" means a fresh clone passed on Linux**, not that it passed here. Read the _suite_
  count, not just the test count - a suite that fails to load still prints `Tests: N passed`.
  Twice a narrow grep hid a real failure.

## Commits

Match the house style used across the Gena repos: **past tense, sentence case, subject line
only.** "Added the sync engine, visit queue and triggers", "Fixed env vars never reaching release
builds", "Made buttons size to their content". No body, no trailing full stop, no
`Co-Authored-By` trailers, no phase ids - phase progress is ticked in the plan doc instead. One
commit per plan phase; incidental fixes found along the way get their own.

## Code rules (lint-enforced - don't fight them, split)

- Size budgets: screens ≤300 lines, modules ≤250, functions ≤60. Tabs, printWidth 150.
- Layers: see the table in docs/architecture.md. The invariant: nothing above `src/api`,
  `src/db` or `src/sync` fetches, retries or touches storage directly. A screen that fetches is
  wrong even if it works.
- Tests land in the same PR as the logic they test. No skipped tests on `main`.
- Mirrored files (listed in `shared-mirror.json`) must match `../fieldagent` - CI fails on drift;
  sync both repos in the same piece of work.

## Docs

One home per fact; link, don't copy. Budgets: this file ≤120, README ≤250, architecture.md ≤200.
`../FIELDAGENT-MOBILE-PLAN.md` is a planning artifact - do not load it into context routinely.
Platform-facing changes also update `../gena-docs/fieldagentlog/`.
