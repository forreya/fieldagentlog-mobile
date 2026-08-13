# Architecture

Module map and the rules that keep it honest. Written as the pieces land; the
full picture arrives with the sync engine (phase B7).

## Layers

| Directory        | Owns                                          | Never does                  |
| ---------------- | --------------------------------------------- | --------------------------- |
| `src/app`        | Routes: render, dispatch, navigate            | Fetch, retry, touch storage |
| `src/components` | Presentational primitives                     | Know about the network      |
| `src/theme`      | Design tokens ported from the web app         | -                           |
| `src/lib`        | Config and small platform-free helpers        | -                           |
| `src/shared`     | **Mirrored** logic (see below)                | Diverge from the web app    |
| `src/api`        | Network calls, error taxonomy (phase B1-B2)   | Retry, queue                |
| `src/db`         | SQLite + photo files (phase B3-B4)            | Talk to the network         |
| `src/sync`       | Queues, ordering, retries, backoff (phase B5) | Render                      |

A screen that fetches is wrong even if it works.

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

After any dependency change, regenerate the lockfile in a Linux container and
verify it satisfies both platforms:

```bash
docker run --rm -v "$PWD":/app -w /app node:24-bookworm \
  bash -c "rm -f package-lock.json && npm install --package-lock-only"
docker run --rm -v "$PWD":/app -w /app node:24-bookworm npm ci   # must pass
npm ci                                                            # must also pass
```

A lockfile written this way works on both: npm skips optional entries that do
not match the current platform, but it cannot invent ones that are missing.
