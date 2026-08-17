# Device smoke checklist

Run the whole list on one iOS and one Android device at every consolidation phase and before
every release. One line per scenario; each milestone appends its own. A failure blocks the phase.

Boxes stay **unticked**: this is a template to re-run, not a record. Log each run below.

| Run            | Platforms                  | Result                                                                                                                                                                                                                                                                                               |
| -------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B7, 2026-08-13 | Android emulator + iOS sim | A and B pass; offline/online transition verified live                                                                                                                                                                                                                                                |
| C7, 2026-08-14 | Android emulator + iOS sim | A-C pass. Found two cold-start bugs and one poisoned-queue bug; all fixed here                                                                                                                                                                                                                       |
| D1, 2026-08-14 | Android preview APK        | Offline cold start passes on an installed build; env reached the bundle                                                                                                                                                                                                                              |
| D8, 2026-08-17 | iOS sim + Android emulator | A-D pass. Found a dead end on the submitted screen for signed-in users, and an illegible button when fixing it. Verified live: agent sees 2 blocks vs staff 4, broker and self-dispatch both mint tokens, submit advances cadences with N/A correctly not advancing, and the list updates in-session |

## A - Foundations

- [ ] Cold start reaches the home screen; no font flash (Archivo from first paint).
- [ ] Home screen names the backend it resolved (`backend: ...supabase.co` for builds).
- [ ] Gallery renders: buttons (all variants), badges, due chips, verdict swatches, severity ramp, mono type.
- [ ] Disabled and busy buttons don't fire; targets feel comfortably tappable one-handed.
- [ ] OS dark mode ON: app stays light (plate metaphor is light-only).

## B - Core plumbing

- [ ] Diagnostics screen opens and reports the expected database version and journal mode.
- [ ] Airplane mode on: connection reads `offline` within a few seconds.
- [ ] Airplane mode off: connection returns to `online` within ~10s, without restarting the app.
- [ ] Queue counts survive a force-stop and relaunch (persistence, not memory).

## C - Inspector wizard

Run the whole visit, not a screen at a time: the bugs live in the joins.

- [ ] A link opens the visit; the intro names the block and counts the checks due.
- [ ] Name and email are required, and a bad email is refused before starting.
- [ ] Every check advances only when complete; a failure needs a severity and a note.
- [ ] A photo on a failed check: capture, downscale, thumbnail, replace, remove.
- [ ] Summary tallies pass/fail/N-A, and tapping a row jumps back to that check.
- [ ] Submitting online reaches the success screen; the logbook opens in the system browser.
- [ ] Reopening the same link lands on the locked success screen **with no network request**.
- [ ] Manual entry: a pasted link, a bare code, and junk (which is refused with an explanation).

### The basement test

The whole reason the app exists. Do it in this order, on a real airplane mode.

- [ ] Airplane mode ON mid-visit: the pill flips to Offline within seconds, without a reload.
- [ ] The intro shows "You're working offline" when the packet came from cache or there is no signal.
- [ ] Complete the visit offline, photo included: the photo reads "Saved on this phone".
- [ ] Submit offline: "Saved on this phone", and the button reads "Waiting for signal".
- [ ] **Force-stop the app while queued**, then turn airplane mode off.
- [ ] Cold start **at the home screen, without opening that visit**: the inspection sends itself.
- [ ] The pill returns to Online with nothing pending.

The last two are the ones that caught real bugs: the queue used to be a set of tokens in memory, so
after a force-stop the app was holding nothing it could see - the submit never went, and the startup
sweep deleted the queued photos of any visit that had not been reopened.

- [ ] On a **preview build** (not Expo Go): airplane mode, force-stop, launch. The app opens.

That last one cannot be done in Expo Go at all - the JS bundle comes from Metro over the network -
so it needs an installed build. Verified on the Android preview build, 2026-08-14.

## D - The signed-in app

Two personas share these screens, so run the list twice: once as an agent, once as staff. What
differs is where the blocks come from, and that is exactly what breaks.

- [ ] Sign in with a bad password: refused with a readable message, not a raw error.
- [ ] Sign in as an **agent**: only assigned blocks appear, read through the broker.
- [ ] Sign in as **staff**: the organisation's blocks appear, read directly under RLS.
- [ ] The summary line counts blocks, jobs due and overdue, and is stamped with its age.
- [ ] Pull to refresh updates the stamp; killing the network mid-refresh keeps the list and says so.
- [ ] Cold start offline: yesterday's list is there with an honest "Updated ... ago", not a spinner.
- [ ] Open a block: due now, not due yet, and past visits all render; a failed history load is a
      line of text, never a blocked screen.
- [ ] **Start checklist** mints a token and opens the wizard - as an agent (broker) and as staff
      (self-dispatch under RLS). Both land in the same wizard.
- [ ] Submitting from there returns to a list that has **updated**: the check just done is no longer
      overdue. Stale caches after a submit were a real bug.
- [ ] Search by name, address and postcode filters the list; junk says "Nothing matches that".
- [ ] **Nearest**: the location prompt appears only on tapping it, never on launch. Denying it shows
      a message with a way out, and tapping again after granting in Settings works.
- [ ] Sign out returns to the landing screen and leaves any queued work alone.
- [ ] **Sign straight back in, without restarting the app.** Not the same test as
      signing in after a cold start, and it shipped broken: the client was rebuilt on sign-out while
      the auth listener still watched the old one, so the second sign-in returned 200 and the form
      just sat there. Restarting between personas hides it, which is why three smoke runs missed it.

### Staff only

- [ ] **Plan visits** groups nearby blocks into rounds, numbered in drive order, with a distance.
- [ ] A block whose postcode will not geocode is listed under "Location unknown", not dropped.
- [ ] An agent who reaches /plan is told it is a staff tool rather than shown an empty screen.
- [ ] A block moving from due-soon to overdue re-plans on the next refresh (the cache key includes
      urgency, deliberately unlike the web app).

## E - The cleaner

- [ ] Sign in as a cleaner: the site list appears, not the blocks dashboard.
- [ ] Only the sites the cleaner's **company** is assigned to. Assignment is company-wide, not per
      person, so a second cleaner at the same company sees the same list.
- [ ] A site with fire checks due carries a count; one with none carries no badge at all.
- [ ] The summary totals the duties across sites, and says "1 site"/"1 fire check" in the singular.

### Attendance

The reason the app exists, for a cleaner. Do the offline half on a real airplane mode.

- [ ] Checking in asks for location **at that moment** - never on launch, never on sign-in.
- [ ] Refusing the permission stops the check-in and says how to turn it on. No half-record.
- [ ] The timer starts the instant you tap, without waiting for the network.
- [ ] The card reads "Saved on this phone" until the check-in lands, then stops saying it **by
      itself** - no pull-to-refresh, no reopening the screen.
- [ ] While on site, every site card is greyed: one open session at a time.
- [ ] **Check in with no signal**, then restore it: the queue sends the check-in on its own.
- [ ] Force-stop while on site and relaunch: the timer is still running, from the right time.
- [ ] Check out: the banner's duration matches what the server stored, not what the phone counted.
- [ ] Check out with no signal: the banner says it goes up when there is signal, and it does.
