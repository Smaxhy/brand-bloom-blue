-- Removing a person from a sequence, or deleting a sequence, must never erase
-- what was already sent: the 90-day "already emailed" check that stops a person
-- or company being contacted again reads this log. Keep the message rows and
-- only drop their link to the removed enrollment.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.messages'::regclass
      AND con.contype = 'f'
      AND con.confrelid = 'public.enrollments'::regclass
      AND att.attname = 'enrollment_id'
  LOOP
    EXECUTE format('ALTER TABLE public.messages DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.messages ADD CONSTRAINT messages_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE SET NULL;

-- "Delete sequence" hides the sequence and stops its people instead of erasing
-- them, so their sent history keeps blocking overlapping outreach from another
-- sequence. Runs as the caller: the existing team-only row policies apply.
CREATE OR REPLACE FUNCTION public.delete_sequence_keep_history(_sequence_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE stopped integer := 0;
BEGIN
  PERFORM 1 FROM public.sequences WHERE id = _sequence_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sequence not found' USING ERRCODE = 'P0002';
  END IF;

  -- Archived sequences are never dispatched, listed or auto-enrolled into.
  UPDATE public.sequences SET status = 'archived' WHERE id = _sequence_id;

  -- A send that may already have gone out keeps its "possibly sent" hold, so
  -- the person still can't be started elsewhere until someone checks.
  UPDATE public.enrollments
  SET status = 'failed',
      last_error = CASE WHEN last_error LIKE 'Possibly sent%' THEN last_error
                        ELSE 'Possibly sent already — the sequence was deleted during ' || last_error END
  WHERE sequence_id = _sequence_id
    AND status IN ('queued', 'active', 'paused')
    AND (last_error LIKE 'Possibly sent%' OR last_error LIKE 'sending step %');

  UPDATE public.enrollments
  SET status = 'skipped', last_error = 'Stopped: the sequence was deleted'
  WHERE sequence_id = _sequence_id AND status IN ('queued', 'active', 'paused');
  GET DIAGNOSTICS stopped = ROW_COUNT;

  UPDATE public.saved_searches SET auto_enroll_sequence_id = NULL WHERE auto_enroll_sequence_id = _sequence_id;
  RETURN stopped;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_sequence_keep_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_sequence_keep_history(uuid) TO authenticated, service_role;
