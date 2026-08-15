# Architecture

Module map and the rules that keep it honest. Complete as of Milestone B; the
UI layers arrive in C-F.

## Layers

| Directory          | Owns                                                               | Never does                      |
| ------------------ | ------------------------------------------------------------------ | ------------------------------- |
| `src/app`          | Routes: render, dispatch, navigate                                 | Fetch, retry, touch storage     |
| `src/components`   | Presentational primitives                                          | Know about the network          |
| `src/theme`        | Design tokens ported from the web app                              | -                               |
| `src/lib`          | Config and small platform-free helpers                             | -                               |
| `src/shared`       | **Mirrored** logic (see below)                                     | Diverge from the web app        |
| `src/api`          | Network calls, error taxonomy                                      | Retry, queue                    |
| `src/db`           | SQLite + photo files                                               | Talk to the network             |
| `src/sync`         | Queues, ordering, retries, backoff                                 | Render                          |
| `src/data`         | Server state: cached reads, freshness                              | Queue writes                    |
| `src/auth`         | Session storage, role resolution                                   | Decide permissions              |
| `src/bootstrap.ts` | Composition root: opens storage, registers queues, starts triggers | Contain logic, hold queue state |

A screen that fetches is wrong even if it works. `src/bootstrap.ts` sits
deliberately outside `src/app`, because Expo Router treats every file there as a
route: a non-route module logs a missing-default-export warning, and a **test
file is bundled into the app as a navigable screen**. Screens with tests
therefore live in `src/screens` with a one-line re-export in `src/app`.

## How a link opens a visit

A dispatched link is always `https://fieldagentlog.com/v/<token>`
(`visitLinkUrl` in balancebuddy-web). Three routes in:

| Arrives as                            | Reaches `/v/[token]` because                                 |
| ------------------------------------- | ------------------------------------------------------------ |
| `https://fieldagentlog.com/v/<token>` | Expo Router strips the origin and routes on the path         |
| `fieldagentlog://v/<token>`           | a custom scheme's _host_ becomes the first path segment      |
| typed or pasted into `enter-code`     | `src/lib/token.ts` extracts the token from any of the shapes |

No linking prefixes are configured: Expo Router routes any incoming URL by path
alone. What the OS needs is the claim - `associatedDomains` (iOS) and an
`autoVerify` intent filter for `/v/` (Android), both in `app.json` - plus the
association files served from the `fieldagent` repo's `public/.well-known/`.
Until those are filled in and deployed, a tapped link opens the browser and the
enter-a-code screen is the way in.

## How a capture reaches the server

```
screen -> src/db (persist FIRST, always)
       -> requestSync()
             |
       src/sync/engine  single pass, one at a time
             |  asks each registered source what is pending
       src/sync/visitSync  photos, in order, then submit
             |
       src/api  one POST, one classified error
```

Triggers that start a pass: app start, regained connectivity, app foregrounded,
an explicit nudge after a capture, and a jittered backoff retry after a
retryable failure. Nothing else. A screen never calls the network directly.

**What is outstanding is read from the database, never from memory.** The visit
source lists `allVisits()` and the startup photo sweep lists `allPhotos()`. Both
used to read a set of tokens that only the wizard filled in, so after a
force-stop the app believed it held nothing: a visit submitted in a basement
never sent itself, and the sweep deleted the queued photos of any visit that had
not been reopened. Anything a queue must survive a force-stop has to be a query.

A failure that retrying cannot fix is recorded on the record (`submit_error`)
rather than only thrown. The engine schedules no retry for one, but app start,
reconnect and foreground would each offer the task again - a spent token was
re-POSTed ten times in a minute before this was written down.

## Testing against a real backend

The signed-in half cannot be exercised without a Supabase session. `docs/local-backend.md`
stands up a local BalanceBuddy - real Postgres, Auth and Edge Functions - from
that repo's own fire-safety migrations. Both routing bugs in D3 were found the
first time the app ran against it and would not have been caught by any test
written against a mock.

## Reads and writes are cached by different things

`src/sync` queues **writes the device owns** and must never lose. `src/data`
caches **reads the server owns** and can always re-fetch. They are deliberately
separate: putting a dashboard refresh in the same retry loop as an inspection
someone spent an hour on gets one of them wrong.

The read cache (TanStack Query, persisted to AsyncStorage) exists so an agent in
a car park sees yesterday's round instead of a spinner. Everything shown from
cache carries when it was fetched - a stale list is useful, a stale list
pretending to be current is not. A failed refresh with data underneath is not an
error state; it is the list plus a caption.

**Connectivity means `isConnected`, not `isInternetReachable`.** Measured on a
device: NetInfo re-probes reachability only every 60 s once it believes there is
no internet, so the app sat offline a full minute after signal returned. Our own
request is the better probe; a wasted attempt costs one backoff step, while
being slow costs a field worker standing in a car park.

## The shared mirror

Some logic must behave identically in this app and the FieldAgent web app
(`../fieldagent`): due-date maths, dashboard assembly, the wire contract. Two
codebases computing "overdue" differently is a compliance bug, not a cosmetic
one. Nothing enforces agreement by itself, and the gena-web / gena-mobile pair
shows the failure mode: a hand-maintained mirror that silently drifts.

`shared-mirror.json` lists the files that must stay **byte-identical**, with a
recorded hash for each. `scripts/mirror.mjs` has three modes:

| Command                  | Needs the peer repo?  | Catches                                   |
| ------------------------ | --------------------- | ----------------------------------------- |
| `npm run mirror:verify`  | No - **CI runs this** | A local edit that was never synced        |
| `npm run mirror:compare` | Yes                   | Actual drift, including web-side changes  |
| `npm run mirror:update`  | -                     | Re-records hashes after a deliberate sync |

**Changing a mirrored file** means applying the same change in `../fieldagent`,
running `mirror:compare` to prove both agree, then `mirror:update`. Both repos
change in the same piece of work, or not at all.

`src/shared` is excluded from Prettier and ESLint: the web app formats with two
spaces, and reformatting to this repo's tabs would break the mirror on the first
save. Tests we write for that logic are _not_ exempt (`.prettierignore` negates
`*.test.ts`), and live beside the mirrored file rather than inside it.

### What is not mirrored yet

`cluster.ts`, `nearby.ts`, `geocode.ts`, `types.ts` and `sync.ts` are shared in
spirit but blocked on the web side: they reach `localStorage`, or bake `Blob`
into queue types where mobile stores photo bytes as files on disk.
`shared-mirror.json` records the specific blocker per file. Unblocking them is a
small refactor in the web repo (extract the pure parts, inject the cache) and
should go to its maintainer as a reviewed PR, not a silent push.

## The lockfile must be generated on Linux

`npm install` on macOS silently omits optional dependency subtrees that only
apply to other platforms. One of ESLint's transitive deps
(`@unrs/resolver-binding-wasm32-wasi`) pins `@emnapi/core@1.10.0` while
`@napi-rs/wasm-runtime` wants `^1.7.1`; macOS installs the native binding, never
resolves the WASM one, and writes a lockfile that `npm ci` on Linux rejects.
Both GitHub Actions and EAS Build run `npm ci` on Linux, so a macOS-generated
lockfile breaks CI and every cloud build.

After any dependency change, in the same commit:

```bash
npm run lock:linux
```

It regenerates the lockfile in a Linux container and verifies `npm ci` passes
there. Skipping it breaks CI and every EAS build; that has happened twice, so
the rule is also in CLAUDE.md.

A lockfile written this way works on both: npm skips optional entries that do
not match the current platform, but it cannot invent ones that are missing.
