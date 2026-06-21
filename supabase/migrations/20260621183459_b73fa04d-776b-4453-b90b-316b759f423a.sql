-- 1) Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2) Security-definer role checker (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3) Lock down admin_state to authenticated admins only
DROP POLICY IF EXISTS "Anyone can read admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Anyone can insert admin state" ON public.admin_state;
DROP POLICY IF EXISTS "Anyone can update admin state" ON public.admin_state;

REVOKE ALL ON public.admin_state FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.admin_state TO authenticated;

CREATE POLICY "Admins can read admin state"
  ON public.admin_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert admin state"
  ON public.admin_state FOR INSERT
  TO authenticated
  WITH CHECK (id = 'singleton' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update admin state"
  ON public.admin_state FOR UPDATE
  TO authenticated
  USING (id = 'singleton' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = 'singleton' AND public.has_role(auth.uid(), 'admin'));

-- 4) Restrict Realtime: only admins may subscribe, and only to the admin channel
CREATE POLICY "Admins can subscribe to admin_state channel"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'admin_state_changes'
    AND public.has_role(auth.uid(), 'admin')
  );