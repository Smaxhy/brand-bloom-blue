alter table public.saved_searches
  add column if not exists filters jsonb not null default '{}'::jsonb;