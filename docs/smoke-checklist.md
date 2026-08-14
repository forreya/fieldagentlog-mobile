# Device smoke checklist

Run the whole list on one iOS and one Android device at every consolidation phase and before
every release. One line per scenario; each milestone appends its own. A failure blocks the phase.

## A - Foundations

- [ ] Cold start reaches the home screen; no font flash (Archivo from first paint).
- [ ] Home screen names the backend it resolved (`backend: ...supabase.co` for builds).
- [ ] Gallery renders: buttons (all variants), badges, due chips, verdict swatches, severity ramp, mono type.
- [ ] Disabled and busy buttons don't fire; targets feel comfortably tappable one-handed.
- [ ] OS dark mode ON: app stays light (plate metaphor is light-only).

## B - Core plumbing

- [x] A-checks re-run on Android emulator 2026-08-13 (iOS sim + Android both match).
- [ ] Diagnostics screen opens and reports the expected database version and journal mode.
- [ ] Airplane mode on: connection reads `offline` within a few seconds.
- [ ] Airplane mode off: connection returns to `online` within ~10s, without restarting the app.
- [ ] Queue counts survive a force-stop and relaunch (persistence, not memory).

## C - Inspector wizard (append at C7; includes the airplane-mode basement test)
