-- Drop old singleton-based policies
DROP POLICY IF EXISTS "Team can read admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Team can insert admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Team can update admin state" ON public.admin_state;

-- Wipe the old singleton blob (it mixed everyone's data together)
DELETE FROM public.admin_state;

-- Restructure: one row per user account
ALTER TABLE public.admin_state DROP CONSTRAINT IF EXISTS admin_state_pkey;
ALTER TABLE public.admin_state ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.admin_state ALTER COLUMN id DROP NOT NULL;
ALTER TABLE public.admin_state DROP COLUMN IF EXISTS id;

ALTER TABLE public.admin_state
  ADD COLUMN user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE;

-- New per-account RLS: each account only sees its own row
CREATE POLICY "Users read own admin state"
  ON public.admin_state FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own admin state"
  ON public.admin_state FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own admin state"
  ON public.admin_state FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own admin state"
  ON public.admin_state FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());