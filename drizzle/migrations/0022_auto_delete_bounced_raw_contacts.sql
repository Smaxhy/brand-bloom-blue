-- Hard-bounced (and confirmed-invalid) addresses are removed from every
-- account's saved Raw Data contacts automatically. Only the Raw Data row goes:
-- the suppression (do-not-email) row, leads, enrollments and sent history stay,
-- so the address can never be emailed again even if a scrape finds it later.

-- The account's data with every Raw Data row whose email is bounce-suppressed removed.
CREATE OR REPLACE FUNCTION public.without_bounced_raw_contacts(_data jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(_data -> 'raw') IS DISTINCT FROM 'array' THEN _data
    ELSE jsonb_set(_data, '{raw}', coalesce((
      SELECT jsonb_agg(r ORDER BY ord)
      FROM jsonb_array_elements(_data -> 'raw') WITH ORDINALITY AS t(r, ord)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.suppressions s
        WHERE s.reason = 'bounce'
          AND s.email IS NOT NULL
          AND lower(s.email) = lower(btrim(regexp_replace(coalesce(r ->> 'email', ''), '^mailto:', '', 'i')))
      )
    ), '[]'::jsonb))
  END
$$;
REVOKE ALL ON FUNCTION public.without_bounced_raw_contacts(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.without_bounced_raw_contacts(jsonb) TO service_role;

-- Every save drops bounced rows, so an open tab holding an older copy can't put
-- them back. When something was removed the row gets a fresh stamp, so the
-- saving tab doesn't ignore the change as its own echo and shows the cleaned list.
CREATE OR REPLACE FUNCTION public.strip_bounced_raw_contacts_on_save()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cleaned jsonb;
BEGIN
  cleaned := public.without_bounced_raw_contacts(NEW.data);
  IF cleaned IS DISTINCT FROM NEW.data THEN
    NEW.data := cleaned;
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.strip_bounced_raw_contacts_on_save() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.strip_bounced_raw_contacts_on_save() TO service_role;
DROP TRIGGER IF EXISTS strip_bounced_raw_contacts_on_save ON public.admin_state;
CREATE TRIGGER strip_bounced_raw_contacts_on_save
  BEFORE INSERT OR UPDATE OF data ON public.admin_state
  FOR EACH ROW EXECUTE FUNCTION public.strip_bounced_raw_contacts_on_save();

-- The moment an address is suppressed as a bounce (found by the background
-- sender/inbox check, a provider rejection, or a failed verification), remove
-- it from every account's Raw Data — no admin tab needs to be open.
CREATE OR REPLACE FUNCTION public.delete_bounced_raw_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE address text := lower(btrim(NEW.email));
BEGIN
  IF address IS NULL OR address = '' THEN
    RETURN NEW;
  END IF;
  UPDATE public.admin_state a
  SET data = public.without_bounced_raw_contacts(a.data), updated_at = clock_timestamp()
  WHERE jsonb_typeof(a.data -> 'raw') = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(a.data -> 'raw') r
      WHERE lower(btrim(regexp_replace(coalesce(r ->> 'email', ''), '^mailto:', '', 'i'))) = address
    );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_bounced_raw_contacts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_bounced_raw_contacts() TO service_role;
DROP TRIGGER IF EXISTS delete_bounced_raw_contacts ON public.suppressions;
CREATE TRIGGER delete_bounced_raw_contacts
  AFTER INSERT OR UPDATE OF reason, email ON public.suppressions
  FOR EACH ROW WHEN (NEW.reason = 'bounce' AND NEW.email IS NOT NULL)
  EXECUTE FUNCTION public.delete_bounced_raw_contacts();

-- One-time cleanup of addresses that bounced before this update.
UPDATE public.admin_state
SET data = public.without_bounced_raw_contacts(data), updated_at = clock_timestamp()
WHERE public.without_bounced_raw_contacts(data) IS DISTINCT FROM data;
