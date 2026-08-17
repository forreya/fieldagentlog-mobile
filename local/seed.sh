#!/usr/bin/env bash
# Seed the local stack with enough to drive every signed-in flow.
#
# Two accounts, because the whole point of the D-milestone screens is that two
# personas share them and read from different sources:
#
#   staff@example.test  / staffpass123   org member, reads PostgREST under RLS
#   agent@example.test  / fieldagent123  no org membership, broker only
#
# Four blocks: three in London a few km apart so Plan visits produces a real
# round, and one in Manchester so there is a second round to separate it from.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
PSQL=(psql "$DB" -v ON_ERROR_STOP=1 -q)

command -v psql >/dev/null || export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

ORG=11111111-1111-1111-1111-111111111111

# Accounts. Supabase hashes with bcrypt; pgcrypto is available in the local
# stack, so crypt() gives a password the Auth server will accept.
"${PSQL[@]}" <<SQL
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
VALUES
  ('22222222-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','staff@example.test',
   crypt('staffpass123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Sam Staff"}'::jsonb),
  ('22222222-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','agent@example.test',
   crypt('fieldagent123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Alex Agent"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;

-- GoTrue scans these into non-nullable Go strings. Left NULL, every sign-in
-- fails with a 500 "Database error querying schema" while auth.users looks
-- perfectly fine in psql - the columns are nullable in the schema and only the
-- server minds. Cost an hour the first time.
UPDATE auth.users
SET confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email IN ('staff@example.test','agent@example.test');

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data,
                             created_at, updated_at, last_sign_in_at)
SELECT u.id, u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email), now(), now(), now()
FROM auth.users u WHERE u.email IN ('staff@example.test','agent@example.test')
ON CONFLICT (provider_id, provider) DO NOTHING;
SQL

# Org, membership, blocks, checks.
"${PSQL[@]}" <<SQL
INSERT INTO public.organizations (id, name, slug)
VALUES ('$ORG', 'Example Property Management', 'example-pm')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES ('$ORG', '22222222-0000-4000-8000-000000000001', 'owner')
ON CONFLICT DO NOTHING;

-- The structured columns matter, not just `address`. blockAddress() composes
-- from address_line_1 / address_town / address_postcode and only falls back to
-- the freetext `address` when all three are empty - so a fixture that sets only
-- `address` and `postcode` renders a bare postcode and quietly tests a path
-- production never takes.
INSERT INTO public.blocks
  (id, organization_id, name, address, postcode, address_line_1, address_town, address_postcode) VALUES
  ('33333333-0000-4000-8000-00000000b001','$ORG','Elm Court',   '1 Elm Road, London',        'SE1 7PB',  '1 Elm Road',    'London',     'SE1 7PB'),
  ('33333333-0000-4000-8000-00000000b002','$ORG','Cedar Point', '3 Cedar Way, London',       'SE15 5DT', '3 Cedar Way',   'London',     'SE15 5DT'),
  ('33333333-0000-4000-8000-00000000b003','$ORG','Beech House', '22 Beech Lane, London',     'SE5 9QQ',  '22 Beech Lane', 'London',     'SE5 9QQ'),
  ('33333333-0000-4000-8000-00000000b004','$ORG','Oak Rise',    '40 Oak Street, Manchester', 'M14 5GT',  '40 Oak Street', 'Manchester', 'M14 5GT')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, address = EXCLUDED.address, postcode = EXCLUDED.postcode,
      address_line_1 = EXCLUDED.address_line_1, address_town = EXCLUDED.address_town,
      address_postcode = EXCLUDED.address_postcode;

-- A spread of states so no screen renders a uniform list.
INSERT INTO public.block_fire_checks
  (organization_id, block_id, catalogue_code, frequency, next_due_at, enabled)
VALUES
  ('$ORG','33333333-0000-4000-8000-00000000b001','EL_MONTHLY','monthly',  CURRENT_DATE - 15, true),
  ('$ORG','33333333-0000-4000-8000-00000000b001','FD_COMMUNAL','quarterly',CURRENT_DATE - 4,  true),
  ('$ORG','33333333-0000-4000-8000-00000000b001','FA_WEEKLY','weekly',    CURRENT_DATE + 10, true),
  ('$ORG','33333333-0000-4000-8000-00000000b002','FD_COMMUNAL','quarterly',CURRENT_DATE - 11, true),
  ('$ORG','33333333-0000-4000-8000-00000000b003','EL_MONTHLY','monthly',  CURRENT_DATE + 5,  true),
  ('$ORG','33333333-0000-4000-8000-00000000b004','FA_WEEKLY','weekly',    CURRENT_DATE - 5,  true)
ON CONFLICT (block_id, catalogue_code) DO UPDATE
  SET next_due_at = EXCLUDED.next_due_at, enabled = true, last_completed_at = NULL;

-- The agent gets two of the four. Anything else appearing in their list is a
-- scoping bug, and that is the assertion worth having a fixture for.
INSERT INTO public.field_agent_assignments (organization_id, block_id, agent_user_id, agent_email)
VALUES
  ('$ORG','33333333-0000-4000-8000-00000000b001','22222222-0000-4000-8000-000000000002','agent@example.test'),
  ('$ORG','33333333-0000-4000-8000-00000000b002','22222222-0000-4000-8000-000000000002','agent@example.test')
ON CONFLICT (block_id, agent_user_id) DO NOTHING;
SQL

"${PSQL[@]}" -c "
SELECT (SELECT count(*) FROM public.blocks)                   AS blocks,
       (SELECT count(*) FROM public.block_fire_checks)        AS checks,
       (SELECT count(*) FROM public.field_agent_assignments)  AS agent_blocks,
       (SELECT count(*) FROM auth.users)                      AS accounts;"

echo
echo "staff@example.test / staffpass123   (4 blocks, RLS)"
echo "agent@example.test / fieldagent123  (2 blocks, broker)"
