# Releasing FieldAgentLog

Registration to first public version, then the routine loop.

**Where we are (2026-08-16): stages 0-4 are done.** Both store records exist, and `1.0.0 (3)` is on
TestFlight and on Play's internal track. Stage 6 is the loop to follow from here; stage 5 is the
public submission, gated on Milestone F. The one-time console work is in `store-setup.md`.

Gena Go's runbook (`../../gena-mobile/README.md`) is the reference for anything not covered here.
We deliberately differ in three places - **don't "fix" these back**:

|                 | Gena Go                                              | Here                                       | Why                                                     |
| --------------- | ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| Version numbers | `appVersionSource: local`, hand-bumped in `app.json` | `remote`, EAS owns build numbers           | Hand-bumping is forgotten, then Play rejects the upload |
| Android signing | Keystore file on a laptop, signed in Android Studio  | Play App Signing + EAS-managed credentials | A lost keystore means never updating the app again      |
| Builds          | Local Xcode/Android Studio option                    | EAS only                                   | No local toolchain to keep in sync; CI can build        |

---

## Stage 0 - Accounts (one-time)

**Settled 2026-08-12: FieldAgentLog reuses Gena Go's existing accounts** - Apple Developer, Play
Console and Expo. It ships as a second app under the same teams, so the store listings carry the
same seller name as Gena Go. No new enrolment, no D-U-N-S wait; Play production access is already
unlocked by the published app, so new-account closed-testing rules don't apply.

Still needed:

1. **Privacy policy URL** - both stores require a public one, and this app collects precise
   location, photos and email. Blocker for submission, not for building. Host it on
   fieldagentlog.com.
2. **Roles** - whoever runs releases needs Admin/App Manager in App Store Connect and equivalent
   in Play Console (already true for anyone shipping Gena Go).

## Stage 1 - Project setup (one-time)

```bash
npm i -g eas-cli
eas login
eas init            # writes the EAS project id into app.json
```

Set the publishable key and the Supabase URL once, on both environments (safe to store: the
key is the anon key, the URL is public). Builds read the URL from `eas.json`, but `eas update`
bundles read it from here - an environment missing it publishes an unconfigured bundle:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <key> --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <key> --environment preview
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value <url> --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value <url> --environment preview
```

Then let EAS generate signing credentials (never hand-manage them):

```bash
eas credentials    # iOS: distribution cert + provisioning profile; Android: upload keystore
```

## Stage 2 - Store records (one-time)

See **`store-setup.md`** - the click-through for both consoles, the declarations, and the listing
assets. Two things from it are worth knowing before you get there:

- The `apple-app-site-association` appID at phase G4 is `HQ57RV6WZK.com.fieldagentlog.app` (Team ID
  `HQ57RV6WZK`, Gena Property Management Limited).
- `assetlinks.json` needs Play's **app signing** SHA-256, never the upload key's.

## Stage 3 - First build onto a device

```bash
eas build --profile preview --platform ios       # or: android, or: all
```

Internal distribution: install straight from the EAS link. No review, no store record needed.
This is the loop for showing work in progress.

## Stage 4 - Internal testing on the stores ✅ 2026-08-16

```bash
eas build --profile production --platform all
eas submit --platform ios --latest
eas submit --platform android --latest
```

- **iOS** - `--auto-submit` on the build command does both in one go. EAS created its own App Store
  Connect API key ("[Expo] EAS Submit ...") and holds it, so submits are non-interactive. The build
  appears in TestFlight within ~15 min. **Internal** testers (up to 100, on your team) need no
  review; **external** testers do need a beta review.
- **Android** - ⚠️ **the first AAB for a package must be uploaded by hand** in Play Console >
  Testing > Internal testing > Create release. `eas submit` works only after that. This catches
  everyone once.
- Submission queues can be slow on the free tier; Ctrl+C is safe, it continues server-side. Track
  it at expo.dev.

What Play actually asked for on the first internal release, so it is not a surprise next time:

- **App content declarations did NOT block the internal track.** Privacy policy, data safety and
  the rest are required for production only. Do not let the checklist stall an internal build.
- Two warnings on the confirm screen, both expected and both ignorable: _no testers specified_
  (they are added after the release exists) and _no deobfuscation file_ (R8/ProGuard only; an Expo
  build ships a Hermes bundle and has no mapping file).
- Testers come after rollout: **Internal testing > Testers > create an email list**, then share the
  opt-in link. Nothing reaches anyone until they accept it.

## Stage 5 - First public release

Do not submit a shell. Apple guideline 4.2 (minimum functionality) rejects thin apps, and a
rejection sits on the account's record. Earliest defensible submission is a working inspection
wizard; the planned v1.0 is full web parity (plan Milestones A-F + H1/H2/H5).

Listing assets, the privacy declarations and the reviewer-account note are all in
**`store-setup.md`**.

Then: App Store Connect > add build > release notes > **Submit for review** · Play Console >
Production > create release > roll out.

## Stage 6 - Every release after

0. **Could this be an update instead?** JavaScript-only changes ship the same
   day over the air - see *Over-the-air updates* below. The rest of this stage
   is for anything that touches native code.
1. **Commit everything first.** EAS builds the working tree, and a build made before the fix you
   just wrote looks identical from the outside. Twice on day one we uploaded a stale binary.
2. Bump the **patch** in `app.json`: `1.0.0` → `1.0.1`. Gena Go's `1.0.x` convention, one bump per
   release. Build numbers stay automatic - never hand-edit them.
3. `npm run typecheck && npm run lint && npm test`
4. Run `docs/smoke-checklist.md` on one iOS and one Android device.
5. `eas build --profile production --platform all`
6. Confirm the builds are what you think they are, before either store sees them:

   ```bash
   eas build:list --limit 2 --json --non-interactive | python3 -c "
   import json,sys
   for b in json.load(sys.stdin):
       print(b['platform'], b['appVersion'], b['appBuildVersion'], (b.get('gitCommitHash') or '?')[:7])"
   ```

   The commit must be the HEAD you meant to ship.

7. `eas submit --platform ios --latest` and `eas submit --platform android --latest`
8. Release notes: see `../../.claude/skills/release-note-writing` for the house style (one note
   serves both stores; keep under Play's 500-char limit). Two Play specifics: the notes box is
   pre-filled with a **template**, not a placeholder - clear it or it publishes verbatim; and the
   release **name** should mirror the bundle (`4 (1.0.1)`), because it is what you will match
   against the About screen when someone phones in a bug.

## Over-the-air updates

An OTA update replaces the JavaScript on a phone that already has the app. It
skips both stores, so a fix reaches a cleaner the same afternoon rather than
next week. What it cannot do is change native code - a new permission, a new
Expo module, an SDK bump. Those need a build.

**Which one do I need?** If the change touches only files under `src/`, an
update will carry it. If `app.json`, `package.json` or a config plugin changed,
build. When unsure, build: `runtimeVersion` uses the **fingerprint** policy, so
a bundle that does not match a binary is simply never offered to it - an OTA
cannot brick an install, it can only fail to apply.

```bash
eas update --channel production --environment production -p android --message "Fix the thing"
eas update --channel production --environment production -p ios --message "Fix the thing"
```

Each build profile listens to the channel of the same name (`eas.json`). Two
flags are load-bearing. `--environment` makes the bundle read the EAS-hosted
env vars and ignore local `.env` files - without it, a publish from a machine
whose `.env` points at the local harness would inline that address into the
production bundle. Per-platform `-p` dates from when a vestigial web target
made `--platform all` fail on expo-sqlite; the target went in the build 10
cleanup, but per-platform is what has been verified to work.

### When it lands

Never mid-use. The rule is the web's (`fieldagent/src/lib/pwa.ts`), reached by a
different route:

- The app **always launches from the bundle already on the phone**
  (`fallbackToCacheTimeout: 0`). Nobody standing at a door waits on a network
  check to open it.
- A new bundle downloads in the background afterwards
  (`checkAutomatically: ON_LOAD`).
- It takes effect at the **next cold start**. Nothing in this app calls
  `reloadAsync()`, and `src/lib/updates.test.ts` fails if anything ever does -
  a reload mid-inspection would throw away a wizard's answers.

So: publish an update, and people get it the next time they open the app fresh.
Tell them to close it and reopen it if it is urgent. **Diagnostics** says which
state a phone is in, in as many words.

### The forced-update drill

Worth doing once per SDK bump, on a real build - Expo Go cannot run OTA.

1. Install a `preview` build on a device.
2. Note **Diagnostics → Updates**: "Running the version that was installed".
3. Change something visible in `src/`, commit, then
   `eas update --channel preview --environment preview -p android --message "drill"`
   (and `-p ios` if drilling an iOS device).
4. Background the app and reopen it. Diagnostics should now read "An update is
   ready - it starts next time the app is opened".
5. Force-quit and reopen. The change is there, and Diagnostics reads "Up to
   date".
6. Roll it back: `eas update:rollback --channel preview` (or republish the
   previous commit). Confirm the phone returns on the next cold start.

## Crash reports

There are none, by decision (2026-08-20): no Sentry project will ever be
created. The dormant integration was removed in the build 10 cleanup
(`docs/build-10-cleanup.md`). **Diagnostics → Crash reports** reads "none" on
every build.

## What identifies a build

`app.config.js` stamps the commit and the build time into `extra` at build time
(`EAS_BUILD_GIT_COMMIT_HASH` on EAS, `git rev-parse` locally). The **About**
screen reads them back, and it is reachable signed out - the person on the phone
is often an inspector with no account.

Ask for the line at the top of About: `v1.0.0 (3)`, or `v1.0.0 · 3bb6217` when
no build number has been assigned yet. That is enough to identify the exact
build; nothing needs bumping by hand.

## Checking a build without installing it

Three questions worth answering from the artifact itself rather than trusting the config. All
three were wrong at least once on day one.

**Did the env vars bake in?** `EXPO_PUBLIC_*` values are inlined at build time; if they are absent
the app starts and then says "not configured". Use `strings`, not `grep` - the bundle is Hermes
bytecode and a plain grep finds nothing, including strings you know are there.

```bash
unzip -oq app.apk -d x && strings -n 6 x/assets/index.android.bundle | grep -E "supabase.co|^eyJ"
```

**Which commit is it?** See stage 6 step 6.

**Does iOS carry the right entitlements?** Decode the profile the binary was actually signed with:

```bash
unzip -oq app.ipa -d x && security cms -D -i x/Payload/*.app/embedded.mobileprovision > p.plist &&
  /usr/libexec/PlistBuddy -c "Print :Entitlements:com.apple.developer.associated-domains" p.plist
codesign -d --entitlements :- x/Payload/*.app     # what the app itself claims
```

## Gotchas

- **Play's first-upload rule** (stage 4) - the single most common blocker.
- **Apple's app-signing vs upload key** - `assetlinks.json` needs Play's _app signing_
  fingerprint; using the upload key ships an app with a URL bar over the buttons.
- **`eas submit` needs a Google Service Account JSON** for Android; create it in Play Console >
  Setup > API access, then `eas credentials` stores it.
- **A rejected binary can be replaced** without re-submitting the whole listing - fix, rebuild,
  submit the new build against the same version.
- **A build is a snapshot of the working tree, not of HEAD.** Commit before building, and check the
  commit afterwards. This is the mistake that actually happened, twice, on the first day.
- **Every build costs ~20 minutes.** Batch the version bump and the code fix into one build rather
  than discovering the second after the first has queued.
