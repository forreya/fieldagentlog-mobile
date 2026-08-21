# Menu, About, Diagnostics and troubleshooting

## The menu

The menu (top of the signed-in screens) offers About, Diagnostics and Sign out. Signing out
signs out **this phone only** - a shared company login on other phones stays signed in.
Queued work survives a sign-out and sends after its owner signs back in.

## About

The app's version and build - e.g. "v1.0.1 (9)" - plus the exact code it was built from.
Reachable without signing in. When someone asks "what version are you on?", this is the
screen to read from.

## Diagnostics

A self-service health check, also reachable signed out:

- **Queues** - how many visits, check-ins/outs, reports and photos are waiting to send, and
  how many need attention (failed). Zero everywhere means the server has everything.
- **Photo storage** - space used by photos still waiting to upload.
- **Updates** - whether this build takes over-the-air updates, which update is running, and
  when a downloaded one will apply ("restarts next launch").
- **Connection** - which server this build talks to.

## App updates

Two kinds. **Store updates** (App Store / Play) replace the whole app. **Over-the-air
updates** arrive by themselves: the app downloads them in the background and applies them at
the next cold start - never mid-use, never mid-inspection. Opening the app is never delayed
waiting for one. Force-closing and reopening the app twice is the manual way to pick one up
immediately.

## Permissions the app asks for

| Permission | When it's asked | Why |
| --- | --- | --- |
| Camera | First photo from the camera | Photographing faults |
| Photos | First attach from the library | Attaching existing photos |
| Location (while using) | First tap of Nearest, or a cleaner's first check-in | Sorting blocks by distance; the geo stamp on attendance; best-effort tag on reports |

The app never tracks location in the background and never asks for anything at launch.
Denying a permission never breaks the rest of the app - each feature explains what it needs
and points to Settings.

## Troubleshooting

| Symptom | What's happening |
| --- | --- |
| "That link has expired" / "already been done" / "turned off" / "isn't valid" | The visit link is dead. Ask whoever sent it for a new one - there's nothing to fix on the phone |
| "We can't tell what you do here yet" | First sign-in with no signal - the app won't guess your role. Get signal, tap retry |
| Kicked back to the sign-in screen | Your session expired or was ended. Sign back in - queued work is untouched and sends right after |
| "This build isn't configured for signing in." | A build without server config - visit links still work. Get a standard build from the store |
| Button says "Waiting for signal" | Not an error. The work is queued and sends itself - see [offline.md](offline.md) |
| "Not sent - needs attention" | The server refused it - open the item for the reason and Try again ([offline.md](offline.md)) |
| Check-in won't happen | Location permission, location services, or no GPS fix - the message says which ([cleaner.md](cleaner.md)) |
| A list looks old | It says how old it is. Pull to refresh; if refresh fails you keep the old list with its age |
| Photo won't attach | Permission denied (message points to Settings) or the picker was cancelled |

If none of that explains it, read the numbers on **Diagnostics** and report them along with
the version on **About** - together they answer most support questions.
