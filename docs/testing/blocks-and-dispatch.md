# Blocks and dispatch (staff and agent)

The signed-in halves that share the blocks screens. What differs - and what breaks - is the data
source: **staff** read PostgREST directly under RLS and can self-dispatch checklists; **agents**
go through the `field-agent` broker for everything. Run source-sensitive tests as both personas.

**Relevant implementation:** `src/screens/blocks/`, `src/screens/staff/PlanVisits.tsx`,
`src/data/useDashboard.ts`, `src/data/useBlockVisits.ts`, `src/api/staff.ts`, `src/api/agent.ts`,
`src/shared/fireData.ts` (mirrored assembly).

### BLOCK-001 - Agent sees exactly their assignments

**Preconditions:** `USER-AGENT` signed in, online.

**Expected:** Only the 2 assigned blocks. Removing an assignment in Studio and refreshing removes
the block. The broker is the only source - an agent must get nothing from PostgREST directly
(RLS gives them no rows; verify a direct query in Studio as that user returns nothing).

### BLOCK-002 - Staff see their organisation

**Preconditions:** `USER-STAFF` signed in, online.

**Expected:** All 4 seeded blocks. A staff member removed from the organisation (Studio) and
refreshing sees an empty list, not an error - and on next full sign-in resolves as an agent
persona (empty membership), which is correct least-privilege behaviour.

### BLOCK-003 - The summary line and freshness stamp

**Expected:** Block count, jobs due and overdue are correct against the seed, and the list is
stamped with its age ("Updated just now" / "... minutes ago"). Due-state wording on each block
comes from the shared assembly and must match the web app for the same data (compliance parity -
two clients disagreeing on "overdue" is a bug even if both look plausible).

### BLOCK-004 - Refresh, and refresh failure

**Steps:** Pull to refresh; then kill the network and pull again.

**Expected:** Success updates the stamp in place (list does not blank or jump). Failure **keeps
the list** and adds a stale-data caption with the age; the error never replaces data that is
still on screen. "Try again" appears only when there is nothing cached at all.

### BLOCK-005 - Cold start offline

**Steps:** Load the dashboard online → `FORCE-STOP` → `OFFLINE` → relaunch.

**Expected:** Yesterday's list with an honest "Updated ... ago", not a spinner and not an error.
A cache older than 24h is dropped instead of shown. **Build: installed** for the strict version
(Expo Go cannot cold-start offline).

### BLOCK-006 - Find and Nearest

**Steps:** With 4+ blocks: type in the find bar; toggle Nearest with location already granted;
toggle it with location denied.

**Expected:** Filtering matches name/street/postcode; no-matches shows a hint, not an empty
screen. Nearest orders by distance with per-block km; when it cannot (denied, services off,
indoors-timeout) the list keeps its own order **with the reason shown** and Nearest can be
toggled off and retried. Opening the app never prompts for location by itself - the prompt comes
only from tapping Nearest the first time (PLAT-004).

### BLOCK-007 - Block detail

**Steps:** Open a block; also deep-link `/(app)/block/<unknown-id>`.

**Expected:** Due-now and not-due-yet jobs render with cadence and due labels; the screen opens
instantly from the dashboard's cache (never "loading" for a block already on the list). An
unknown/unassigned id gets "That block isn't in your list" with a way back - no crash, no other
block's data.

### BLOCK-008 - Visit history

**Expected:** Past visits show scope (inspection vs cleaner's duties), when, who, pass/fail/N-A
counts, failures with severity, and a logbook link when there is one. History failing to load is
one line of text with the block still fully usable - it must never block starting a checklist.
(On the local harness this action 500s upstream - findings FIND-002; test history against
whichever backend has the fix.)

### BLOCK-009 - Agent starts a checklist

**Steps:** As `USER-AGENT`, block detail → Start checklist.

**Expected:** The broker mints a token and the same wizard opens (WIZ-001 applies from here). An
agent whose assignment was just removed gets a readable refusal, not a raw error, and no wizard.

### BLOCK-010 - Staff self-dispatch

**Steps:** As `USER-STAFF`, block detail → Start checklist.

**Expected:** A `fire_visits` row is created under RLS (verify in Studio: status `dispatched`,
only a token **hash** stored, inspector name/email prefilled from the account) and the wizard
opens on a token indistinguishable from a sent link. A staff member without rights on that block
gets "You don't have access to that block..." - never PostgREST's row-level-security wording.

### BLOCK-011 - The list updates after a submit

**Steps:** From either persona: start a checklist, submit it, return to the dashboard and the
block's history.

**Expected:** Without waiting for a stale-time refresh: the completed check is no longer due (or
its due date moved on), and the new visit appears in history. N/A verdicts left the cadence
unmoved (WIZ-006).

### BLOCK-012 - Plan visits is staff-only

**Steps:** As staff, tap Plan visits; as agent, reach `/(app)/plan` directly.

**Expected:** Staff get rounds of nearby due blocks in drive order, worst first; every row opens
its block; nothing is persisted (leaving and returning replans). Agents get the "A staff tool"
note - no crash, no empty screen. A dashboard refresh that changes a block's urgency replans
rather than keeping yesterday's rounds.

### BLOCK-013 - Report from a block

**Steps:** Block detail → the report button.

**Expected:** The report form opens with the block fixed (no picker), and the sent report names
that block. Full report behaviour: REPORT suite.
