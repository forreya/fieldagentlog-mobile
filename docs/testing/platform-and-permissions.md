# Platform and permissions

Every OS permission the app relies on, and the platform differences that matter. The full
manifest audit (what ships and what is deliberately blocked) is
[docs/permissions.md](../permissions.md); these tests verify the runtime behaviour.

The app requests exactly: **camera**, **photo library** (Android ≤ 12 only; 13+ uses the system
picker, no permission), and **location (while-in-use)**. There is no background location, no
microphone, no notifications (Milestone G - findings FIND-006).

### PLAT-001 - Camera permission lifecycle

**Steps:** First photo attempt → grant. Then revoke in Settings → try again. Then deny
permanently (Android: "don't ask again" / iOS: deny) → try again.

**Expected:** Prompt appears only at first use, never at launch. Denied (any flavour) shows
"FieldAgentLog needs camera access to photograph a fault. Turn it on in Settings, then try
again." - and after fixing it in Settings, the same button works without an app restart. A denial
never crashes or queues anything.

### PLAT-002 - Photo library

As PLAT-001 for the library path ("needs access to your photos" copy). Platform: Android 13+
shows the system picker with **no** permission prompt; Android ≤ 12 and iOS prompt.

### PLAT-003 - Photos and files at OS mercy

Covered by SYNC-006 (cache-purge survival). Platform note: both OSes may purge the cache
directory while the app is closed; captured photos must live in app documents.

### PLAT-004 - Location: three askers, one rule

The rule: **never prompted at launch**, only at the moment a feature needs it.

| Where         | Accuracy | On failure                                                      |
| ------------- | -------- | --------------------------------------------------------------- |
| Nearest sort  | balanced | List keeps its order, reason shown, toggle to retry (BLOCK-006) |
| Check-in/out  | high     | The action is blocked with specific copy (CLEAN-003)            |
| Report geotag | low      | Silent - the report goes without (REPORT-004)                   |

**Steps:** With location never granted: open the app and every screen - no prompt until Nearest
or a check-in is tapped. Grant, then revoke in Settings mid-session: Nearest degrades with its
message; check-in blocks with its message; reports still send.

⚠️ A cleaner already checked in who then loses location permission cannot check out - findings
FIND-007.

### PLAT-005 - Android null accuracy

Android can report a position with no accuracy figure; the broker rejects a stamp without one.
Unit-tested (a large honest radius is substituted); if attendance from a specific Android device
is rejected server-side, check this first. Platform: Android-specific.

### PLAT-006 - Keyboard and safe areas

**Steps:** On both platforms, smallest supported screen: the wizard note field, report note
field, and login - type with the keyboard up.

**Expected:** The focused field stays visible; footer buttons are not left stranded under the
keyboard; content respects notches/home indicators (nothing tappable in unreachable areas).

### PLAT-007 - App lifecycle differences

**Steps:** Background the app mid-wizard and mid-checked-in for 30+ minutes (iOS will suspend
it); return.

**Expected:** State is exactly as left (everything is persisted on write, so even an OS kill in
the background loses nothing - relaunch restores per WIZ-015 / CLEAN-007). The foreground return
triggers a sync pass (SYNC-001).

### PLAT-009 - Photo upload is an installed-build release gate

Photo upload must be re-proved on an **installed build of each platform** before any release -
not in Expo Go, not by unit tests. FIND-011 shipped for months because the runtime's fetch
rejected the file part before any request was made, and the app classified the throw as "no
signal": every smoke run saw a photo captured and queued and called it done. Verify the storage
object and the report/visit row server-side, and check both paths (report photos, visit check
photos - they share one primitive, so one test per platform covers both).

### PLAT-008 - Installed-build parity

Before any release: the full smoke checklist ([docs/smoke-checklist.md](../smoke-checklist.md))
on one installed iOS and one installed Android build - not simulators only, not Expo Go. History
says the joins (cold start, links, env vars reaching the bundle) break per-platform.
