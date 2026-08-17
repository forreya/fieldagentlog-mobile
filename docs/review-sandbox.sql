-- Review sandbox for the App Store and Play reviewers.
--
-- Creates one organisation of invented blocks and points the review account at
-- them, so a reviewer working through the app writes to fake buildings instead
-- of a real block's fire logbook. Everything is named "ZZ REVIEW" so it sorts
-- last and nobody mistakes it for a client.
--
-- Run it in the Supabase SQL editor for project etkiptvblskvyfzdbsic. Dry-run against a
-- local copy of the schema on 2026-08-17: 3 blocks, 6 checks, 3 assignments, and
-- clean on a second run.
-- Idempotent: re-running resets the due dates and changes nothing else.
--
-- BEFORE RUNNING: create the auth user first, in Authentication > Users > Add
-- user. Use appreview@genapm.com, a generated password, and tick auto-confirm
-- so there is no email step for a reviewer to fail at. If you use a different
-- address, change it in the assignments statement near the bottom - it is the
-- only place it appears.

BEGIN;

-- Fixed ids so re-running is an update rather than a second copy.
INSERT INTO public.organizations (id, name, slug)
VALUES ('dddddddd-0000-4000-8000-000000000001', 'ZZ REVIEW - store review sandbox', 'zz-review-sandbox')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.blocks (id, organization_id, name, address, postcode) VALUES
  ('dddddddd-0000-4000-8000-00000000b001', 'dddddddd-0000-4000-8000-000000000001',
   'ZZ REVIEW - Sample Court',  '1 Example Street, London',  'SE5 9QQ'),
  ('dddddddd-0000-4000-8000-00000000b002', 'dddddddd-0000-4000-8000-000000000001',
   'ZZ REVIEW - Sample House',  '2 Example Road, London',    'SE15 5DT'),
  ('dddddddd-0000-4000-8000-00000000b003', 'dddddddd-0000-4000-8000-000000000001',
   'ZZ REVIEW - Sample Lodge',  '3 Example Lane, London',    'SE1 7PB')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, address = EXCLUDED.address, postcode = EXCLUDED.postcode;

-- Real postcodes, because Plan visits geocodes them through postcodes.io and an
-- invented one lands the block in "Location unknown". These three are a few km
-- apart, so the reviewer sees an actual grouped round rather than one stop.

-- A spread of overdue, due-soon and not-yet, so the list is not uniformly red
-- and every state in the UI has something to render.
INSERT INTO public.block_fire_checks
  (organization_id, block_id, catalogue_code, frequency, next_due_at, enabled)
VALUES
  ('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-00000000b001','EL_MONTHLY','monthly', CURRENT_DATE - 12, true),
  ('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-00000000b001','FD_COMMUNAL','quarterly', CURRENT_DATE - 3,  true),
  ('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-00000000b001','FA_WEEKLY','weekly',    CURRENT_DATE + 4,  true),
  ('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-00000000b002','FA_WEEKLY','weekly',    CURRENT_DATE - 6,  true),
  ('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-00000000b002','HOUSEKEEPING','monthly',CURRENT_DATE + 9,  true),
  ('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-00000000b003','EL_MONTHLY','monthly',  CURRENT_DATE - 1,  true)
ON CONFLICT (block_id, catalogue_code) DO UPDATE
  SET next_due_at = EXCLUDED.next_due_at, enabled = true, last_completed_at = NULL;

-- Point the review account at all three. Fails loudly if the auth user was not
-- created first, which is the intended behaviour: a silent no-op here would
-- hand the reviewer an empty list and earn a rejection.
INSERT INTO public.field_agent_assignments (organization_id, block_id, agent_user_id, agent_email)
SELECT 'dddddddd-0000-4000-8000-000000000001', b.id, u.id, u.email
FROM public.blocks b
CROSS JOIN (SELECT id, email FROM auth.users WHERE email = 'appreview@genapm.com') u
WHERE b.organization_id = 'dddddddd-0000-4000-8000-000000000001'
ON CONFLICT (block_id, agent_user_id) DO NOTHING;

COMMIT;

-- Check it worked. Expect 3 blocks, 6 checks, 3 assignments.
SELECT
  (SELECT count(*) FROM public.blocks WHERE organization_id = 'dddddddd-0000-4000-8000-000000000001') AS blocks,
  (SELECT count(*) FROM public.block_fire_checks WHERE organization_id = 'dddddddd-0000-4000-8000-000000000001') AS checks,
  (SELECT count(*) FROM public.field_agent_assignments WHERE organization_id = 'dddddddd-0000-4000-8000-000000000001') AS assignments;

-- To clear anything a reviewer submitted, without dropping the sandbox:
--
--   DELETE FROM public.fire_visits
--    WHERE block_id IN (SELECT id FROM public.blocks
--                        WHERE organization_id = 'dddddddd-0000-4000-8000-000000000001');
--   then re-run this script to reset the due dates.
