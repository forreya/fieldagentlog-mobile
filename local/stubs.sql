-- The one table the fire migrations reference that we do not want to pull in.
--
-- 0182_fire_safety_defects has an FK to work_orders (0120), the "promote a
-- defect into a tracked repair" link. Taking the real 0120 would drag in
-- block_fire_assets and fra_actions, and those drag in more again - a long tail
-- of tables this app never touches.
--
-- So work_orders exists here only as an FK target. It is deliberately minimal
-- and deliberately NOT the real shape: nothing in FieldAgentLog reads or writes
-- it, and if that ever changes, this stub should be replaced by the real
-- migration chain rather than grown a column at a time.

CREATE TABLE IF NOT EXISTS public.work_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  block_id        uuid REFERENCES public.blocks(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
