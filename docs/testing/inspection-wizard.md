# Inspection wizard (keyless)

The product's main flow: a per-visit token is the whole credential. The wizard must open with no
account, no Supabase config and no signal, and nothing captured in it may ever be lost to a
network or an app kill.

**Relevant implementation:** `src/app/v/[token].tsx`, `src/visit/` (wizard.ts, load.ts, record.ts,
useSubmit.ts, photos.ts), `src/sync/visitSync.ts`, `src/sync/submitBody.ts`, `src/api/visit.ts`,
`src/screens/visit/`.

## Entry

### WIZ-001 - A valid link opens the visit

**Preconditions:** `VISIT-FRESH` token; online; signed out.

**Steps:** Open `/v/<token>` (or paste into enter-code).

**Expected:** Intro screen naming the block, its address, the due date and the number of checks
due. No sign-in is asked for at any point.

### WIZ-002 - Enter-code accepts every realistic paste

**Steps:** On the enter-code screen try, one at a time:
`https://fieldagentlog.com/v/<token>`, `fieldagentlog://v/<token>`, the bare token, the token in
UPPERCASE, `...?token=<token>`, a link wrapped in `<...>` or trailing punctuation from a message
app, and junk (`hello`, half a token).

**Expected:** All token-bearing shapes open the visit (uppercase is lowercased - the server hashes
lowercase hex). Junk is refused on-device with "That doesn't look like a visit link..." and **no
network request**. Opening replaces the enter-code screen in history: Back from the visit does not
land on enter-code again.

### WIZ-003 - Inspector details are required

**Steps:** On the intro, tap Start with fields empty; then a bad email; then valid values.

**Expected:** Name and email are both required, the email must parse, and validation appears only
after the first attempt. Valid details proceed to check 1 of N. Details persist: reopening the
visit later shows them pre-filled (also pre-filled from the packet when BalanceBuddy dispatched
the link to a named inspector).

## The checks

### WIZ-004 - One check per screen; advancing requires a complete answer

**Expected per check:** frequency badge, due chip with the server's own wording rendered verbatim
("Overdue by 12 days"), standard ref, title, todo. Next is disabled until a verdict is chosen.
**Fail requires a severity and a note** before advancing; a photo is optional. Pass and N/A
advance immediately. The bar shows "Check i of N · n answered". Back from check 1 returns to the
intro; the last check's button reads Review and goes to the summary.

### WIZ-005 - Moving off Fail clears the fail-only detail

**Steps:** Fail a check with severity, note and photo → switch the verdict to Pass → back to Fail.

**Expected:** Severity, note and photo were cleared by the switch to Pass (they must not ride
into the logbook with a Pass) and do not reappear on returning to Fail. The abandoned photo is
never uploaded (WIZ-024).

### WIZ-006 - N/A is a first-class verdict

**Expected:** N/A advances with no extra fields, is tallied separately on the summary, and - the
server rule - **does not advance the check's cadence**: after submitting, the same check is still
due in BalanceBuddy. Verify server-side (harness Studio), not from app copy.

### WIZ-007 - Photo on a failed check

**Steps:** On a failed check: add from camera; then replace; then remove; then add from library.
Also: deny the camera permission (PLAT-001), and cancel the picker.

**Expected:**

- A thumbnail appears; while unsent it is labelled as saved on this phone.
- The stored photo is downscaled (long edge ≤ 2000 px, JPEG) and portrait shots are not sideways
  in the logbook (EXIF baked in by the re-encode).
- Replace and remove work; a removed photo's bytes are cleaned up eventually (SYNC-006).
- Cancel does nothing; denial shows the "Turn it on in Settings" copy, not an error dump.

### WIZ-008 - Summary

**Expected:** Tallies of pass/fail/N-A plus "Not answered"; every row jumps back to its check and
returning resumes at the summary via Review. Submit is disabled while any answered-Fail is missing
its severity or note (they are listed). Unanswered checks do **not** block submitting - they are
simply not reported and stay due server-side.

### WIZ-009 - FRA actions are optional and reversible

**Preconditions:** A packet with open fire-risk-assessment actions.

**Expected:** Actions are shown with their severity; each can be marked Still outstanding or
Resolved with an optional note; tapping the chosen status again clears it back to untouched. An
untouched list submits nothing and leaves the assessment as it stands. On the wire (verify
server-side): outstanding→`open`, resolved→`done`.

### WIZ-016 - A visit with zero checks due

**Expected:** Start drops straight onto the summary (never an empty checks screen); FRA actions,
if any, are still offered; submitting works.

### WIZ-017 - Leaving mid-inspection

**Steps:** Mid-checks, use the leave/exit affordance in the bar.

**Expected:** A confirm explaining that answers so far are saved on this phone and will be there
on return. Confirming returns to the intro; reopening the link resumes with every answer intact.
(Android hardware back: see findings FIND-003.)

### WIZ-018 - Specialist checks never appear

**Preconditions:** A block whose catalogue includes contractor/specialist-responsibility checks.

**Expected:** They are absent from the count on the intro, the check screens, the summary and the
submitted results. FieldAgentLog runs the in-house checks only.

## Loading states and dead ends

### WIZ-010 - Submit online

**Steps:** Complete a visit and submit with signal.

**Expected:** Success screen naming the block; "View the logbook" opens the PDF in the **system
browser** (an aged-out signed link shows a failure line rather than doing nothing). For a signed-in
person there is a way back into the app; for a link-only inspector the screen is terminal - no
route to a sign-in wall.

### WIZ-011 - Reopening a finished visit

**Steps:** Reopen `VISIT-SUBMITTED`'s link on the same device, **offline**.

**Expected:** The locked success screen, from cache, with **no network request** (verify: no
request in harness logs / works in airplane mode). There is no way back into editing.

### WIZ-012 - Dead links

**Steps:** Open, in turn: `TOKEN-INVALID`; `TOKEN-DEAD` (used, no local record); a revoked and an
expired token (age or revoke one in Studio).

**Expected:** Each gets its matching terminal copy (expired / already done / turned off / isn't
valid), each telling the reader to ask for a new link. **No retry button.** A dead link beats a
cached packet: a visit half-done on this device whose token was revoked server-side opens on the
dead end, not an editable wizard. A signed-in user gets a way back to their home; a keyless
inspector does not.

### WIZ-013 - A closed visit inside a 200

**Expected:** A packet whose body says the visit is submitted/expired/revoked is a dead end even
though the HTTP status was 200. (Unit-tested; re-verify on device only if `fetchPacket` or the
status vocabulary changed.)

### WIZ-014 - Offline on first open vs offline with cache

**Steps:** (a) `OFFLINE`, open a token this device has never seen. (b) Open a visit online, kill
the app, go `OFFLINE`, reopen the link.

**Expected:** (a) A connection-error screen with retry - retry with signal restored loads the
visit. (b) The wizard opens from cache and says the inspector is working offline; everything but
submit-completion works.

## Persistence and submit

### WIZ-015 - Answers survive anything

**Steps:** Mid-visit with answers, notes and a photo: `FORCE-STOP`, reopen the link. Repeat with
the device rebooted.

**Expected:** Every answer, note, photo thumbnail and the inspector details are back; the resumed
visit's **start time is the original first-open time** (verify `started_at` on the submitted row
later - a resumed visit must not claim it started when it was resumed).

### WIZ-021 - The basement submit

**Steps:** Complete a visit `OFFLINE` (photo included) → Submit.

**Expected:** "Saved on this phone"; the button reads **Waiting for signal** and is disabled
(there is nothing useful to press - the engine watches for signal itself).

Then, two variants, both must pass:

- **(a) Summary stays open:** restore signal. The submit completes and the success screen arrives
  without any tap.
- **(b) Force-stop first:** `FORCE-STOP` while queued, restore signal, cold-start the app and stay
  on the home screen **without opening the visit**. The inspection sends itself (verify
  server-side); opening the link afterwards shows the locked success screen. **Build: installed**
  for the strict cold-start version.

### WIZ-022 - Submit is replay-safe

**Steps:** Engineer a lost response (kill the app the instant Submit is tapped online, then
relaunch; or drop the network between request and response).

**Expected:** The retry completes the visit; **exactly one** visit row exists server-side (the
server is idempotent on the token). Same check via duplicate passes: multiple sync triggers fired
together never double-submit or double-upload (single-flight engine).

### WIZ-023 - A submit that can never succeed

**Steps:** Queue a submit offline, revoke the token in Studio, restore signal.

**Expected:** The failure is recorded on the visit: the summary shows a blocked state with the
reason, the queue **stops offering the task** (no re-POST on every app start - check harness logs
show no repeats), and other queued work is unaffected. Reopening the visit after a restart still
explains itself. "Try again" re-queues once, fails once, records again.

### WIZ-024 - Photo upload ordering

**Steps:** A visit with 3+ photos, poor/interrupted signal (drop the network mid-pass).

**Expected:**

- Photos upload before the submit; the submit never goes while any referenced photo lacks a
  server ref (a logbook entry with a hole is worse than a late one).
- Each landed ref is persisted immediately: after an interruption, already-uploaded photos are
  **not** re-uploaded (harness logs show each file once).
- Photos no longer referenced by any answer are dropped, not uploaded.
- A check pointing at a photo whose file/queue row is gone does not strand the visit: the dangling
  reference is dropped and the visit can still submit.

### WIZ-019 - Keyless invariants

**Steps:** Signed out and `FRESH-INSTALL`: run WIZ-001→WIZ-010 end to end. Then repeat WIZ-001 on
an unconfigured build (AUTH-005).

**Expected:** Identical behaviour. The wizard never asks for, or waits on, anything from the
signed-in half.

### WIZ-020 - The wire body

Unit-tested (`src/sync/submitBody.test.ts`); re-verify server-side only when the mapping changes:
UI severity `intolerable` arrives as `critical`; unanswered checks are absent from `results`;
severity is present only on failures; notes are trimmed; `started_at` is first-open time,
`completed_at` is submit time.
