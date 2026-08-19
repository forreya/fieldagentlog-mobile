# Cross-feature journeys

Realistic days, run end to end. These exist because the bugs live in the joins - every regression
the smoke runs caught was found by running a whole journey, not a screen. Run them last, after
the feature suites are green, on a real device or simulator with real airplane-mode toggles.
Verify final state **server-side** (Studio) as well as on the device.

### E2E-001 - The basement inspection

The reason the app exists. **Build: installed** for the strict force-stop steps.

```
Open a dispatched link online → intro → start checks
→ answer several, one Fail with severity + note + photo
→ airplane mode ON mid-visit (pill flips offline, no reload)
→ keep answering, second photo
→ FORCE-STOP → reopen link (everything intact, working-offline note)
→ finish → submit ("Waiting for signal")
→ FORCE-STOP → airplane mode OFF
→ cold start, stay on home; DO NOT open the visit
→ the inspection sends itself
```

**Verify:** exactly one visit server-side; both photos present, correct checks; `started_at` =
the first open; reopening the link → locked success screen offline; pill online with nothing
pending; N/A checks unmoved in cadence.

### E2E-002 - A cleaner's shift

```
Sign in as USER-CLEANER → check in at a site (GPS granted)
→ airplane mode ON
→ report an issue from the on-site card (photo, no signal)
→ Start checks fails readably; Check out still usable; stay checked in
→ airplane mode OFF → Start checks → complete duties in the wizard → submit
→ back to the app (named way back; submitted banner once)
→ check out → banner with duration
```

**Verify:** one attendance session, in before out, geo-stamped both ends; the fire visit linked
to that session; the report filed against the site and linked to the session; local queues empty.

### E2E-003 - An agent's round from a car park

```
Day 1 (online): sign in as USER-AGENT, load blocks. FORCE-STOP.
Day 2: airplane mode ON → cold start → yesterday's list, honest age stamp
→ open a block (instant, from cache) → airplane OFF
→ Start checklist → complete → submit
→ back: dashboard and history both updated without a manual refresh
```

Also as `USER-STAFF`, where Start checklist is a self-dispatch (BLOCK-010) - both paths land in
the identical wizard.

### E2E-004 - A shift across a dead session

```
Sign in → queue a report and an attendance check-in offline
→ session invalidated server-side while offline
→ airplane mode OFF (pushes fail with auth, work NOT poisoned)
→ app returns to login → sign back in
→ the queued work sends with no further action
```

**Verify:** the sign-in itself triggered the send (AUTH-012); nothing was recorded permanent;
exactly one of each server-side.

### E2E-005 - A shared login across two phones

```
Same account signed in on devices A and B (normal for a cleaning company)
→ B checks in at a site → A signs out at end of shift
→ B keeps working: still signed in, checks out fine
→ A signs back in without an app restart
```

**Verify:** B never saw a sign-in wall (local-scope sign-out); both devices' work is on the
server exactly once each.

### E2E-006 - The restricted afternoon

Backend answering 402 (Supabase quota restriction - simulate at a proxy, or stub the harness).

```
Work queued across all three queues → passes run against the 402ing backend
→ nothing is recorded permanent; pill shows work saved
→ backend recovers → everything drains untouched
```

The regression this guards: a restricted afternoon once classified as permanent would have
written off every queued visit, check-in and report on every device at once.
