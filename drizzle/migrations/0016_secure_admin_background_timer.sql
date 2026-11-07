ALTER TABLE public.outreach_settings ADD COLUMN IF NOT EXISTS last_tick_source text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivery_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_delivery_checks_idx ON public.messages(mailbox_id, delivery_checked_at, sent_at) WHERE direction = 'out' AND status = 'sent';
CREATE TABLE public.outreach_scheduler (id text PRIMARY KEY DEFAULT 'singleton', url text NOT NULL, token_hash text NOT NULL);
GRANT ALL ON public.outreach_scheduler TO service_role;
REVOKE ALL ON public.outreach_scheduler FROM anon, authenticated;
ALTER TABLE public.outreach_scheduler ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.configure_outreach_scheduler(_url text, _token text, _token_hash text, _enabled boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cmd text;
BEGIN
 IF _enabled THEN
  IF _url NOT IN ('https://inspirovamarketing.com/api/public/cron/tick','https://www.inspirovamarketing.com/api/public/cron/tick','https://brand-bloom-blue.lovable.app/api/public/cron/tick') THEN RAISE EXCEPTION 'Invalid scheduler address'; END IF;
  IF _token IS NULL OR _token !~ '^[a-f0-9]{64}$' OR _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid scheduler credentials'; END IF;
 END IF;
 IF NOT _enabled THEN DELETE FROM public.outreach_scheduler WHERE id = 'singleton'; END IF;
 IF to_regnamespace('cron') IS NULL THEN RETURN CASE WHEN _enabled THEN 'pg_cron_unavailable' ELSE 'disabled' END; END IF;
 IF _enabled AND to_regnamespace('net') IS NULL THEN RETURN 'pg_net_unavailable'; END IF;
 BEGIN EXECUTE 'SELECT cron.unschedule($1)' USING 'inspirova-tick'; EXCEPTION WHEN OTHERS THEN NULL; END;
 IF NOT _enabled THEN RETURN 'disabled'; END IF;
 cmd := format('SELECT net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb, timeout_milliseconds := 55000);', _url, 'Content-Type','application/json','x-scheduler-token',_token,'{}');
 EXECUTE 'SELECT cron.schedule($1,$2,$3)' USING 'inspirova-tick','*/5 * * * *',cmd;
 INSERT INTO public.outreach_scheduler(id,url,token_hash) VALUES ('singleton',_url,_token_hash) ON CONFLICT(id) DO UPDATE SET url=excluded.url,token_hash=excluded.token_hash;
 RETURN 'enabled';
END $$;
REVOKE ALL ON FUNCTION public.configure_outreach_scheduler(text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_outreach_scheduler(text,text,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.drain_outreach_scheduler() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.enrollments WHERE status IN ('queued','active')) OR EXISTS(SELECT 1 FROM public.scan_jobs WHERE status IN ('queued','running')) OR EXISTS(SELECT 1 FROM public.saved_searches WHERE schedule <> 'off') THEN RETURN false; END IF;
 IF to_regnamespace('cron') IS NOT NULL THEN
 BEGIN EXECUTE 'SELECT cron.unschedule($1)' USING 'inspirova-tick'; EXCEPTION WHEN OTHERS THEN NULL; END;
 END IF;
 DELETE FROM public.outreach_scheduler WHERE id='singleton';
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.drain_outreach_scheduler() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drain_outreach_scheduler() TO service_role;