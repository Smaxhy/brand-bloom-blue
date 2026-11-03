CREATE TABLE public.integration_credentials (
 name text PRIMARY KEY,
 ciphertext text NOT NULL,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_credentials TO service_role;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.integration_credentials IS 'Encrypted shared service configuration. Server-only; CEO-managed. No browser access.';