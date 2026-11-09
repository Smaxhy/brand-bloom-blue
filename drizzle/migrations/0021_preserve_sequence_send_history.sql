DO $$ DECLARE c record; BEGIN FOR c IN SELECT con.conname FROM pg_constraint con JOIN pg_attribute att ON att.attrelid=con.conrelid AND att.attnum=ANY(con.conkey) WHERE con.conrelid='public.messages'::regclass AND con.contype='f' AND con.confrelid='public.enrollments'::regclass AND att.attname='enrollment_id' LOOP EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I',c.conname); END LOOP; END $$;
ALTER TABLE public.messages ADD CONSTRAINT messages_enrollment_id_fkey FOREIGN KEY(enrollment_id) REFERENCES public.enrollments(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.delete_sequence_keep_history(_sequence_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ DECLARE stopped integer:=0; BEGIN
PERFORM 1 FROM public.sequences WHERE id=_sequence_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Sequence not found' USING ERRCODE='P0002'; END IF;
UPDATE public.sequences SET status='archived' WHERE id=_sequence_id;
UPDATE public.enrollments SET status='failed',last_error=CASE WHEN last_error LIKE 'Possibly sent%' THEN last_error ELSE 'Possibly sent already — the sequence was deleted during ' || last_error END WHERE sequence_id=_sequence_id AND status IN ('queued','active','paused') AND (last_error LIKE 'Possibly sent%' OR last_error LIKE 'sending step %');
UPDATE public.enrollments SET status='skipped',last_error='Stopped: the sequence was deleted' WHERE sequence_id=_sequence_id AND status IN ('queued','active','paused'); GET DIAGNOSTICS stopped=ROW_COUNT;
UPDATE public.saved_searches SET auto_enroll_sequence_id=NULL WHERE auto_enroll_sequence_id=_sequence_id;
RETURN stopped; END $$;
REVOKE EXECUTE ON FUNCTION public.delete_sequence_keep_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_sequence_keep_history(uuid) TO authenticated,service_role;