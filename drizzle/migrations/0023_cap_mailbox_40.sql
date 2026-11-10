UPDATE public.mailboxes SET daily_cap = 40 WHERE daily_cap > 40;
ALTER TABLE public.mailboxes ALTER COLUMN daily_cap SET DEFAULT 40;
ALTER TABLE public.mailboxes ADD CONSTRAINT mailboxes_daily_cap_max_40 CHECK (daily_cap BETWEEN 1 AND 40);