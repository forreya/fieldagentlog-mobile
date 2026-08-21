# How offline works

The app's rule for anything you create - answers, photos, check-ins, check-outs, reports,
submitted visits - is **save on the phone first, send later**. The screen updates from the
phone's own record, and sending is the app's problem, not yours. You never have to hold the
app open, tap retry, or wait on a spinner for your work to be safe.

## When things send

The app tries automatically: when signal returns, when you open or return to the app, when
you sign in, and periodically while there is work to send. Sending never repeats work - a
photo that uploaded before the signal died is not uploaded again, and a submission the server
already has is recognised, not duplicated.

## What the phrases mean

| You see | It means |
| --- | --- |
| "Saved on this phone" | Captured and safe locally; the server doesn't have it yet |
| "Waiting for signal" / "they go when you have signal" | Queued; will send itself, app open or not |
| "Updated N minutes ago" | You're looking at the last successful load of a list; a refresh will be attempted when possible |
| "Not sent - needs attention" | The server actively refused this item; it will NOT retry by itself - see below |

## Waiting vs failed - the important difference

**Waiting** work has simply not had its chance yet (no signal, or the server was briefly
unreachable). It needs nothing from you.

**Failed** work was refused by the server for a reason that won't change on its own - an
account deactivated, an assignment removed, a link revoked. The app stops retrying, shows you
the server's reason, and keeps the work safe on the phone:

- A **report** offers Try again and Discard ([reports.md](reports.md)).
- **Attendance** offers Try again only - a shift record can never be discarded
  ([cleaner.md](cleaner.md)).
- A **visit submit** shows the blocked reason on its summary with Try again
  ([inspector.md](inspector.md)).

Try again exists because most refusals are fixable by whoever manages the account - once
fixed, one tap sends the original work unchanged.

## What you read is cached too

Block lists, sites and report history are kept from the last successful load, shown with
their age, and never silently replaced by an error - a failed refresh keeps the data and adds
a caption. A cache older than a day is dropped rather than shown.

## Signing out and switching accounts

Signing out clears everything the signed-out person could read - the next account on this
phone starts fresh, never seeing the previous account's buildings or reports. Queued work is
different: it belongs to whoever created it. Work queued by one account is invisible to
another and is only ever sent while its creator is signed in - if someone else signs in
first, the work simply waits for its owner to return.
