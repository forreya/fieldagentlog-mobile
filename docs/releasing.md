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

## Stage 0 - Accounts (one-time, start now)

**Decide first: who owns the accounts, Gena or the client org.** It sets who can publish, who is
paid, and whose name is on the listing. Changing it later means transferring the app.

1. **Apple Developer Program** - enrol at developer.apple.com, $99/yr. Choose **Organization**
   (needs a D-U-N-S number - free, allow up to 2 weeks; personal accounts publish under an
   individual's name).
2. **Google Play Console** - $25 once. Choose an **organisation** account: a _personal_ account
   must run a 14-day closed test with 12+ testers before it may go to production. An org account
   need not.
3. **Expo** - one account for the org; developers are invited to it.
4. **Privacy policy URL** - both stores require a public one, and this app collects precise
   location, photos and email. Blocker for submission, not for building. Host it on
   fieldagentlog.com.

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

**Apple** - App Store Connect > Apps > **+**:

- Name `FieldAgentLog` · Bundle ID `com.fieldagentlog.app` · SKU `fieldagentlog` · Language en-GB.
- If the bundle ID isn't listed, create it first under Certificates, IDs & Profiles > Identifiers.

**Google** - Play Console > **Create app**:

- Name `FieldAgentLog` · Package `com.fieldagentlog.app` · App (not game) · Free.
- Accept **Play App Signing**. Copy the **app signing** SHA-256 (not the upload key) - it goes in
  the website's `assetlinks.json` at phase G4.

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

**Assets needed** (both stores):

- Icon 1024x1024, no alpha, no rounded corners.
- Screenshots: iPhone 6.7" **and** 6.5"; Android phone (min 2, 1080p+).
- Play only: feature graphic 1024x500, short description (80 chars), full description (4000).
- Privacy policy URL (stage 0).

**Declarations** - answer honestly, they are audited:

- Apple **App Privacy**: Location (precise, app functionality, linked to user), Photos, Email,
  Identifiers. Not used for tracking.
- Play **Data safety**: same list, encrypted in transit, users can request deletion.
- Apple **Export compliance**: `ITSAppUsesNonExemptEncryption: false` is already set in
  `app.json` (HTTPS only).
- Play **Content rating** questionnaire, **Target audience** (18+, business use).

**Review account** - both stores need working credentials. Provide a cleaner login and, in the
review notes, a live `/v/<token>` visit link plus a line explaining that inspectors use one-time
links rather than accounts. Without that, a reviewer sees a login wall and rejects it.

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

## Gotchas

- **Play's first-upload rule** (stage 4) - the single most common blocker.
- **Apple's app-signing vs upload key** - `assetlinks.json` needs Play's _app signing_
  fingerprint; using the upload key ships an app with a URL bar over the buttons.
- **`eas submit` needs a Google Service Account JSON** for Android; create it in Play Console >
  Setup > API access, then `eas credentials` stores it.
- **A rejected binary can be replaced** without re-submitting the whole listing - fix, rebuild,
  submit the new build against the same version.
