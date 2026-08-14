# Device smoke checklist

Run the whole list on one iOS and one Android device at every consolidation phase and before
every release. One line per scenario; each milestone appends its own. A failure blocks the phase.

Boxes stay **unticked**: this is a template to re-run, not a record. Log each run below.

| Run            | Platforms                  | Result                                                                         |
| -------------- | -------------------------- | ------------------------------------------------------------------------------ |
| B7, 2026-08-13 | Android emulator + iOS sim | A and B pass; offline/online transition verified live                          |
| C7, 2026-08-14 | Android emulator + iOS sim | A-C pass. Found two cold-start bugs and one poisoned-queue bug; all fixed here |
| D1, 2026-08-14 | Android preview APK        | Offline cold start passes on an installed build; env reached the bundle        |

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
