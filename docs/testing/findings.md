# Findings

Ambiguities, probable bugs and testability gaps discovered while building this suite, kept apart
from the tests so that a regression run does not mistake a known wart for a fresh break. Each has
a stable id the tests reference. When one is fixed, update the referencing test and remove the
entry.

### FIND-002 - `block-visits` 500s on the local harness

The `field-agent` broker's `block-visits` action selects `fire_visits.started_at`, which no
migration in balancebuddy-web creates. On the harness the action 500s; the app correctly degrades
(history is one line of text, the block stays usable). Upstream fix filed (balancebuddy-web).
Until it lands, BLOCK-008's happy path cannot run against the harness.

### FIND-003 - Android hardware back bypasses the leave-inspection confirm

The in-app leave affordance mid-checks asks for confirmation (WIZ-017). The Android hardware/
gesture back pops the route directly with no confirm. Not data loss - every answer is persisted
on write and reopening the link resumes - but the two exits behave differently.
⚠️ Behaviour requires clarification: intentional (back = navigate, affordance = abandon) or an
oversight. Verify current behaviour on device when running NAV-008.

### FIND-004 - No recovery path for permanently-failed queue items

A report or attendance session whose push failed permanently (forbidden/invalid) is recorded and
stops being offered - correct - but there is no user-facing way to discard or retry it. A failed
report row sits in Your reports with its reason indefinitely; a permanently-failed attendance
session is kept in the database as evidence of the shift but is surfaced nowhere. Deliberate as
far as it goes (never silently destroy evidence), but unbounded retention with no visibility is
⚠️ unresolved product behaviour. REPORT-008 references this.

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
