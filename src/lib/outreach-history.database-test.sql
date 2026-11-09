-- Transactional regression test: no provider calls; all synthetic records roll back.
BEGIN;
INSERT INTO public.leads(id,company,email) VALUES('00000000-0000-4000-8000-000000000901','Migration test','history-test@example.invalid');
INSERT INTO public.sequences(id,name,status) VALUES('00000000-0000-4000-8000-000000000902','Migration test','paused');
INSERT INTO public.enrollments(id,sequence_id,lead_id,status) VALUES('00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000902','00000000-0000-4000-8000-000000000901','paused');
INSERT INTO public.messages(id,enrollment_id,lead_id,direction,status) VALUES('00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000901','out','sent');
SELECT public.delete_sequence_keep_history('00000000-0000-4000-8000-000000000902');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sequences WHERE id='00000000-0000-4000-8000-000000000902' AND status='archived') THEN RAISE EXCEPTION 'Sequence not archived'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.enrollments WHERE id='00000000-0000-4000-8000-000000000903' AND status='skipped') THEN RAISE EXCEPTION 'Enrollment not stopped'; END IF;
END $$;
DELETE FROM public.enrollments WHERE id='00000000-0000-4000-8000-000000000903';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.messages WHERE id='00000000-0000-4000-8000-000000000904' AND enrollment_id IS NULL AND status='sent') THEN RAISE EXCEPTION 'Sent history was erased'; END IF;
END $$;
INSERT INTO public.suppressions(email,reason) VALUES('bounce-test@example.invalid','bounce'),('optout-test@example.invalid','unsubscribe');
DO $$ DECLARE cleaned jsonb; BEGIN
 cleaned:=public.without_bounced_raw_contacts('{"raw":[{"id":"broken","email":"MAILTO:Bounce-Test@Example.Invalid"},{"id":"optout","email":"optout-test@example.invalid"},{"id":"healthy","email":"good@example.invalid"}]}'::jsonb);
 IF jsonb_array_length(cleaned -> 'raw')<>2 OR cleaned #>> '{raw,0,id}'<>'optout' OR cleaned #>> '{raw,1,id}'<>'healthy' THEN RAISE EXCEPTION 'Bounce cleanup removed wrong records'; END IF;
END $$;
ROLLBACK;