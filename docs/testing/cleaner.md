# Cleaner: sites, attendance, duties, handoff

The cleaner persona. Everything goes through the `cleaner` broker; scope is the cleaning company.
The core rule: **check-in/out is persist-first** - the screen updates from the device's own
record, and the network is the queue's problem. The one thing that may block a check-in/out is
the GPS fix, because attendance without a position is a claim, not a record.

**Relevant implementation:** `src/screens/cleaner/CleanerHome.tsx`, `src/cleaner/`
(useAttendance, handoff, useHandoff, useChecksSubmitted), `src/api/cleaner.ts`,
`src/sync/attendanceSync.ts`, `src/data/useSites.ts`, `src/data/useDuties.ts`,
`src/lib/position.ts`.

### CLEAN-001 - Sites list

**Preconditions:** `USER-CLEANER`, online.

**Expected:** The company's sites with a fire-checks-due count per site (only cleaner-owned,
currently-due checks - smaller than the block's whole schedule). Freshness stamp as BLOCK-003.
Empty state ("No sites yet...") when the company has no assignments. A broker refusal (e.g.
account deactivated in Studio) shows the **server's own message** - that wording is what a
locked-out cleaner on a doorstep needs.

### CLEAN-002 - Check in

**Steps:** Tap a site (location granted, outdoors/simulated fix).

**Expected:** The on-site card appears with a running timer **immediately** - before any network
activity. The check-in row carries a high-accuracy geo stamp (lat/lng/accuracy/time; verify
server-side once synced). While the queue holds it, the card says it is saved on this phone;
once the server has it, that caption goes without any user action.

### CLEAN-003 - A fix that will not come

**Steps:** Check in with, in turn: location denied; location services off; no fix available
(indoors/timeout - simulators can set "None" location).

**Expected:** The check-in **does not happen**. Each case gets its matching plain-English message
(Settings for the app / phone settings / "took too long - try again"), dismissable, and the
screen stays usable. Nothing is queued - a positionless check-in is never recorded.

### CLEAN-004 - One site at a time

**Preconditions:** Checked in at site A.

**Expected:** Every other site card is disabled while a session is open. There is no path to two
open sessions on one device.

### CLEAN-005 - Check out

**Steps:** From the on-site card, check out (fix available).

**Expected:** A banner: "Checked out of <site> - <duration> on site." plus "It goes up when you
have signal." when offline. The site list re-enables. The duration shown locally is a
convenience; the server's recorded duration is the one that counts (verify in Studio).

### CLEAN-006 - Attendance sync ordering and replay

**Steps:** Check in and out `OFFLINE`, then restore signal.

**Expected (verify server-side):**

- Exactly one session row: check-in landed **before** check-out (a check-out for an unknown
  session would 404 - it must never be sent first).
- Replays are safe: repeat passes / duplicate triggers never create a second session (idempotent
  on the client id).
- Once both ends land, the local row is deleted - Diagnostics shows the attendance queue back at
  zero.
- Partial signal: a check-in that lands moments before the network dies is not re-sent when the
  check-out finally goes.

### CLEAN-007 - An open session survives a force-stop

**Steps:** Check in → `FORCE-STOP` → relaunch (still offline is the strict version).

**Expected:** The on-site card is back, timer continuing from the original check-in time. The
phone is the only thing that knows the cleaner is on site, and it must not forget.

### CLEAN-008 - A failed sites load never hides the on-site card

**Steps:** Check in, then break the sites read (offline, or stop the harness) and re-open/refresh
the home.

**Expected:** The sites list may show its error, but the timer, **Check out**, Start checks and
the report button all remain. Checking out must always be possible regardless of what the server
is doing. (Regression: an early-return on the sites error once hid the whole card.)

### CLEAN-009 - Duties while on site

**Expected:** Only while checked in, a "while you're here" card lists that site's due
cleaner-owned checks. Duties failing to load is deliberately quiet - the card is an offer, and
its failure never buries the on-site card. No duties due → no misleading start button pressure.

### CLEAN-010 - Start checks

**Steps:** On site with duties due → Start checks. Also try it `OFFLINE`.

**Expected:** Online: the broker mints a visit and the wizard opens (pushed - the session keeps
running underneath). Offline: it fails with a readable message after the request timeout, and -
the regression this guards - **Check out stays usable the whole time**: starting checks and
checking out have separate busy states.

### CLEAN-011 - The handoff round trip

**Steps:** Start checks → complete and submit in the wizard → use the way back.

**Expected:**

- The wizard's success screen offers a way back **naming the site** - only for a visit launched
  from the cleaner app. A visit opened cold from a link never shows another app's "back".
- Back on the home: a "checks submitted - they're in the site's fire logbook" banner, shown
  **exactly once** (gone after dismiss/remount), noting the cleaner is still checked in.
- The handoff survives a `FORCE-STOP` mid-wizard: relaunching and reopening the visit still knows
  where the cleaner came from.
- Abandoning instead of submitting also returns cleanly, with no submitted banner.
- Server-side: the fire visit is linked to the attendance session when the check-in had already
  synced; a check-in still queued leaves the visit unlinked rather than refused (best-effort by
  design).

### CLEAN-012 - Reports from the cleaner's world

**Steps:** (a) While on site: report from the on-site card. (b) Not checked in: report from the
home, `OFFLINE` with sites cached.

**Expected:** (a) The site is fixed (no picker) and the report is linked to the attendance
session. (b) A site picker over the **cached** sites list - composing and queueing a report works
fully offline. Full report behaviour: REPORT suite.

### CLEAN-013 - A refused check-in is honest, not hopeful

**Steps:** Break the account server-side (Studio: `cleaners.active = false`, or unassign the
site), then check in. Restore the account and tap **Try again**.

**Expected:** The on-site card drops the "It goes up when you have signal" promise and states
the truth: "This visit couldn't be recorded - <the broker's reason>", "It stays saved on this
phone. Checking out still works." with a **Try again** button. Checking out genuinely still
works. After the account is put right, Try again sends the same check-in - exactly once
(idempotent client id) - and the card returns to normal. The honest state survives an app
restart.

### CLEAN-014 - A failed closed shift surfaces on the home, and cannot be discarded

**Steps:** With a synced check-in, break the account and check out. Let the push fail. Restore
the account; tap **Try again** on the notice.

**Expected:** One notice on the cleaner home: "A visit to <site> couldn't be recorded", the
reason, "It stays saved on this phone.", and **Try again** - nothing else. **There is no discard
anywhere for attendance**: a shift record is evidence, and it stays on the phone until it sends
or an explicit support mechanism reconciles it. Try again after the fix lands both ends
server-side and the notice clears itself. Diagnostics counts the failed row under "needs
attention" while it exists.
