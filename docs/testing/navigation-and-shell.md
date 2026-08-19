# Navigation and app shell

Routes, deep links, the menu, About/Diagnostics, over-the-air updates and crash reporting.

**Relevant implementation:** `src/app/` (routes), `src/lib/nav.ts`, `src/lib/token.ts`,
`src/components/AppMenu.tsx`, `src/screens/AboutScreen.tsx`, `src/screens/DiagnosticsScreen.tsx`,
`src/lib/updates.ts`, `src/lib/observability.ts`, `app.json`.

### NAV-001 - The signed-out surface

**Expected:** Cold start signed out lands on the landing screen with two ways forward: open a
visit (enter-code) and sign in. No spinner-gated start; fonts are bundled so nothing flashes a
fallback face. OS dark mode on: the app stays light by design - not a bug.

### NAV-002 - Ways into a visit

**Steps:** (a) `fieldagentlog://v/<token>` custom scheme. (b) An `https://fieldagentlog.com/v/...`
link. (c) enter-code (WIZ-002).

**Expected:** (a) and (c) open the visit route. (b) opens the **browser**, not the app, until the
domain association files are deployed (findings FIND-005) - when that changes, this test changes
with it. Back from a visit opened any way leaves the app sensibly (never onto a spent enter-code
screen). **Build: installed** for link tests.

### NAV-003 - The menu

**Expected:** On every signed-in home: a menu offering Your reports, About and Sign out - each
goes where it says, and the menu dismisses on outside-tap. Sign out behaves per AUTH-008.

### NAV-004 - About and Diagnostics

**Expected:** About names the app version, build and which backend it is connected to (host only,
never keys) - the things worth quoting when reporting a problem. Diagnostics (reached from
About): backend host, database schema version and journal mode, per-queue state lines
("N waiting · N need attention", plus "N another account's" only when present - counts only,
never another account's content), photo-store bytes, sync/connectivity state, update state,
crash-reporting state. It renders even when storage will not open.

### NAV-005 - The update row never lies

**Expected:** In Expo Go and in any build without an update channel: "Not used in this build" -
**never** "Up to date" on a phone that cannot receive updates (this exact lie shipped once). In a
channel build: the running version and channel, and "update ready - restarts next launch" when
one has downloaded.

### NAV-006 - Updates apply on cold start only

**Preconditions:** Installed build with expo-updates on a channel; a newer compatible update
published (`docs/releasing.md`, forced-update drill). **Build: installed.**

**Steps:** Launch with the update available; use the app, including mid-wizard; kill and relaunch.

**Expected:**

- Launch never waits on the network for an update (no added startup delay offline - the embedded
  or cached bundle always starts immediately).
- The update downloads in the background and applies **only at the next cold start**. Nothing
  reloads the app mid-visit, ever.
- An update built against different native code never applies to this binary (fingerprint
  runtime version): publish-for-wrong-runtime is a no-op on the device, not a crash.

### NAV-007 - Crash reporting is inert and private

**Expected:** With no DSN in the build: nothing initialises, no network traffic to Sentry,
Diagnostics says so. With a DSN (preview/production): a forced test crash arrives in Sentry
carrying release/build info but **no** screenshots, view hierarchy, request bodies/URLs or user
identity - a visit URL contains the token that IS the credential, so http breadcrumbs must be
absent from any event inspected.

### NAV-008 - Back behaviour

**Steps:** Walk each Back affordance: enter-code → landing; block detail → home; reports →
whence it came; the wizard's internal Back chain (summary → last check → ... → intro). Android:
the hardware/gesture back on the same screens.

**Expected:** On-screen Back always goes somewhere sensible (a screen arrived at by deep link
with no history falls back to home, never a dead end). Wizard-internal Back never loses answers.
Android hardware back mid-checks: ⚠️ see findings FIND-003.

### NAV-009 - Stale and hand-typed routes

**Steps:** Deep-link with junk: `/v/` with no token, `/(app)/block/nonsense`, `/(app)/report`
with no params (REPORT-011), `/gallery`, `/diagnostics`.

**Expected:** Nothing crashes. Unknown blocks explain themselves (BLOCK-007); guarded routes
redirect (AUTH-011); dev-only screens render harmlessly.

### NAV-010 - Text scaling

**Steps:** Set the OS font size to maximum; revisit the wizard, homes and app bar.

**Expected:** Everything remains readable and tappable; the app bar's title/subtitle scale is
capped so the bar cannot collapse into overlap; buttons grow rather than truncate their labels.
