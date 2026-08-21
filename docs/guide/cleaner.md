# Cleaners

Sign in and you land on **Site visits**: your company's sites, each with a count of fire
checks currently due that belong to cleaners. Everyone at your company sees the same sites.

## Checking in

Tap a site to check in. Two things to know:

1. **It needs a GPS fix.** Attendance is a record of having been somewhere, so a check-in
   without a position is never recorded. If location is denied, off, or the fix times out
   (deep indoors), you get a plain message saying which and what to do - the check-in simply
   doesn't happen until there's a fix.
2. **It does not need signal.** The moment the fix lands, you are checked in - the on-site
   card appears with a running timer before the network is involved at all. While the phone
   still holds it, the card says it is saved on this phone; that caption disappears by itself
   once the server has it.

You can be checked in at **one site at a time** - the other site cards disable until you check
out.

## While you're on site

The on-site card is your base. It survives anything - closing the app, a phone restart - with
the timer continuing from the true check-in time. From it you can:

- **Start checks** - if the site has cleaner-owned fire checks due, a "while you're here" card
  lists them and Start checks opens the inspection wizard ([inspector.md](inspector.md)).
  This needs signal to start. When you submit and come back, a one-time banner confirms the
  checks are in the site's fire logbook - and you are still checked in throughout.
- **Report a problem** - opens the report form with the site already chosen
  ([reports.md](reports.md)).
- **Check out.**

Checking out always works, no matter what else is failing - a broken sites list, checks that
won't start, no signal. It is deliberately never blocked by anything but its own GPS fix.

## Checking out

Check out (it also wants a fix) and you get a banner with your time on site, plus "It goes up
when you have signal." if the phone is offline. The site list re-enables.

## If a check-in or check-out couldn't be recorded

Normally sync is invisible. But if the server actively refuses your attendance (for example
the account was deactivated or the site unassigned while you worked), the app tells you the
truth rather than promising it will send: the card or a notice on the home says the visit
couldn't be recorded, gives the server's reason, and notes it stays saved on this phone. One
button: **Try again** - for after whoever manages the account has fixed it.

There is deliberately **no way to delete a failed check-in or check-out**. A shift record is
evidence that you were at work; it stays on the phone until it sends.
