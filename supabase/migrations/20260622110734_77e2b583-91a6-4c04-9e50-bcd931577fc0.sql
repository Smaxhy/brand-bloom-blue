DROP POLICY IF EXISTS "Admins read own admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Admins insert own admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Admins update own admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Admins delete own admin state" ON public.admin_state;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;

CREATE POLICY "Admins read own admin state"
  ON public.admin_state FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
    )
  );

CREATE POLICY "Admins insert own admin state"
  ON public.admin_state FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
    )
  );

CREATE POLICY "Admins update own admin state"
  ON public.admin_state FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
    )
  );

CREATE POLICY "Admins delete own admin state"
  ON public.admin_state FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::app_role, 'ceo'::app_role)
    )
  );