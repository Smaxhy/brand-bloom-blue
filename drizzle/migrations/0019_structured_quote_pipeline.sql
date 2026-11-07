ALTER TABLE public.contact_submissions ADD COLUMN kind text NOT NULL DEFAULT 'contact', ADD COLUMN phone text NOT NULL DEFAULT '', ADD COLUMN services jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN estimates jsonb, ADD COLUMN personal_message text NOT NULL DEFAULT '', ADD COLUMN attribution jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN request_key text;
CREATE UNIQUE INDEX contact_submissions_request_key_unique ON public.contact_submissions(request_key);
GRANT SELECT ON public.contact_submissions TO authenticated;
GRANT ALL ON public.contact_submissions TO service_role;
CREATE POLICY "Team reads website requests" ON public.contact_submissions FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));