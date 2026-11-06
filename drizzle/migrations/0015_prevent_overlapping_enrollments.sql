CREATE OR REPLACE FUNCTION public.prevent_overlapping_enrollments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('queued','active','paused') THEN
    PERFORM id FROM public.leads WHERE id = NEW.lead_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.enrollments WHERE lead_id = NEW.lead_id AND id <> NEW.id AND status IN ('queued','active','paused')) THEN
      RAISE EXCEPTION 'Lead already belongs to a running or paused sequence' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_overlapping_enrollments() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enrollments_prevent_overlap BEFORE INSERT OR UPDATE OF status, lead_id ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.prevent_overlapping_enrollments();