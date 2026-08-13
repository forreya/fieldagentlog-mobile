# CLAUDE.md - FieldAgentLog mobile

Invariants only: things whose ignorance causes a wrong edit. Budget: ≤120 lines, prune on every
consolidation phase. How-to-run lives in README.md; module map in docs/architecture.md (from B7).

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

## After ANY dependency change, run `npm run lock:linux`

`npm install` on macOS writes a lockfile that `npm ci` on Linux rejects (it
omits optional subtrees for other platforms). CI and EAS both run `npm ci` on
Linux, so a macOS-only lockfile breaks every cloud build. This has already
happened twice. One command, in the same commit as the dependency change:

```bash
npm run lock:linux    # regenerates in Docker and verifies npm ci passes
```

## Code rules (lint-enforced - don't fight them, split)

- Size budgets: screens ≤300 lines, modules ≤250, functions ≤60. Tabs, printWidth 150.
- Layers: `src/app` routes render + dispatch · hooks orchestrate · `src/api` network ·
  `src/db` storage · `src/sync` retries/ordering. A screen that fetches is wrong even if it works.
- Tests land in the same PR as the logic they test. No skipped tests on `main`.
- Mirrored files (listed in `shared-mirror.json`, from A4) must match `../fieldagent` - CI fails
  on drift; sync both repos in the same piece of work.

## Docs

One home per fact; link, don't copy. Budgets: this file ≤120, README ≤250, architecture.md ≤200.
`../FIELDAGENT-MOBILE-PLAN.md` is a planning artifact - do not load it into context routinely.
Platform-facing changes also update `../gena-docs/fieldagentlog/`.
