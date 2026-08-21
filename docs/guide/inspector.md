# The inspection wizard

The wizard is one inspection at one building, opened from a visit link. It needs no account, no
sign-in and no signal - the link itself is your access, and it works for exactly one visit.

## Opening a visit

Three ways in, all equivalent:

- Tap the link you were sent (`fieldagentlog.com/v/...`)
- Open the app and choose **Open a visit**, then paste the link or the code from it - the app
  accepts the whole link, the bare code, even a link with punctuation stuck to it from a
  messaging app
- A `fieldagentlog://` link from another app on the phone

You land on an **intro screen** naming the block, its address, when the visit is due, and how
many checks there are. Enter your **name and email** (pre-filled if the visit was dispatched to
you by name, and remembered if you come back later). Then Start.

### If the link is dead

A link can be expired, already used, turned off, or simply wrong. Each case gets a plain
message telling you what happened and to ask for a new link. There is nothing to retry - a dead
link stays dead, and the only fix is a fresh one from whoever sent it.

### If you have no signal on first open

The first open of a brand-new link needs a connection once, to fetch the checklist. If there is
none you get a connection error with a retry - step outside, retry, and from then on the whole
visit works offline. A visit you have already opened reopens from the phone's own copy with no
signal at all.

## Answering checks

One check per screen. Each shows how often it recurs, when it is due (in the server's own words,
e.g. "Overdue by 12 days"), the standard it references, and what to do. Choose a verdict:

- **Pass** - moves straight on.
- **Fail** - you must pick a severity (**low / medium / high / intolerable**) and write a note
  before you can advance. A photo is optional but strongly worth taking.
- **N/A** - for a check that doesn't apply this visit. Moves straight on. An N/A is recorded
  but does not reset the check's schedule - it stays due.

If you change a Fail to a Pass, the severity, note and photo are cleared - they belong to the
failure, and must not ride into the logbook attached to a Pass. Changing back to Fail starts
those fields fresh.

**Photos:** camera or library. The app shrinks each photo for upload (long edge 2000px) so it
doesn't eat your data, and fixes the rotation. You can replace or remove a photo before
submitting. While unsent, the thumbnail says it is saved on this phone.

The bar at the top shows "Check 3 of 12 - 2 answered" so you always know where you are. Back
works through every screen without losing anything.

## Fire risk assessment actions

If the building has open FRA actions, the wizard offers them after the checks. For each you can
mark **Still outstanding** or **Resolved**, optionally with a note - or leave it untouched, which
reports nothing and changes nothing. Tapping your chosen status again un-chooses it.

## The summary and submitting

The summary tallies passes, fails, N/As and anything not answered. Tap any row to jump back to
that check. Submit is blocked only if an answered Fail is missing its severity or note - the
summary lists which. Checks you never answered do not block submitting; they simply aren't
reported and stay due.

- **With signal:** submitting shows a success screen naming the block, with a link to view the
  logbook PDF.
- **Without signal:** the button reads **Waiting for signal** and everything is saved on the
  phone. You can pocket the phone and walk away - the inspection sends itself when the phone
  finds a connection, even if the app is closed. Reopening the link later shows the locked
  success screen.

A submitted visit is final. Reopening its link shows the completed state, never an editable
form - even offline.

## Things that are safe to do mid-inspection

All of these lose nothing: closing the app, the phone dying, restarting the phone, leaving via
the exit button (it confirms first and explains your answers are saved). Reopen the link and
you are exactly where you were, photos and all. The recorded start time stays the true first
time you opened it.

## If the visit was blocked at submit

If a queued visit can never be accepted (for example the link was revoked while you were
offline), the summary shows a blocked state with the reason instead of pretending it is still
waiting. **Try again** re-attempts it once if you think the block has been lifted.
