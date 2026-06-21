DROP POLICY IF EXISTS "Team can read admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Team can insert admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Team can update admin state" ON public.admin_state;

CREATE POLICY "Team can read admin state"
  ON public.admin_state FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'ceo'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'user'::app_role)
  );

CREATE POLICY "Team can insert admin state"
  ON public.admin_state FOR INSERT
  TO authenticated
  WITH CHECK (
    id = 'singleton'
    AND (
      has_role(auth.uid(), 'ceo'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'user'::app_role)
    )
  );

CREATE POLICY "Team can update admin state"
  ON public.admin_state FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'ceo'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'user'::app_role)
  )
  WITH CHECK (
    id = 'singleton'
    AND (
      has_role(auth.uid(), 'ceo'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'user'::app_role)
    )
  );