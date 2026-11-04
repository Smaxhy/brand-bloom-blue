-- 1) Inbound leads from the public website check (and future forms).
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check
  check (status in ('new','accepted','rejected','customer','inbound'));

-- 2) Make "upsert on email" actually work.
-- The original schema only had a unique index on lower(email); Postgres cannot
-- use an expression index for ON CONFLICT (email), so upserts errored.
-- Normalise existing rows, then add a real unique constraint on the column.
update public.leads set email = null where email = '';
update public.leads set email = lower(email) where email <> lower(email);
-- Collapse any case-duplicates that may exist (keep the oldest row).
delete from public.leads a using public.leads b
  where a.email is not null and a.email = b.email and a.created_at > b.created_at;
drop index if exists public.leads_email_unique;
alter table public.leads drop constraint if exists leads_email_key;
alter table public.leads add constraint leads_email_key unique (email);
alter table public.leads drop constraint if exists leads_email_not_blank;
alter table public.leads add constraint leads_email_not_blank check (email is null or email <> '');
