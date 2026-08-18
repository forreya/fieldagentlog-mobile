# Permissions and manifest audit

What the app asks the operating system for, why, and what it deliberately does
not ask for. Written for two readers: whoever fills in the store forms, and
whoever adds the next dependency.

`app.json` is the source of truth. `ios/` and `android/` are gitignored build
output - to see what actually ships, regenerate them:

```
npx expo prebuild --clean
```

then read `android/app/src/main/AndroidManifest.xml` and
`ios/FieldAgentLog/Info.plist`. Afterwards, `rm -rf ios android` and
`git checkout package.json` - prebuild rewrites the `ios` and `android` scripts
to `expo run:*`, which is the bare-workflow flow this project does not use, and
it reindents the file on the way past. `src/lib/permissions.test.ts` guards the
decisions below so they cannot quietly come undone.

## What ships

### Android

| Permission | Why |
|---|---|
| `INTERNET` | Everything the app sends. |
| `ACCESS_FINE_LOCATION` | Check-in and check-out are geo-stamped at both ends - that is the evidence the record rests on, and a coarse fix is not good enough for it. |
| `ACCESS_COARSE_LOCATION` | Sorting blocks by distance, and the best-effort fix on a site report. Neither needs metre-level accuracy, and a coarse fix arrives sooner and costs less battery. |
| `READ_EXTERNAL_STORAGE` (API ≤ 32) | Reading a photo the user picked from their library. Android 13 replaced this with the system photo picker, which needs no permission, so it is capped at API 32 rather than requested everywhere. |

Four permissions. Nothing else.

### iOS

| Key | Why |
|---|---|
| `NSLocationWhenInUseUsageDescription` | The three places location is used: check in/out, reporting an issue, sorting by distance. |
| `NSCameraUsageDescription` | Photographing a fault on a check or a report. |
| `NSPhotoLibraryUsageDescription` | Attaching an existing picture instead. |

Three strings. There is **no `UIBackgroundModes`** entry, which is what makes
the "never used in the background" line in the location string true rather than
a claim.

## What is deliberately blocked

Expo's base Android template ships four permissions under a comment reading
`OPTIONAL PERMISSIONS, REMOVE WHATEVER YOU DO NOT NEED`. They had not been
removed, so until this audit the app shipped:

- **`SYSTEM_ALERT_WINDOW`** - "draw over other apps". React Native's dev overlay
  wants it; a release build does not. The worst of the six: it is a sensitive
  permission, Play calls it out, and no part of this app draws over anything.
- **`VIBRATE`** - nothing in the app vibrates.
- **`WRITE_EXTERNAL_STORAGE`** - photos are written to app-private storage. The
  app never writes to the shared gallery.

Blocked alongside three that were already handled:

- **`ACCESS_BACKGROUND_LOCATION`** - the app promises it never tracks in the
  background, and this is what holds it to that.
- **`RECORD_AUDIO`**, **`READ_MEDIA_VIDEO`** - stills only.

On iOS the plugins had added five purpose strings for capabilities the app does
not have: Face ID (`expo-secure-store` offers a biometric gate; the session does
not use it), microphone and motion, and both background-location strings. Every
one was `$(PRODUCT_NAME)` boilerplate. Shipping a purpose string advertises a
capability - a reviewer reads it as something the app does.

They are switched off with `false` in the plugin options rather than deleted
from the generated plist, because the plist is regenerated on every prebuild.
Removing the *option* does not remove the key; it restores the default.

## Filling in the store forms

Both stores ask what is collected and why. The honest answers:

- **Location** - collected. Precise. Tied to the user's account. Used for "App
  functionality": a check-in without a position is a claim rather than a record.
  Not shared with third parties, not used for advertising or tracking.
- **Photos** - collected, as evidence attached to a check or a report. Tied to
  the account.
- **Email address** - collected for sign-in, and it appears on the inspection
  record the report is signed with.
- **No** advertising ID, no analytics SDK, no third-party tracking, no data sold.

## When adding a dependency

Prebuild and diff. Every one of the six blocked permissions arrived from a
dependency's defaults rather than from anyone deciding to ask for it, and that
is how it will happen again. `npx expo prebuild --clean`, read both manifests,
and if something new appears either justify it here or block it in
`android.blockedPermissions` / switch the plugin option to `false`.
