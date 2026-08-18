# Running against a local BalanceBuddy

The signed-in half of this app cannot be tested without a real Supabase session:
the broker functions want a JWT, and there is no test account on the live
project. This is how to stand up a local one - real Postgres, real Auth, real
Edge Functions - so agent, cleaner and staff flows can be driven end to end.

Everything lives outside both repos. **`balancebuddy-web` is never modified.**

## Why not just replay their migrations

Two reasons, both discovered the hard way:

- The repo has **31 duplicate version prefixes** (`0029_payee…` and
  `0029_phase9…`). The CLI derives the version from the leading digits and
  refuses the second one.
- Some migrations are not replayable from empty. `0047` passes an integer where
  `substring()` wants an escape character; it presumably ran against a state
  where it was never evaluated.

So the local stack takes **only the fire-safety migrations, verbatim**, plus a
short prelude creating what they reference (`organizations`, `blocks`,
`organization_members`, `effective_block_role()`, and the handful of `blocks`
columns `visit-packet` selects). The tables under test are production's; only
their surroundings are stubbed.

## Setup

```bash
mkdir -p /tmp/bb-local && cd /tmp/bb-local && npx supabase init
cp -R ~/Desktop/Code/balancebuddy-web/supabase/functions/{_shared,field-agent,visit-packet,visit-photo,visit-submit} supabase/functions/
cp ~/Desktop/Code/balancebuddy-web/supabase/migrations/{0178_block_fire_profile,0179_fire_check_catalogue,0180_block_fire_checks,0181_fire_visits,0182_fire_safety_defects,0237_field_agent_assignments}.sql supabase/migrations/
```

Then add the prelude, the two `ALTER TABLE`s and the grants (see
`scratchpad/bb-local/supabase/migrations/`), and in `config.toml`:

```toml
[functions.visit-packet]
verify_jwt = false
[functions.visit-photo]
verify_jwt = false
[functions.visit-submit]
verify_jwt = false
```

That last block matters: production sets `verify_jwt: false` on the visit
functions because the inspector has no account and the per-visit token **is**
the credential. Without it the gateway rejects them before they run.

```bash
npx supabase start && ./setup.sh     # seeds an org, 3 blocks, an agent
```

## Pointing the app at it

```bash
EXPO_PUBLIC_SUPABASE_URL=http://<your-lan-ip>:54321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from supabase status>
```

The LAN IP, not `localhost` - the simulator and emulator are not the host.
Sign in as `agent@example.test` / `fieldagent123`.

## Three things that fail silently

Worth knowing, because each one looks like an app bug:

- **No table grants.** A hosted project sets default privileges before any
  migration; a trimmed set does not. Every read then fails with "permission
  denied", the broker swallows it, and the app shows an empty dashboard.
- **A missing column in a `select()`.** `visit-packet` selects
  `cleaner_assignable` (added by the cleaner migration). Without it the whole
  check query errors, the function does not inspect that error, and the packet
  arrives with an empty checklist.
- **`fire_visits.scope`** is added by the same cleaner migration and read on
  every packet request.
- **`fire_visits.started_at`** is selected by `block-visits` and written by
  `visit-submit`, but **no migration in balancebuddy-web creates it** - it
  exists only in the live database, added out-of-repo. Rebuilding from
  migrations gives a 500 on block-visits, which the function reports as
  `{"error":"[object Object]"}`. Worth raising upstream.

- **No RLS on the prelude's tables.** The worst of the four, because it fails
  _upwards_: with RLS off, every persona reads every row, so "staff read the
  database directly under RLS" passes while proving nothing, and a real leak
  would look fine. `0003_prelude_rls.sql` lifts the policies from
  `0002_rls_base.sql`. With them on, a staff member sees their org's blocks and
  an agent sees **zero** - which is the architecture's central claim.

## What a full loop proves

With the harness up, one submit through the real `visit-submit` shows the rules
the app depends on actually holding: a passed check's `next_due_at` advances by
its frequency, a failed one advances **and** opens a `fire_safety_defects` row,
and an **N/A does not advance the cadence at all**. That last one is the
invariant in CLAUDE.md, and it is worth re-proving whenever the backend moves.

## Rebuilding it (2026-08-17)

The first version of this harness lived in a temp directory and did not survive
a reboot: the containers came back, the project directory did not, and the edge
runtime was dead with its source gone. It is now a script in the repo.

```bash
./local/setup.sh            # copy migrations, start, seed
./local/setup.sh --reset    # wipe and re-seed
```

`local/setup.sh` owns everything. It copies real migrations out of
`balancebuddy-web` at run time, adds two small local files, and clears the
migrations directory first so nothing can accumulate unnoticed.

What changed in the rebuild, and why it matters:

- **The base tables are now production's own `0001_init` and `0002_rls_base`**,
  not a hand-written prelude. The old prelude's `organizations` had no `slug`,
  which is NOT NULL UNIQUE in production - a local test could pass where
  production would fail. Only `work_orders` is still stubbed, purely as an FK
  target for `0182` (`local/stubs.sql` says why).
- **`0006` and `0045` are in the set** because the broker selects
  `address_line_1/town/postcode` and filters `deleted_at`. Without them its
  blocks query fails while the checks query succeeds, so the dashboard shows no
  blocks and reports no error. That is a very quiet way to lose an afternoon.
- **`0219` is in the set**, for `fire_visits.scope` and
  `block_fire_checks.cleaner_assignable`. Milestone E needs it anyway.
- **The seed blanks eight `auth.users` token columns.** GoTrue scans them into
  non-nullable Go strings, so a NULL there makes every sign-in fail with a 500
  "Database error querying schema" while the row looks perfect in psql.
- **The seed creates the `org-templates` storage bucket.** Buckets are configured
  in the dashboard, not in a migration, so nothing in the migration set makes
  one. Both photo paths - visit photos and site-report photos - write there, and
  without it every upload fails with "Bucket not found".
- **A newly-added function needs `supabase stop` then `start`, not a container
  restart.** The edge runtime enumerates `supabase/functions` once at start, so
  a function copied in afterwards returns "Function not found" however many
  times the container is restarted.

Verified after the rebuild: both accounts sign in, staff reads four blocks
through PostgREST under RLS, the agent reads zero directly and exactly their two
through the broker.
