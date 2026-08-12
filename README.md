# FieldAgentLog (mobile)

Native iOS + Android client of **BalanceBuddy** (Supabase) for people standing in buildings:
inspectors opening per-visit links, external field agents, cleaners logging geo-stamped
attendance, and staff. Native sibling of the FieldAgent PWA (`../fieldagent` →
fieldagentlog.com); both stay in service.

**Status: Milestone A (foundations).** The build plan lives at `../FIELDAGENT-MOBILE-PLAN.md` -
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

## Store setup (one-time)

Do these during Milestone A - account verification is the long pole (days to weeks).

**Apple**

1. Enrol in the Apple Developer Program as an **organisation** (needs a D-U-N-S number).
2. App Store Connect → Users: add the developers.
3. Certificates/profiles: none by hand - EAS manages signing (`eas credentials`).
4. App Store Connect → New App: name **FieldAgentLog**, bundle id **`com.fieldagentlog.app`**,
   SKU `fieldagentlog`. TestFlight internal testing works from the first uploaded build, no
   review needed.

**Google**

1. Create a Play Console developer account - **organisation** account. (A personal account must
   run a 14-day / 12-tester closed test before production access; an org account must not.)
2. Play Console → Create app: **FieldAgentLog**, package **`com.fieldagentlog.app`**.
3. Accept Play App Signing (default). The app-signing SHA-256 shown there - not the upload key -
   is what goes in the website's `assetlinks.json` (phase G4).

**EAS (Expo)**

1. `npm i -g eas-cli && eas login` (Expo account, one for the org).
2. `eas init` - writes the EAS project id into `app.json`.
3. `eas credentials` per platform once store accounts exist.

## Release runbook

Steps appear here the moment they first exist (never retrospectively), so this section is always
how the app ships _today_.

- **Dev server (exists now):** `npm start` against a simulator/device.
- **Internal build (exists now):** `eas build --profile preview --platform ios|android` - signed
  internal-distribution build against production BalanceBuddy. Needs `eas login` + `eas init`
  (once) and the publishable key in `eas env`.
- Beta distribution: added in F3. Production release + OTA updates: added in H3.
