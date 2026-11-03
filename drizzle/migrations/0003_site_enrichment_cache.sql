CREATE TABLE IF NOT EXISTS public.site_cache (
  domain text PRIMARY KEY,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.site_cache TO service_role;
REVOKE ALL ON public.site_cache FROM anon, authenticated;
ALTER TABLE public.site_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS site_cache_fetched_idx ON public.site_cache (fetched_at);
COMMENT ON TABLE public.site_cache IS 'Server-only cache of publicly extracted business website information; no browser access.';