CREATE OR REPLACE FUNCTION public.stop_blacklisted_email_enrollments() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
  UPDATE public.leads SET email_verified='invalid' WHERE lower(btrim(email))=lower(btrim(NEW.email)) AND email_verified <> 'invalid' AND NEW.reason='bounce';
  UPDATE public.enrollments e SET status=CASE WHEN NEW.reason='bounce' THEN 'bounced' ELSE 'unsubscribed' END,last_error='Address is blacklisted: ' || NEW.reason
   FROM public.leads l WHERE e.lead_id=l.id AND lower(btrim(l.email))=lower(btrim(NEW.email)) AND e.status IN ('queued','active','paused');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stop_blacklisted_email_enrollments() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stop_blacklisted_email_enrollments() TO service_role;
CREATE TRIGGER stop_blacklisted_email_enrollments AFTER INSERT ON public.suppressions FOR EACH ROW EXECUTE FUNCTION public.stop_blacklisted_email_enrollments();
CREATE OR REPLACE FUNCTION public.blacklist_invalid_lead_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' AND NEW.email_verified='invalid' THEN
  INSERT INTO public.suppressions(email,reason,note) VALUES(lower(btrim(NEW.email)),'bounce','Confirmed invalid address') ON CONFLICT DO NOTHING;
  UPDATE public.enrollments SET status='bounced',last_error='Confirmed invalid email address' WHERE lead_id=NEW.id AND status IN ('queued','active','paused');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.blacklist_invalid_lead_email() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.blacklist_invalid_lead_email() TO service_role;
CREATE TRIGGER blacklist_invalid_lead_email AFTER INSERT OR UPDATE OF email,email_verified ON public.leads FOR EACH ROW WHEN(NEW.email_verified='invalid') EXECUTE FUNCTION public.blacklist_invalid_lead_email();
CREATE OR REPLACE FUNCTION public.blacklist_bounced_enrollment_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE address text;
BEGIN
 SELECT lower(btrim(email)) INTO address FROM public.leads WHERE id=NEW.lead_id;
 IF address IS NOT NULL AND address <> '' THEN
  INSERT INTO public.suppressions(email,reason,note) VALUES(address,'bounce','Hard-bounced outreach address') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.blacklist_bounced_enrollment_email() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.blacklist_bounced_enrollment_email() TO service_role;
CREATE TRIGGER blacklist_bounced_enrollment_insert AFTER INSERT ON public.enrollments FOR EACH ROW WHEN(NEW.status='bounced') EXECUTE FUNCTION public.blacklist_bounced_enrollment_email();
CREATE TRIGGER blacklist_bounced_enrollment_update AFTER UPDATE OF status ON public.enrollments FOR EACH ROW WHEN(NEW.status='bounced' AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.blacklist_bounced_enrollment_email();