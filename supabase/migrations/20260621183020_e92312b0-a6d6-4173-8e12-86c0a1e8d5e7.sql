CREATE TABLE public.admin_state (
  id text PRIMARY KEY DEFAULT 'singleton',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.admin_state TO anon, authenticated;
GRANT ALL ON public.admin_state TO service_role;

ALTER TABLE public.admin_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read admin state"
  ON public.admin_state FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert admin state"
  ON public.admin_state FOR INSERT
  WITH CHECK (id = 'singleton');

CREATE POLICY "Anyone can update admin state"
  ON public.admin_state FOR UPDATE
  USING (id = 'singleton')
  WITH CHECK (id = 'singleton');

INSERT INTO public.admin_state (id, data) VALUES ('singleton', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_state;