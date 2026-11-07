CREATE OR REPLACE FUNCTION public.drain_outreach_scheduler() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jid bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM public.enrollments WHERE status IN ('queued','active')) OR EXISTS(SELECT 1 FROM public.scan_jobs WHERE status IN ('queued','running')) OR EXISTS(SELECT 1 FROM public.saved_searches WHERE schedule <> 'off') THEN RETURN false; END IF;
 IF to_regnamespace('cron') IS NOT NULL THEN
 EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = $1' INTO jid USING 'inspirova-tick';
 IF jid IS NOT NULL THEN EXECUTE 'SELECT cron.alter_job($1, active := false)' USING jid; END IF;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.drain_outreach_scheduler() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drain_outreach_scheduler() TO service_role;
CREATE OR REPLACE FUNCTION public.wake_outreach_timer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jid bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.outreach_scheduler WHERE id='singleton') OR to_regnamespace('cron') IS NULL THEN RETURN NEW; END IF;
 EXECUTE 'SELECT jobid FROM cron.job WHERE jobname=$1 AND NOT active' INTO jid USING 'inspirova-tick';
 IF jid IS NOT NULL THEN EXECUTE 'SELECT cron.alter_job($1, active := true)' USING jid; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.wake_outreach_timer() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wake_outreach_timer() TO service_role;
CREATE TRIGGER wake_outreach_enrollment AFTER INSERT OR UPDATE OF status,next_send_at ON public.enrollments FOR EACH ROW WHEN (NEW.status IN ('queued','active')) EXECUTE FUNCTION public.wake_outreach_timer();
CREATE TRIGGER wake_outreach_scan AFTER INSERT OR UPDATE OF status ON public.scan_jobs FOR EACH ROW WHEN (NEW.status IN ('queued','running')) EXECUTE FUNCTION public.wake_outreach_timer();
CREATE TRIGGER wake_outreach_search AFTER INSERT OR UPDATE OF schedule,next_run_at ON public.saved_searches FOR EACH ROW WHEN (NEW.schedule <> 'off') EXECUTE FUNCTION public.wake_outreach_timer();