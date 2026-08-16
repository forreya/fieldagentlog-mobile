# Releasing FieldAgentLog

Registration to first public version, then the routine loop. Do the stages in order: stage 0 is
the long pole (account verification takes days to weeks) and blocks everything after it.

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

Set the publishable key once so builds can read it (safe to store: it is the anon key):

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <key> --environment production
eas env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <key> --environment preview
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

## Stage 4 - Internal testing on the stores

```bash
eas build --profile production --platform all
eas submit --platform ios --latest
eas submit --platform android --latest
```

- **iOS** - the build appears in App Store Connect > TestFlight within ~15 min. **Internal**
  testers (up to 100, on your team) need no review. **External** testers do need a beta review.
- **Android** - ⚠️ **the first AAB for a package must be uploaded by hand** in Play Console >
  Testing > Internal testing > Create release. `eas submit` works only after that. This catches
  everyone once.
- Submission queues can be slow on the free tier; Ctrl+C is safe, it continues server-side. Track
  it at expo.dev.

## Stage 5 - First public release

Do not submit a shell. Apple guideline 4.2 (minimum functionality) rejects thin apps, and a
rejection sits on the account's record. Earliest defensible submission is a working inspection
wizard; the planned v1.0 is full web parity (plan Milestones A-F + H1/H2/H5).

Listing assets, the privacy declarations and the reviewer-account note are all in
**`store-setup.md`**. Bump `version` in `app.json` to `1.0.0` first.

Then: App Store Connect > add build > release notes > **Submit for review** · Play Console >
Production > create release > roll out.

## Stage 6 - Every release after

1. Bump `version` in `app.json` if it is user-facing (build numbers are automatic).
2. `npm run typecheck && npm run lint && npm test` - CI runs these too, but catch it locally.
3. Run `docs/smoke-checklist.md` on one iOS and one Android device.
4. `eas build --profile production --platform all`
5. `eas submit --platform ios --latest` and `eas submit --platform android --latest`
6. Release notes: see `../../.claude/skills/release-note-writing` for the house style (one note
   serves both stores; keep under Play's 500-char limit).

## What identifies a build

`app.config.js` stamps the commit and the build time into `extra` at build time
(`EAS_BUILD_GIT_COMMIT_HASH` on EAS, `git rev-parse` locally). The **About**
screen reads them back, and it is reachable signed out - the person on the phone
is often an inspector with no account.

Ask for the line at the top of About: `v0.1.0 (41)`, or `v0.1.0 · 3bb6217` when
no build number has been assigned yet. That is enough to identify the exact
build; nothing needs bumping by hand.

## Gotchas

- **Play's first-upload rule** (stage 4) - the single most common blocker.
- **Apple's app-signing vs upload key** - `assetlinks.json` needs Play's _app signing_
  fingerprint; using the upload key ships an app with a URL bar over the buttons.
- **`eas submit` needs a Google Service Account JSON** for Android; create it in Play Console >
  Setup > API access, then `eas credentials` stores it.
- **A rejected binary can be replaced** without re-submitting the whole listing - fix, rebuild,
  submit the new build against the same version.
