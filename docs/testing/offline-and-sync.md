# Offline and sync

The machinery under every capture. `src/sync` queues **writes the device owns** (visits,
attendance, reports - must never be lost); `src/data` caches **reads the server owns** (can
always re-fetch). Tests here verify the engine's contract; the per-queue journeys live in their
feature suites (WIZ-021..024, CLEAN-006/007, REPORT-005/007/008/010) and are not repeated.

**Relevant implementation:** `src/sync/engine.ts`, `src/sync/triggers.ts`, `src/api/errors.ts`,
`src/db/` (database, photoStore), `src/bootstrap.ts`, `src/sync/useSyncStatus.ts`.

## The error taxonomy (the contract everything rests on)

| Server says                  | Token (visit) path                        | Broker (session) path                   | Queue behaviour                                                                                      |
| ---------------------------- | ----------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| No answer / DNS / timeout    | network                                   | network                                 | Retry (backoff)                                                                                      |
| 408, 429                     | network                                   | network                                 | Retry                                                                                                |
| 5xx, unreadable 200 body     | server                                    | server                                  | Retry, more slowly                                                                                   |
| **402 (project restricted)** | server - "temporarily unavailable"        | server - "...saved and will send later" | **Retry** - it clears on its own; a restricted afternoon must never write off queued work fleet-wide |
| 401                          | dead end (link revoked)                   | **auth** → sign-in                      | Not retried as-is, **never recorded permanent** - re-sign-in makes the same request succeed          |
| 403                          | dead end                                  | forbidden                               | Permanent: recorded on the record, stops being offered                                               |
| Other 4xx                    | dead end (expired/used/invalid by status) | invalid                                 | Permanent, as above                                                                                  |

Unit-tested exhaustively; the device tests below cover what units cannot.

### SYNC-001 - Every trigger wakes the queue

**Preconditions:** Something queued (a report is easiest), `OFFLINE`.

**Steps/Expected:** each of these, alone, causes a send once possible:

- **Reconnect:** restore signal → sends within seconds (the OS "connected" signal is trusted
  directly; the app must not sit offline for up to a minute after signal returns waiting on a
  reachability probe).
- **Foreground:** with signal but the app backgrounded through the reconnect, bringing it to the
  foreground sends.
- **App start:** `FORCE-STOP`, restore signal, cold start → sends from the home screen.
- **Capture:** a new capture with signal sends immediately (no lifecycle event needed).
- **Sign-in:** AUTH-012.

### SYNC-002 - The status pill tells the truth

**Steps:** Toggle airplane mode both ways; queue work offline.

**Expected:** Offline within a few seconds of losing signal (no reload); back online within ~10s
of regaining it, without restarting the app. Pending counts reflect the queues; syncing shows
during a pass. The pill is present on every screen where someone would act on it (wizard, homes,
report form).

### SYNC-003 - Outstanding work is read from disk, never memory

**Steps:** Queue work in all three queues (a submit-requested visit with a photo, an attendance
session, a report). `FORCE-STOP`. Cold start offline: Diagnostics shows the same counts. Restore
signal without opening any of the originating screens.

**Expected:** Everything sends. Nothing depends on a screen having been reopened - the queues
list their work from SQLite. (Regression: a submit queued in a basement once never sent after a
force-stop, and the startup sweep deleted un-reopened visits' photos.)

### SYNC-004 - One poisoned item never jams the queue

**Steps:** Create one permanently-failing item (WIZ-023 or REPORT-008) alongside healthy queued
work in other queues. Restore signal.

**Expected:** The healthy work all sends on the same pass. The poisoned item is recorded and
skipped thereafter. Each failure is reported against its own item - a screen watching its own
work never shows another queue's error.

### SYNC-005 - Retry backs off and stays single-flight

**Steps:** Queue work; give the device signal but keep the backend down (stop the harness).
Watch request logs. Then bring the backend up.

**Expected:** Retries space out (exponential, jittered, capped ~5 min) - never a tight loop. Two
triggers arriving together produce one pass plus at most one follow-up, never concurrent passes
(no duplicate photo uploads in logs). When the backend returns, the next trigger or timer drains
everything.

### SYNC-006 - Photo bytes survive the OS, and orphans do not survive the sweep

**Steps:** (a) Take photos offline; background the app for a long period / simulate cache
pressure; return - thumbnails and uploads still work (photos are copied out of the OS cache into
app documents at capture time). (b) Flip a photo-bearing check back to Pass, kill the app,
relaunch: the orphaned file is swept and Diagnostics photo-store usage drops. (c) The sweep never
touches photos still referenced by any queued visit, including visits never reopened this launch.

### SYNC-007 - Storage refusing to open degrades, not dies

Hard to stage on a healthy device. The contract: bootstrap never throws; with no database the
wizard still runs online-only. If a corrupted-storage device is ever available: the app opens,
the wizard works with signal, Diagnostics reports storage unavailable rather than crashing.

### SYNC-008 - Sign-out, account switching and queue ownership

Queued attendance and reports carry the id of the user who captured them, because the broker
attributes every write to the JWT that carries it. Visits are exempt: token-owned, they send
whoever is signed in.

**Steps:** As `USER-CLEANER`, queue a report (and an attendance session) with the backend
unreachable. Sign out. Sign in as `USER-AGENT` with the backend reachable and trigger passes
(foreground, capture, `FORCE-STOP` + cold start). Sign back in as `USER-CLEANER`.

**Expected:**

- Sign-out leaves the queues on the device; they simply stop being pushable.
- Under the agent: the cleaner's items are **not sent** (verify server-side: no new rows), not
  shown in the agent's pending list, badge or counts, and **not marked failed** - held, exactly
  as they were. The agent's own captures queue and send normally alongside them, and another
  account's open attendance session never appears on the cleaner home.
- The moment the cleaner signs back in, their items send with no further action and land
  attributed to them (`reporter_user_id` / `cleaner_user_id` in Studio).
- Rows written by builds from before ownership existed carry no owner and keep the old
  behaviour: they send under whoever is signed in, and remain visible.

### SYNC-009 - The read cache is honest about age

**Expected:** Every list shown from cache carries when it was fetched; a failed refresh is "the
list plus a caption", never a spinner over data. Cache older than 24h is not shown. The read
cache and the write queues never share fate: breaking one must not touch the other (e.g. a
dashboard that cannot refresh does not stop a queued report sending, and vice versa).
