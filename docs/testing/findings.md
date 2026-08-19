# Findings

Ambiguities, probable bugs and testability gaps discovered while building this suite, kept apart
from the tests so that a regression run does not mistake a known wart for a fresh break. Each has
a stable id the tests reference. When one is fixed, update the referencing test and remove the
entry.

### FIND-003 - Android hardware back bypasses the leave-inspection confirm

The in-app leave affordance mid-checks asks for confirmation (WIZ-017). The Android hardware/
gesture back pops the route directly with no confirm. Not data loss - every answer is persisted
on write and reopening the link resumes - but the two exits behave differently.
⚠️ Behaviour requires clarification: intentional (back = navigate, affordance = abandon) or an
oversight. Verify current behaviour on device when running NAV-008.

### FIND-005 - Universal/app links are not live

`associatedDomains` (iOS) and the `/v/` intent filter (Android) are declared, but the association
files in the `fieldagent` repo's `public/.well-known/` are not deployed. An
`https://fieldagentlog.com/v/...` link therefore opens the browser, not the app; the custom
scheme and enter-code are the working ways in. NAV-002 tests the current truth and flips when the
files go live.

### FIND-006 - No notifications exist yet

Push registration, tokens, tap-through routing: none of it is built (Milestone G). The
notifications category of this suite is intentionally absent, not overlooked. When G lands, add a
`NOTIF-*` suite covering registration, permission denial, foreground/background delivery,
tap-to-visit routing, stale targets and logged-out delivery.

### FIND-007 - A checked-in cleaner who loses location permission cannot check out

Check-out requires a fresh GPS fix and blocks without one (by design - the record is the
evidence). But if location permission is revoked _after_ check-in, every check-out attempt fails
with the Settings message and there is no other exit from the session; other sites stay disabled
(CLEAN-004). Recoverable by fixing Settings, but a cleaner whose company policy manages
permissions could be stuck. ⚠️ Behaviour requires clarification: should a positionless check-out
be allowed with an honest gap, after warning?

### FIND-008 - Unknown exceptions retry forever

The sync engine treats any non-`ApiError` failure as retryable. Correct bias for a field app
(never poison work over a classification gap), but a deterministic local bug - say a serialisation
error in one queued row - would retry for the life of the install at the capped backoff.
Acceptable cost today; worth knowing when reading device logs full of repeats.

### FIND-009 - The forced-update drill has not been run

The OTA rollback/forced-update procedure is documented in docs/releasing.md but has never been
executed - it needs an installed build containing expo-updates (Expo Go cannot receive updates).
NAV-006 cannot be marked as ever-passed until the first drill on a post-`03dea46` build.

### FIND-010 - Dev screens ship as reachable routes

`/gallery` (design gallery) and `/diagnostics` are bundled routes reachable by deep link on any
build. Nothing sensitive is shown (Diagnostics deliberately names hosts, never keys), so this is
cosmetic - but NAV-009 exercises them so a future change there does not crash from a cold link.

### FIND-012 - Queued photo files will not survive an iOS app update

Queue rows store each photo's **absolute** `file://` URI. On iOS the app
container's UUID changes on every app-store/TestFlight update: the files in
Documents migrate to the new container, but the stored URIs keep pointing at
the old one. Two consequences on first launch after an update, for any device
holding un-synced photo work: uploads fail (the path no longer exists), and
the startup sweep - which lists the CURRENT photo directory and keeps only
URIs named by rows - sees every migrated file as an orphan and **deletes the
lot**. A visit then submits without its photos (the dangling-reference
fallback) and a report retries a missing file forever.

Not triggered by restarts, force-stops or OTA updates - only by a native app
update over pending work, which is why no test has ever hit it. Build 5 over
the current internal installs is technically exposed, but build 4 could never
upload photos, so nothing real is at risk yet. Fix before store release
(H5): store paths relative to the documents directory and resolve on read, in
`src/db/photoStore.ts` and the row readers; keep-set and upload then survive
container moves. Android is unaffected (stable data dir).
