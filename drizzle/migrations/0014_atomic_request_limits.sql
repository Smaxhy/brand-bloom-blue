CREATE OR REPLACE FUNCTION public.check_rate_limit(_key text, _max integer, _window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE used integer;
BEGIN
  IF _key IS NULL OR length(_key) > 200 OR _max < 1 OR _max > 10000 OR _window_seconds < 1 OR _window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid request limit';
  END IF;
  INSERT INTO public.rate_limits AS limits (key, window_start, count)
  VALUES (_key, clock_timestamp(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE WHEN limits.window_start <= clock_timestamp() - make_interval(secs => _window_seconds) THEN clock_timestamp() ELSE limits.window_start END,
    count = CASE WHEN limits.window_start <= clock_timestamp() - make_interval(secs => _window_seconds) THEN 1 ELSE LEAST(limits.count + 1, _max + 1) END
  RETURNING count INTO used;
  RETURN used <= _max;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
GRANT ALL ON public.rate_limits TO service_role;