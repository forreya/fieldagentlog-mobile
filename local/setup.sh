#!/usr/bin/env bash
# Stand up a local BalanceBuddy to test the signed-in half of the app against.
#
# This script exists because the first version of this harness lived in a temp
# directory and did not survive a reboot. Everything it needs is either here or
# copied from balancebuddy-web at run time - nothing is hand-maintained, so it
# cannot drift from production the way the last one did (its `organizations`
# was missing `slug`, and local tests passed that production would have failed).
#
# balancebuddy-web is READ ONLY. We copy out of it and never write to it.
#
# Usage:  ./local/setup.sh          from the repo root
#         ./local/setup.sh --reset  wipe the database and re-seed

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BB="${BB_WEB:-$HERE/../../../balancebuddy-web}"
STACK="$HERE/stack"

[ -d "$BB/supabase/migrations" ] || { echo "balancebuddy-web not found at $BB - set BB_WEB"; exit 1; }

# Real migrations, taken verbatim. Only these: the repo has 31 duplicate version
# prefixes and at least one migration (0047) that cannot replay from empty, so a
# full replay is not an option. See docs/local-backend.md.
#
#   0001/0002  organizations, blocks, members, RLS helpers. Previously stubbed
#              by hand, which is exactly how the schema drifted.
#   0006/0045  blocks.deleted_at and the structured address columns. The
#              field-agent broker selects address_line_1/town/postcode and
#              filters on deleted_at; without them its blocks query fails and
#              returns an empty list while the checks come back fine, so the
#              dashboard shows "no blocks" with no error anywhere.
#   0178-0182  the fire-safety tables under test
#   0219       cleaner attendance: adds fire_visits.scope and the
#              block_fire_checks.cleaner_assignable that visit-packet selects
#   0237       field_agent_assignments
MIGRATIONS=(
  0001_init
  0002_rls_base
  0006_block_soft_delete
  0045_blocks_structured_address
  0178_block_fire_profile
  0179_fire_check_catalogue
  0180_block_fire_checks
  0181_fire_visits
  0182_fire_safety_defects
  0219_cleaner_attendance
  0237_field_agent_assignments
)

FUNCTIONS=(_shared field-agent cleaner visit-packet visit-photo visit-submit)

if [ "${1:-}" = "--reset" ] && [ -d "$STACK" ]; then
  ( cd "$STACK" && npx --yes supabase@latest db reset )
  "$HERE/seed.sh"
  exit 0
fi

mkdir -p "$STACK"
cd "$STACK"
[ -f supabase/config.toml ] || npx --yes supabase@latest init --force

mkdir -p supabase/migrations supabase/functions
# This script owns the contents of the migrations directory. Anything else that
# lands in there - a stray copy, an experiment - would apply silently on the
# next reset and put the local schema somewhere no one can reproduce.
rm -f supabase/migrations/*.sql
for m in "${MIGRATIONS[@]}"; do
  cp "$BB/supabase/migrations/$m.sql" "supabase/migrations/$m.sql"
done
cp "$HERE/stubs.sql" "supabase/migrations/0177_local_stubs.sql"
cp "$HERE/grants.sql" "supabase/migrations/9999_grants.sql"

for f in "${FUNCTIONS[@]}"; do
  [ -d "$BB/supabase/functions/$f" ] && cp -R "$BB/supabase/functions/$f" supabase/functions/
done

# Production sets verify_jwt:false on the visit functions because the inspector
# has no account and the per-visit token IS the credential. Without this the
# gateway rejects them before they run, and the wizard dies on a 401.
for fn in visit-packet visit-photo visit-submit; do
  grep -q "\[functions.$fn\]" supabase/config.toml || printf '\n[functions.%s]\nverify_jwt = false\n' "$fn" >> supabase/config.toml
done

npx --yes supabase@latest start
"$HERE/seed.sh"
