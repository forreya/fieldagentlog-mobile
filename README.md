# FieldAgentLog (mobile)

Native iOS + Android client of **BalanceBuddy** (Supabase) for people standing in buildings:
inspectors opening per-visit links, external field agents, cleaners logging geo-stamped
attendance, and staff. Native sibling of the FieldAgent PWA (`../fieldagent` →
fieldagentlog.com); both stay in service.

**Status: Milestone B (core plumbing) complete** - API clients, offline queues, sync
engine and auth exist and are wired; the UI flows arrive in C-F. The build plan lives at `../FIELDAGENT-MOBILE-PLAN.md` -
a planning artifact, not something to load into tool context. Invariants for coding agents:
[CLAUDE.md](CLAUDE.md).

## Develop

```bash
npm install
npm start            # Expo dev server (i = iOS simulator, a = Android)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (prettier + size budgets are lint errors)
npm test             # jest
```

CI (GitHub Actions) runs typecheck, lint (`--max-warnings 0`) and tests on every PR. All three
must pass before merge; no skipped tests on `main`.

## Environments

No URL or key literals in source - `src/lib/config.ts` reads these and fails fast when unset:

| Variable                               | Meaning                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | BalanceBuddy Supabase URL (local stack in dev, production in builds) |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key - safe to ship; **never** the service role    |
| `EXPO_PUBLIC_FUNCTIONS_BASE_URL`       | Optional - derived from the Supabase URL when unset                  |

- **Local dev:** `cp .env.example .env`; run `supabase start` in `../../balancebuddy-web`; paste
  the anon key from `supabase status`. The home screen shows which backend it resolved.
- **Builds:** URLs come from the profile `env` in `eas.json`; the publishable key is set once via
  `eas env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <key>` (value: Supabase
  dashboard → Settings → API). Publishable, so plain visibility is fine.

## Releasing

Full process, registration through first public version and the routine loop after it:
**[docs/releasing.md](docs/releasing.md)**. Start the account enrolment early - it is the long
pole (days to weeks) and blocks everything else.

Where the app stands today:

- **Dev server:** `npm start` against a simulator/device.
- **Internal build:** `eas build --profile preview --platform ios|android` - signed
  internal-distribution build against production BalanceBuddy.
- Beta on the stores and production release: see the doc; the app is not ready to submit yet
  (Apple guideline 4.2 rejects thin apps).
