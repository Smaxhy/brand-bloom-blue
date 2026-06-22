
DROP POLICY IF EXISTS "Users read own admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Users insert own admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Users update own admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Users delete own admin state" ON public.admin_state;

CREATE POLICY "Admins read own admin state"
  ON public.admin_state FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert own admin state"
  ON public.admin_state FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update own admin state"
  ON public.admin_state FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete own admin state"
  ON public.admin_state FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));
