# Site reports

Reporting something wrong with a building - deliberately unbound from checks and attendance.
Available to all three personas. Persist-then-queue: tapping Send puts the report on the phone
and the reporter walks away; photos upload first, then the report that cites them.

**Relevant implementation:** `src/screens/report/`, `src/report/` (draft, useReportDraft),
`src/sync/reportSync.ts`, `src/api/report.ts`, `src/components/ReportButton.tsx`,
`src/app/(app)/report.tsx` (route guard).

### REPORT-001 - Compose and send

**Preconditions:** Any signed-in persona, at a report entry point (block detail, on-site card, or
cleaner home), online.

**Steps:** Pick a category, write a note, attach a photo, Send.

**Expected:** Accepted immediately with confirmation; it appears under Your reports as sent once
the queue drains (watch the pending row leave without a pull-to-refresh). Server-side: one report
row, correct block, category, note, photo count, and `reported_at` = when it was raised.
Categories offered: Repair (default), Cleaning, Waste, Safety, Security, Grounds, Antisocial,
Other - these mirror a server CHECK constraint, so an app-side change here is a wire change.

### REPORT-002 - Validation

**Steps:** Try to send: with no note; (cleaner, cold entry) with no site chosen; then add an 11th
photo.

**Expected:** A note is required ("a photo on its own is a puzzle") - a photo alone does not
suffice. A site must be chosen where there is a picker. Photos cap at 10 with a message on the
11th attempt; the note field caps input at 4000 characters. Validation scolds only after the
first Send attempt. Nothing invalid is ever queued.

### REPORT-003 - Photos

**Steps:** Add from camera and library; remove one; deny a permission; cancel the picker.

**Expected:** Same pipeline as the wizard (downscale ≤ 2000 px, rotation normalised). Removal
works before send. Denied → Settings copy; cancelled → nothing. Photo attach works `OFFLINE`
(camera needs no network).

### REPORT-004 - The geotag never costs the report

**Steps:** Send with location denied; send somewhere a fix is slow.

**Expected:** The report sends regardless. The fix is best-effort with a short budget - the send
never hangs on GPS and never errors because of it; the row simply has no position.

### REPORT-005 - Offline send and the badge

**Steps:** `OFFLINE`: compose and send with two photos. Check the entry-point button and Your
reports. `FORCE-STOP`, relaunch still offline. Restore signal.

**Expected:** Send is accepted offline; the entry button shows "N reports waiting to send"; the
pending row shows how many photos are still to send. All of it survives the force-stop. On
signal: photos upload, the report lands, the pending row and badge clear without user action.

### REPORT-006 - Your reports is two honest lists

**Expected:** Reports still on the phone come **first** (the question the screen answers is "did
it go?"), then the server's list, newest first. Loading/refresh/stale behaviour as BLOCK-004: a
failed refresh keeps the sent list with a caption. Empty state only when both lists are truly
empty.

### REPORT-007 - Replay safety and ordering

**Steps:** Interrupt the network mid-send of a 3-photo report; restore; let it retry. Check
harness logs and Studio.

**Expected:** Photos upload before the create call; the server refuses a report citing an
un-uploaded path, so a half-uploaded report can never become a real one. Already-uploaded photos
are not re-uploaded after the interruption (each file appears once in logs). The create is
idempotent on the client id: retries after a lost response never file a duplicate. After landing,
local photo bytes are cleaned up (Diagnostics photo-store usage drops).

### REPORT-008 - A report that can never be filed

**Steps:** Queue a report offline, then in Studio unassign the reporter from that block (or
delete the block). Restore signal.

**Expected:** The push fails permanently; the failure is recorded on the report and shown on its
pending row with the reason; the queue stops offering it (no re-POST every app start). Other
queued reports are unaffected. ⚠️ Behaviour requires clarification on recovery: there is no
delete/edit for a permanently-failed report - see findings FIND-004.

### REPORT-009 - The device refuses to store

Hard to stage (full disk). The contract, unit-tested: report writes **throw** rather than
swallow - the reporter must be told at Send time, never shown "saved" for a report that was not.
If a storage failure is ever observed live: the error surfaces on the form and nothing pretends
to be queued.

### REPORT-010 - Queued through a dead session

**Steps:** Queue a report offline; force the session to expire (AUTH-007) before signal returns;
restore signal (the push fails with an auth error); sign back in.

**Expected:** The report is **not** poisoned: an auth failure is never recorded as permanent.
Signing in nudges the queue and the report sends. (Regression: two real reports were once marked
"You're not signed in." and never offered again.)

### REPORT-011 - The route cannot make an unfileable report

**Steps:** Deep-link `/(app)/report` with no parameters as staff and as agent; as cleaner.

**Expected:** Staff/agent are redirected to their home (their entry points always carry a block;
arriving without one is a stale or hand-typed link). A cleaner gets the picker form - their cold
entry is legitimate. No path exists to compose a report with no site.
