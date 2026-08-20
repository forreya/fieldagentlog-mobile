# Build 10 cleanup

Work that must ride the next NATIVE build, batched here because every item changes the
fingerprint runtime version - doing any of it casually would cut build 9 off from OTA updates
while it is the live release.

## Remove Sentry entirely (decided 2026-08-20: not wanted, ever)

- `@sentry/react-native` from package.json and the plugin entry in app.json
- `src/lib/observability.ts` and its call sites
- `SENTRY_DISABLE_AUTO_UPLOAD` from both env blocks in eas.json (only existed to stop the
  build worker choking on the missing DSN)
- the Sentry section of docs/releasing.md

## Drop dead template dependencies (nothing in src imports them)

- `@expo/ui`, `expo-glass-effect`, `expo-symbols`, `expo-web-browser`
- `react-dom`, `react-native-web`, and the `web` block in app.json - the app is native-only
  (the PWA is its own repo). This block is why `eas update --platform all` fails; per-platform
  publishes work around it until this lands.
- `react-native-reanimated`, `react-native-worklets`
- `expo-status-bar` - unused
- `expo-system-ui` - CHECK FIRST: may back `userInterfaceStyle` on Android via config plugin

## How to do it safely

One commit. After removing: full test suite, `npx expo-doctor`, then a preview build on BOTH
platforms and the smoke checklist before the production build - a native module a library
needed transitively only fails at runtime.
