# Authentication and personas

Sign-in, persona resolution, the session lifecycle, and the route guard. The invariant behind
every test here: **the keyless wizard never depends on any of this** (WIZ-019), and **auth
failures never destroy queued offline work** (SYNC-008, REPORT-010).

**Relevant implementation:** `src/auth/` (AuthProvider, roles, roleCache, messages),
`src/api/session.ts`, `src/app/(app)/_layout.tsx`, `src/screens/SignedInHome.tsx`.

### AUTH-001 - Staff sign-in lands on the staff home

**Preconditions:** `FRESH-INSTALL`, online, harness running.

**Steps:** Landing screen → Sign in → `USER-STAFF` credentials → Sign in.

**Expected:**

- Lands on "Your blocks" with the 4 seeded blocks and a **Plan visits** footer button.
- The signed-in email is shown in the app bar area.
- No flash of a login form or another persona's screen on the way.

### AUTH-002 - Agent sign-in lands on the agent home

As AUTH-001 with `USER-AGENT`. **Expected:** "Your visits" with only the 2 assigned blocks; no
Plan visits button. The data arrived via the `field-agent` broker (the harness function logs show
a `my-blocks` call, not PostgREST reads).

### AUTH-003 - Cleaner sign-in lands on the cleaner home

As AUTH-001 with `USER-CLEANER`. **Expected:** "Site visits" listing the company's sites with a
fire-checks-due count per site. Scope is the cleaning **company**: any account at the same company
sees the same sites.

### AUTH-004 - Invalid credentials are refused readably

**Steps:** Sign in with a wrong password.

**Expected:** A plain-English message (not a raw Supabase error string), form still editable, no
navigation. Validation messages for a malformed email / empty password appear only after the
first submit attempt, not while typing.

### AUTH-005 - Unconfigured build

**Preconditions:** Build with no `EXPO_PUBLIC_SUPABASE_URL`/key (unset `.env`).

**Expected:** Signed-in routes redirect to login; attempting to sign in says
"This build isn't configured for signing in." The wizard and enter-code still work fully
(WIZ-019). The app never crashes on missing config.

### AUTH-006 - Session persists across restart

**Steps:** Sign in as any persona → `FORCE-STOP` → relaunch (online).

**Expected:** Still signed in, same persona home, no login screen. A brief loading state is
acceptable; a flash of the login form is not.

### AUTH-007 - Expired/revoked session

**Preconditions:** Signed in; then invalidate the session server-side (Studio: delete the user's
refresh tokens / sign out the user), or wait for expiry.

**Steps:** Trigger any broker call (pull-to-refresh).

**Expected:**

- The app returns to the login screen (a broker 401 announces session expiry once, centrally).
- **Queued offline work is untouched**: anything pending in Diagnostics before is still pending
  after. An `auth` failure is retryable-after-sign-in, never recorded as permanent.
- Signing back in nudges the queue (AUTH-012) and the held work sends.

### AUTH-008 - Sign out is local-scope only

**Preconditions:** The same account signed in on two devices/simulators (shared company logins
are a normal deployment here).

**Steps:** On device A: menu → Sign out.

**Expected:**

- Device A returns to the landing/login screen; the cached role is forgotten.
- **Device B stays signed in** and keeps working (supabase-js's default global sign-out is
  deliberately not used).
- Device A's offline queues survive: queued attendance/reports/visits still send after signing
  back in (SYNC-008).
- Signing back in immediately on device A works without an app restart (the Supabase client
  outlives the sign-out; a second sign-in must not hang on a dead listener).

### AUTH-009 - Role unknown on first sign-in offline

**Preconditions:** `FRESH-INSTALL` (no cached role). Sign-in succeeds but the role lookup cannot
(e.g. drop the network immediately after submitting credentials, or block PostgREST).

**Expected:**

- A "we can't tell what you do here yet" screen with a retry - **never a guessed persona**. A
  failed membership query must not demote staff to agent or vice versa.
- Retry with network restored resolves to the correct home.
- On later launches with no network, the **cached** role from the last successful resolution is
  used silently (no role-unknown screen).

### AUTH-010 - Role cache and read cache across user switches

**Steps:** Sign in as `USER-STAFF`, load blocks. Sign out. Sign in as `USER-AGENT`.

**Expected:**

- The agent sees agent data. The cached role from the staff user is never applied to the agent
  (the cache is keyed by user id).
- ⚠️ Behaviour requires clarification: the **persisted read cache** (dashboards, sites, sent
  reports) is keyed by role, not user, and is not cleared on sign-out - see findings.md
  (FIND-001) before judging what user B sees in the first seconds after switching.

### AUTH-011 - Route guard

**Steps (signed out):** deep-link or navigate to signed-in routes: `/(app)`, `/(app)/plan`,
`/(app)/reports`, `/(app)/report`, `/(app)/block/<id>`.

**Expected:** Every one redirects to login; no signed-in content flashes first (the guard shows a
loading screen until the session answer is known). `/v/<token>`, `/enter-code`, `/about`,
`/diagnostics` remain reachable signed out.

### AUTH-012 - A session arriving nudges the sync queue

**Preconditions:** Work queued while signed out or with a dead session (e.g. a report that failed
with "You're not signed in.").

**Steps:** Sign in. Do not background/foreground the app or touch the network.

**Expected:** The queued work sends within seconds of the session arriving, with no other
trigger. (Regression: the queue used to sit until the next unrelated trigger.)

### AUTH-013 - Persona precedence

Verified in unit tests (`src/auth/roles.test.ts`), re-verify on device only if `src/auth/roles.ts`
changed: a server-set `app_metadata.role = "cleaner"` claim wins outright; otherwise org
membership means staff; otherwise agent. An unrecognised future role gets the fallback screen
("We can't tell what you do here") with About and enter-a-visit-link still offered - never a blank
page.
