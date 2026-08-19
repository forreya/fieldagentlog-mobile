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

### FIND-011 - Photo uploads fail in every build: winter fetch rejects RN's file descriptor

**Confirmed 2026-08-19, installed-build reproduction included.** Every photo upload - visit and
report, which share the one multipart path in `src/api/http.ts` - throws before any network I/O:
`Error: Unsupported FormDataPart implementation`, which `postJson`'s catch then mislabels as
"We couldn't reach the server." Root cause, verified in source and by probe: the `expo` package's
import side effects (`Expo.fx` → `winter/runtime.native.ts`) replace global `fetch` with Expo's
spec-compliant implementation in **all** builds, and its multipart converter
(`expo/src/winter/fetch/convertFormData.ts`) accepts only strings, Blobs, or objects exposing
`bytes()` - never React Native's classic `{uri, name, type}` descriptor. Expo's own test suite
pins the throw ("should throw an error if the react-native FormData passing an uri").

Scope proven by probe on both runtimes: Expo Go (JSON POST answered 404; both descriptor
multiparts threw) and an installed Android **release** APK with the embedded bundle (HTTPS JSON
POST answered 403; both descriptor multiparts threw; same `_fetch` bytecode implementation).
Not Expo Go-specific, not a backend problem (curl multipart to the same endpoint returns 200 and
a ref), not a URI-form problem (every queued photo is `file://` in app documents on both
platforms). The stack has been this way since the project's first lockfile, so no shipped binary
has ever uploaded a photo. The queue handles it correctly throughout - retryable, honest
"Waiting", nothing poisoned, bytes kept.

Fix direction (per the winter converter's accepted inputs): append the stored file as an
expo-file-system `File`/Blob - e.g. `form.append("file", new File(uri).blob(), name)` - at the
two append sites, keeping `postJson` single-transport. `EXPO_PUBLIC_USE_RN_FETCH` exists as an
official escape hatch but reverts the runtime rather than adopting the supported representation.
Until fixed, photo-bearing REPORT-005/-007 and WIZ-024 cannot pass end to end anywhere.
