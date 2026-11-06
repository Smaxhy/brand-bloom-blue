CREATE TABLE public.scan_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL,
 label text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','cancelled')),
 options jsonb NOT NULL DEFAULT '{}', people jsonb NOT NULL DEFAULT '[]', results jsonb NOT NULL DEFAULT '{}',
 cursor int NOT NULL DEFAULT 0 CHECK (cursor >= 0), total int NOT NULL DEFAULT 0 CHECK (total BETWEEN 0 AND 2000),
 warnings text[] NOT NULL DEFAULT '{}', last_error text, lease_until timestamptz, lease_token uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
GRANT SELECT ON public.scan_jobs TO authenticated;
GRANT ALL ON public.scan_jobs TO service_role;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their scan jobs" ON public.scan_jobs FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE INDEX scan_jobs_status_idx ON public.scan_jobs(status,updated_at);
CREATE INDEX scan_jobs_owner_idx ON public.scan_jobs(created_by,created_at DESC);