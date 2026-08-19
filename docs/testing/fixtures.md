# Test data and preconditions

Reusable fixtures the suites reference by name. Everything here comes from the local backend
harness ([docs/local-backend.md](../local-backend.md)): `./local/setup.sh` seeds it, `--reset`
wipes and re-seeds. Never test against production accounts, and never put a service-role key
anywhere near this repo.

The app must point at the harness: `.env` with `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to the local stack **via the machine's LAN IP**, not
`localhost` - the simulator and emulator are not the host.

## Accounts

| Fixture        | Credentials                               | Persona and scope                                                                                                              |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `USER-STAFF`   | `staff@example.test` / `staffpass123`     | Org member. Reads PostgREST under RLS; sees **4 blocks**; can self-dispatch checklists and use Plan visits.                    |
| `USER-AGENT`   | `agent@example.test` / `fieldagent123`    | No org membership. Broker only; sees **2 assigned blocks**.                                                                    |
| `USER-CLEANER` | `cleaner@example.test` / `cleanerpass123` | `app_metadata.role = "cleaner"`. Broker only; sees the sites assigned to Example Cleaning Co (company-scoped, not per-person). |

These are throwaway credentials seeded into a local database; signing in with them is fine and is
the only place tests should ever type a password.

## Visits and tokens

Tokens are minted by the app itself; there is no fixture file of tokens because each is single-use.

| Fixture           | How to create it                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `VISIT-FRESH`     | Sign in as `USER-AGENT` (or `USER-STAFF`), open a block, tap **Start checklist**. Copy the token from the wizard URL if needed elsewhere. |
| `VISIT-PARTIAL`   | Open `VISIT-FRESH`, enter inspector details, answer some (not all) checks, leave the app without submitting.                              |
| `VISIT-SUBMITTED` | Complete and submit `VISIT-FRESH` online. The same link now lands on the locked success screen.                                           |
| `TOKEN-DEAD`      | The token of a `VISIT-SUBMITTED` opened on a **different** device or after clearing app storage (no local record, server says used).      |
| `TOKEN-INVALID`   | Any 64-char hex string the server never minted, e.g. `deadbeef` repeated 8 times.                                                         |
| `VISIT-CLEANER`   | As `USER-CLEANER`: check in at a site with duties due, tap **Start checks**. Links the visit to the attendance session.                   |

## Device states

| Fixture         | How                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `OFFLINE`       | Airplane mode on (simulators: toggle network/Wi-Fi off). The status pill must read offline before continuing.       |
| `FORCE-STOP`    | Kill the app from the app switcher (Android: also Force stop in Settings for the strict version).                   |
| `FRESH-INSTALL` | Delete and reinstall the app, or erase simulator content. Clears SQLite, AsyncStorage, SecureStore and photo files. |
| `PERM-DENIED`   | Deny the relevant OS permission when prompted, or revoke it in Settings after granting.                             |

## Environment caveats

- **Expo Go** cannot run: cold-start-offline tests (its JS bundle comes from Metro), OTA update
  tests (`Updates` reports "Not used in this build" there - that copy is itself under test),
  app-link tests, or anything needing a release manifest. Its floating dev-menu button also
  overlaps app UI; do not report that as a layout defect.
- **Local harness quirks** (all documented in docs/local-backend.md): Edge Functions are
  enumerated at `supabase start`, so a new function needs a full stop/start, not a container
  restart; the `field-agent` broker's `block-visits` action 500s on the harness (upstream schema
  gap - see findings.md).
- Server-side state (did the row land, was the cadence advanced) is verified through the harness's
  Supabase Studio SQL editor, not by trusting the app's own UI.
