# Regression testing

The permanent regression specification for FieldAgentLog mobile. After any feature, refactor,
dependency change or release, run the affected suites below and compare what the app does against
what these documents say it must do. A fresh AI agent with no prior knowledge of the project should
be able to execute these documents as written.

These documents describe **behaviour**, not implementation. Where a file path is named it is a
pointer for investigating a failure, not part of the test.

## How to execute a suite

1. Read [fixtures.md](fixtures.md) and establish the accounts, visits and device states the suite
   names. Never use production credentials; the local backend harness
   ([docs/local-backend.md](../local-backend.md)) provides everything.
2. Run the tests in order within a suite. Each has a stable ID, preconditions, steps and observable
   expected results. Record PASS or FAIL per test, with what was actually observed on a failure.
3. On any failure, check the **Change impact** table below for suites that share the broken
   machinery and run those too.
4. Behaviour marked `⚠️ Behaviour requires clarification` is recorded in
   [findings.md](findings.md); do not treat divergence there as a regression without reading it.

**Environments.** Three levels, cheapest first:

- `npm test` - 79+ unit/component suites already pin most pure logic (wizard reducer, error
  taxonomy, sync ordering). A regression run starts with a green `npm test`; read the **suite**
  count, not just the test count.
- **Simulator/emulator + local backend** - the signed-in flows need real Auth, RLS and Edge
  Functions. `docs/local-backend.md` stands these up. Airplane-mode toggles work in both simulators.
- **Installed build on a device** - required for: cold start offline (Expo Go fetches its bundle
  from Metro), OTA update behaviour (Expo Go cannot receive updates), app/universal links, and
  force-stop tests. Anything tagged **Build: installed** cannot pass or fail in Expo Go.

Platform tags: tests are `Platform: Both` unless marked `iOS-specific` / `Android-specific`.

## Functional map

```
                       keyless (per-visit token)          signed in (Supabase session)
                      ┌──────────────────────────┐   ┌────────────────────────────────────┐
  Entry               │ /v/<token> link,          │   │ login → role: staff | agent | cleaner
                      │ enter-code screen         │   └──────┬──────────┬─────────┬───────┘
                      └───────────┬──────────────┘          │          │         │
  Screens             INSPECTION WIZARD (WIZ)        BLOCKS (BLOCK)  BLOCKS   CLEANER (CLEAN)
                      intro → checks → summary       staff: RLS     (BLOCK)  sites, check-in/out,
                      → submit → success/dead end    + plan visits  broker   duties → handoff → WIZ
                                  │                        │          │         │
  Reports (REPORT)    ────────────┼── raised from block detail, on-site card, cleaner home
                                  │                        │          │         │
  Offline layer       SQLite queues (visits, attendance, reports) + photo file store
  (SYNC)              sync engine: one pass at a time, classified errors, jittered backoff
                                  │
  Read cache          TanStack Query persisted to AsyncStorage (dashboards, sites, history)
                                  │
  Shell (NAV, PLAT)   routing + guards, menu, About/Diagnostics, OTA updates, crash reporting,
                      OS permissions (camera, photos, location)
```

Two front doors, never mixed: the wizard authenticates with the visit token alone and must work
signed out, unconfigured and offline; everything else authenticates with a session JWT. Three
personas: **staff** (PostgREST reads under RLS, self-dispatch), **agent** (broker Edge Function
only), **cleaner** (broker only, scoped by cleaning company, plus attendance).

## Suites

| Suite                                                      | IDs      | Covers                                                               |
| ---------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| [authentication.md](authentication.md)                     | AUTH-*   | Sign-in/out, persona resolution, session lifecycle, route guard      |
| [inspection-wizard.md](inspection-wizard.md)               | WIZ-*    | The keyless visit: entry, checks, photos, FRA, submit, terminal ends |
| [blocks-and-dispatch.md](blocks-and-dispatch.md)           | BLOCK-*  | Staff/agent dashboards, block detail, history, starting checklists   |
| [cleaner.md](cleaner.md)                                   | CLEAN-*  | Sites, attendance, duties, handoff into the wizard                   |
| [reports.md](reports.md)                                   | REPORT-* | Site reports: compose, photos, queue, sent list                      |
| [offline-and-sync.md](offline-and-sync.md)                 | SYNC-*   | The sync engine, triggers, error taxonomy, replay safety             |
| [navigation-and-shell.md](navigation-and-shell.md)         | NAV-*    | Routes, deep links, menu, About/Diagnostics, updates, crash reports  |
| [platform-and-permissions.md](platform-and-permissions.md) | PLAT-*   | OS permissions and the iOS/Android differences that matter           |
| [cross-feature.md](cross-feature.md)                       | E2E-*    | Full journeys that cross several suites                              |
| [findings.md](findings.md)                                 | -        | Known ambiguities, probable bugs, testability gaps                   |

**Full-suite order:** AUTH → WIZ → BLOCK → CLEAN → REPORT → SYNC → NAV → PLAT → E2E. AUTH first
because three suites need its sessions; SYNC after the feature suites because its tests reuse
work queued by them; E2E last, and only after everything it crosses is green.

## Change impact

When a shared system changes, run at minimum:

| Change touches                                                 | Run                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/api/errors.ts`, `src/api/http.ts`, `src/api/client.ts`    | SYNC (all), WIZ-010..014, WIZ-021..024, REPORT-007..010, CLEAN-006                                                 |
| `src/sync/engine.ts` or `src/sync/triggers.ts`                 | SYNC (all), WIZ-021, CLEAN-006, REPORT-005, E2E-001, E2E-002                                                       |
| `src/auth/*` (provider, roles, role cache, supabase client)    | AUTH (all), BLOCK-001/002, CLEAN-001, E2E-004, E2E-005, WIZ-019                                                    |
| `src/db/*` (schema, migrations, photo store)                   | SYNC-003, SYNC-006, WIZ-015, WIZ-024, CLEAN-007, REPORT-005; migrate a DB with real queued data, never a fresh one |
| `src/visit/wizard.ts` or `src/sync/submitBody.ts`              | WIZ (all) - these are mirrored/ported logic; also run `npm run mirror:verify`                                      |
| `src/shared/*` (mirrored files)                                | BLOCK-001..003, WIZ-018; `npm run mirror:compare` against `../fieldagent`                                          |
| `src/data/*` (query client, dashboard/sites/reports hooks)     | BLOCK-003..006, CLEAN-001, REPORT-006, AUTH-010, E2E-003                                                           |
| Photo pipeline (`src/visit/photos.ts`, `src/db/photoStore.ts`) | WIZ-007, WIZ-024, REPORT-003, SYNC-006, PLAT-001..003                                                              |
| `app.json`, `app.config.js`, EAS profiles, any dependency      | NAV-005..007, PLAT (all), plus a full smoke on an installed build; `npm run lock:linux` after dependency changes   |
| Navigation (`src/app/*`, `src/lib/nav.ts`)                     | NAV (all), AUTH-011, WIZ-001/002, CLEAN-011                                                                        |
| Anything in `../balancebuddy-web/supabase/functions/`          | The suite for each caller: WIZ (visit-*), BLOCK-009 (field-agent), CLEAN (cleaner), REPORT (site-report)           |

## Related applications

The FieldAgent **web app** (`../fieldagent`) is the behavioural sibling: the wizard state machine,
error copy and dashboard assembly are ports or byte-mirrors of it. The server contracts live in
`../balancebuddy-web/supabase/functions/`. Where mobile deliberately diverges from web, the test
says so; an undocumented divergence found during a run belongs in findings.md.

## Coverage audit

Second-pass cross-check of the codebase against this suite (2026-08-19). Every route in
`src/app`, every broker/PostgREST call in `src/api`, every queue and persisted store in
`src/db`/`src/sync`/`src/auth`, and every user action reachable from a screen maps to at least
one test above. Areas reviewed and their homes:

- Routes: landing/login/enter-code (AUTH, NAV, WIZ-002) · `/v/[token]` (WIZ) · signed-in group
  (AUTH-011) · block/plan/report/reports (BLOCK, REPORT) · about/diagnostics/gallery (NAV).
- Server calls: visit-packet/photo/submit (WIZ) · field-agent my-blocks/block-visits/start-visit
  (BLOCK) · cleaner my-sites/check-in/check-out/site-duties/start-fire-checks (CLEAN) ·
  site-report upload/create/my-reports (REPORT) · staff RLS reads + self-dispatch insert
  (BLOCK-002/010) · auth (AUTH).
- Persisted state: SQLite queues + photo files (SYNC, WIZ-015, CLEAN-007, REPORT-005) · session
  (AUTH-006) · role cache (AUTH-009/010) · handoff + submitted markers (CLEAN-011) · query cache
  (BLOCK-005, AUTH-010/FIND-001).
- Background behaviour: sync triggers (SYNC-001) · orphan sweep (SYNC-006) · OTA (NAV-006).
- Not covered because it does not exist: notifications (FIND-006); OTA drill pending a real
  build (FIND-009); upstream harness gap for block history (FIND-002).

Scenario count: ~106 identified tests, many with enumerated variants.
