# Field agents

Sign in and you land on **Your visits**: the blocks assigned to you, with a summary line
(blocks, jobs due, overdue) and a freshness stamp saying when the list was last updated. You
see only your assignments - nothing else in the portfolio exists for you in the app.

## The block list

- **Find** filters by name, street or postcode.
- **Nearest** sorts by distance and shows km per block. It asks for location permission the
  first time you tap it - the app never asks for location on its own. If the phone can't get a
  fix (permission denied, location off, indoors) the list keeps its normal order and says why.
- **Pull to refresh** updates in place. If the refresh fails you keep the list you had, with a
  caption noting its age - stale data is shown honestly rather than replaced with an error.
- The list works offline from the last load (up to 24 hours old, always with its age shown).

## Block detail

Tap a block to see its jobs - due now and not due yet, each with its cadence and due wording -
plus its **visit history**: every past visit with when, who, what scope (inspection or
cleaner's duties), pass/fail/N-A counts, failures with their severity, and a logbook link where
one exists.

## Starting a checklist

**Start checklist** on a block opens the same inspection wizard described in
[inspector.md](inspector.md) - the app arranges the visit for you, no link needed. Everything
there applies: offline answering, photos, FRA actions, the waiting-for-signal submit.

After you submit, the block reflects it straight away: the completed check stops being due and
the visit appears in history.

If your assignment to a block was removed since your list last refreshed, starting a checklist
is refused with a readable explanation.

## Reports

Every block detail has a report button - see [reports.md](reports.md).
