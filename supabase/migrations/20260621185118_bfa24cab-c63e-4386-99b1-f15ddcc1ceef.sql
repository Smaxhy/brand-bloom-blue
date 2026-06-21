
DROP POLICY IF EXISTS "Admins can read admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Admins can insert admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Admins can update admin state" ON public.admin_state;

CREATE POLICY "Team can read admin state"
ON public.admin_state FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'ceo'::public.app_role));

CREATE POLICY "Team can insert admin state"
ON public.admin_state FOR INSERT TO authenticated
WITH CHECK (id = 'singleton' AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'ceo'::public.app_role)));

CREATE POLICY "Team can update admin state"
ON public.admin_state FOR UPDATE TO authenticated
USING (id = 'singleton' AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'ceo'::public.app_role)))
WITH CHECK (id = 'singleton' AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'ceo'::public.app_role)));

DROP POLICY IF EXISTS "Admins can subscribe to admin_state channel" ON realtime.messages;
CREATE POLICY "Team can subscribe to admin_state channel"
ON realtime.messages FOR SELECT TO authenticated
USING (realtime.topic() = 'admin_state_changes' AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'ceo'::public.app_role)));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
