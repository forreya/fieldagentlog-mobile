# Setting up the store records

The one-time click-through for App Store Connect and Play Console. `releasing.md` is the runbook
for every build after this; this is the part you only do once, and it is all console work rather
than terminal work.

## What is already done

Checked 2026-08-16, so don't redo these:

| Thing                           | State                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Developer + Play accounts | Gena Go's, reused. No enrolment, no verification wait                                                                                                               |
| Play production access          | Already unlocked by Gena Go being published, so the new-account rule (14-day closed test, 12 testers) does **not** apply                                            |
| EAS project                     | `@forreya/fieldagentlog`, id `900e462b-...`                                                                                                                         |
| Publishable key on EAS          | Set in both `production` and `preview`                                                                                                                              |
| iOS signing + identifier        | Exist. A device build signed for `com.fieldagentlog.app` finished on 12 Aug, which is only possible if EAS registered the identifier and minted a distribution cert |
| Android upload keystore         | EAS-managed, created with the first Android build                                                                                                                   |

So both stores need an **app record**, and Play additionally needs a **service account** before
`eas submit` works. Neither exists yet.

## The three blockers we own

None of these are console work, and all three stop a submission dead:

1. **Privacy policy at a public URL.** Both stores require one and there is none on
   fieldagentlog.com today. The PWA repo (`../fieldagent`) is Netlify-hosted on that domain, so
   `public/privacy.html` plus a link in the footer is the whole job.
2. **A reviewer login.** Both stores reject an app that opens on a login wall with no way past it.
3. **Screenshots.** Simulator captures are fine and allowed.

---

# Part 1 - App Store Connect

## 1. Check the identifier and its Associated Domains capability

The identifier exists - EAS registered it - but **Associated Domains was not on it as of the last
iOS build**, because app links were added to `app.json` two days after that build was made. Without
that capability the `https://fieldagentlog.com/v/...` visit links open Safari instead of the app
(the website half of the job is phase G4).

EAS syncs capabilities from the entitlements on every build, so the next iOS build should enable it
with nothing clicked. Verify rather than assume, either way:

**In the browser.** developer.apple.com > Account > **Certificates, Identifiers & Profiles** >
**Identifiers** > `com.fieldagentlog.app` > find **Associated Domains** in the capability list.
Note this is developer.apple.com, not App Store Connect - same login, different site. Ticking it by
hand invalidates existing provisioning profiles; that is harmless here, because EAS regenerates them
on the next build.

**From the artifact**, which is what the device actually enforces. Download any finished iOS build
and read the profile it was signed with:

```bash
eas build:list --platform ios --limit 1 --json --non-interactive | \
  python3 -c "import json,sys;print(json.load(sys.stdin)[0]['artifacts']['buildUrl'])" | \
  xargs curl -sL -o /tmp/fal.ipa && unzip -oq /tmp/fal.ipa -d /tmp/fal && \
  security cms -D -i /tmp/fal/Payload/*.app/embedded.mobileprovision > /tmp/fal.plist && \
  /usr/libexec/PlistBuddy -c "Print :Entitlements:com.apple.developer.associated-domains" /tmp/fal.plist
```

`applinks:fieldagentlog.com` means it is on. "Does Not Exist" means it is not, and the links will
open Safari no matter what the website serves.

## 2. Create the app record

App Store Connect > **Apps > + > New App**:

| Field            | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| Platform         | iOS                                                           |
| Name             | `FieldAgentLog` (30 chars max, unique across the whole store) |
| Primary language | English (U.K.)                                                |
| Bundle ID        | `com.fieldagentlog.app`                                       |
| SKU              | `fieldagentlog` (internal only, never shown)                  |
| User access      | Full                                                          |

If the name is taken, App Store Connect says so here. The display name under the icon comes from
`app.json`, not from this field, so they can differ if they have to.

## 3. App Information

- **Subtitle** (30 chars): something like `Fire-safety checks on site`.
- **Category**: Business, secondary Utilities.
- **Content rights**: does not contain third-party content.
- **Age rating**: run the questionnaire. Every answer is None/No, giving 4+.
- **Privacy policy URL**: blocker 1.

## 4. Pricing and availability

Free. **Recommend United Kingdom only** - the product is UK-specific (UK fire-safety regs, UK
postcodes) and limiting territories cuts the review and localisation surface. Widening later is one
click; it is not a decision you are locked into.

## 5. App Privacy

The questionnaire is audited, so answer it against the build you actually submit. As the code
stands today, **location never leaves the device** (it sorts blocks by distance on-device), but
Milestone E2 check-in and Milestone F site reports both transmit coordinates. At v1.0 the answers
are:

| Data type        | Collected | Linked to user | Purpose           | Tracking |
| ---------------- | --------- | -------------- | ----------------- | -------- |
| Precise location | Yes       | Yes            | App Functionality | No       |
| Photos           | Yes       | Yes            | App Functionality | No       |
| Email address    | Yes       | Yes            | App Functionality | No       |
| Name             | Yes       | Yes            | App Functionality | No       |
| User ID          | Yes       | Yes            | App Functionality | No       |

Nothing is used for tracking and nothing is shared with third parties: there is no analytics SDK,
no crash reporter and no ad network in the app. Say "No" to the tracking question with a clear
conscience.

## 6. The version 1.0 page

- **Screenshots**: 6.9" iPhone is the required set now (1290x2796 or 1320x2868); Apple derives the
  smaller sizes. Older guidance asking for 6.5" is out of date - check what the console asks for on
  the day. Minimum 3, and no iPad set is needed because `supportsTablet` is false.
- **Description** (4000), **keywords** (100, comma-separated, no spaces), **promotional text**
  (170, editable without a new build), **support URL**, **marketing URL**.
- **Build**: appears here once a `production` build has been submitted via `eas submit`.
- **Export compliance**: already answered by `ITSAppUsesNonExemptEncryption: false` in `app.json`.
- **Sign-in required**: yes, with a demo account. In App Review Information put a working cleaner
  or agent login **and** a live `/v/<token>` link, plus a sentence saying inspectors use one-time
  links rather than accounts. A reviewer who cannot get past the login rejects the app, and the
  token flow is unusual enough to be worth explaining.

## 7. TestFlight before submitting

Internal testers (up to 100 on the team) need no review and get the build within ~15 minutes of
the upload processing. Use this before the real submission.

---

# Part 2 - Play Console

## 1. Create the app

Play Console > **Create app**:

| Field            | Value                                  |
| ---------------- | -------------------------------------- |
| App name         | `FieldAgentLog` (30 chars)             |
| Default language | English (United Kingdom)               |
| App or game      | App                                    |
| Free or paid     | Free (cannot be changed to paid later) |

Then tick the developer-programme and US-export declarations.

## 2. Play App Signing

Accept it (**Setup > App integrity > App signing**). Copy the **app signing** certificate's SHA-256
fingerprint - not the upload key's. That fingerprint goes in the website's `assetlinks.json` at
phase G4; using the upload key ships an app with a URL bar over the buttons.

## 3. Work the "Set up your app" checklist

Play will not let you release until every line is green:

- **App access**: restricted, with the demo credentials from blocker 2. Add a note about the
  token links, same as Apple.
- **Ads**: no ads.
- **Content rating**: IARC questionnaire, category Utility/Productivity/Communication. All answers
  None/No.
- **Target audience**: 18+, not appealing to children.
- **News app / COVID-19 / government / financial features / health**: no to all.
- **Data safety**: the same list as Apple's table above. Per type: collected, **not shared**,
  purpose App functionality (plus Account management for email, name and user ID), optional for
  location and photos, required for the account fields. Then: encrypted in transit **yes**, users
  can request deletion **yes** (give the URL or email that handles it).
- **Privacy policy**: blocker 1.

## 4. Store listing

- **Short description** (80 chars) and **full description** (4000).
- **App icon** 512x512 PNG, 32-bit, no alpha.
- **Feature graphic** 1024x500 - Play-only, and easy to forget.
- **Phone screenshots**: min 2, max 8, 1080p or better.
- **Category** Business, plus contact email, website and (optional) phone.

## 5. First upload must be by hand

⚠️ The single most common blocker: the **first AAB for a package must be uploaded through the
console**, not `eas submit`. Build it, download it, and drag it into
**Testing > Internal testing > Create release**. Every upload after that can go through EAS.

```bash
eas build --profile production --platform android
```

## 6. Service account, so `eas submit` works afterwards

1. Play Console > **Setup > API access** > link a Google Cloud project.
2. In Google Cloud, create a service account and download its **JSON key**.
3. Back in Play Console, grant that account **Release manager** (or Admin) on this app.
4. `eas credentials` > Android > upload the JSON.

**Never commit the JSON key.** It can publish to the store on your behalf.

## 7. Release

Internal testing > add testers by email > share the opt-in link. When it is ready for the public,
promote to Production. Budget days rather than hours for the first review on each store; later
updates are usually much quicker.

---

# Order to do it in

1. **Privacy policy** on fieldagentlog.com - the only item with a dependency on someone else's
   deploy, so start it.
2. **Both app records** (parts 1.2 and 2.1) - 20 minutes each, and they unblock everything.
3. **Play service account** - fiddly, and unrelated to anything else, so get it out of the way.
4. **Declarations and listings** - answerable now, no build required.
5. **Screenshots** - once the UI is final, i.e. after Milestone F.
6. **Submit** - not before Milestone F. Apple guideline 4.2 rejects thin apps and a rejection stays
   on the account's record; the earliest defensible submission is the full inspection wizard plus
   the cleaner and site-report flows.

One version note: `app.json` still says `0.1.0`. Bump it to `1.0.0` for the public release. Build
numbers are automatic (`appVersionSource: remote`), so that string is the only thing to set by hand.
