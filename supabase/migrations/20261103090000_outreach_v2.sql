-- Outreach v2: lead scoring, reply intelligence, saved searches, A/B subjects, rate limits.

-- ---------------------------------------------------------------- scoring
alter table public.leads add column if not exists score int not null default 0;
alter table public.leads add column if not exists score_reasons text[] not null default '{}';
alter table public.leads add column if not exists signals jsonb not null default '{}'::jsonb;
create index if not exists leads_score_idx on public.leads (score desc);

-- ------------------------------------------------------- reply intelligence
alter table public.messages add column if not exists body_text text;
alter table public.messages add column if not exists intent text check (intent in ('interested','later','question','not_interested','wrong_person','auto','unknown'));
alter table public.messages add column if not exists draft_reply text;
alter table public.messages add column if not exists handled_at timestamptz;
alter table public.messages add column if not exists from_header text;
-- server writes replies back out through a mailbox; the team may mark a reply handled
create policy "Team updates messages" on public.messages for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

-- -------------------------------------------------------------- A/B subjects
alter table public.sequence_steps add column if not exists subject_b text not null default '';
alter table public.enrollments add column if not exists variant text not null default 'A' check (variant in ('A','B'));
alter table public.messages add column if not exists variant text;

-- ------------------------------------------------------------ saved searches
create table if not exists public.saved_searches (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  location          text not null,
  industry          text not null default '',
  per_page          int  not null default 25,
  providers         text[] not null default '{places,serper,osm}',
  geo               jsonb,                       -- {lat,lng,bbox}
  region            text not null default 'US' check (region in ('US','EU')),
  min_score         int  not null default 40,
  auto_enroll_sequence_id uuid references public.sequences(id) on delete set null,
  schedule          text not null default 'weekly' check (schedule in ('off','daily','weekly')),
  next_run_at       timestamptz,
  last_run_at       timestamptz,
  last_result       jsonb not null default '{}'::jsonb,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.saved_searches enable row level security;
create policy "Team manages saved searches" on public.saved_searches for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
create trigger saved_searches_touch before update on public.saved_searches for each row execute function public.touch_updated_at();

-- businesses a saved search has already seen (so re-runs only surface new ones)
create table if not exists public.search_seen (
  search_id   uuid not null references public.saved_searches(id) on delete cascade,
  key         text not null,                    -- domain, or lowercased name|phone
  company     text not null default '',
  created_at  timestamptz not null default now(),
  primary key (search_id, key)
);
alter table public.search_seen enable row level security;
create policy "Team reads search_seen" on public.search_seen for select to authenticated using (public.is_team_member(auth.uid()));

-- ---------------------------------------------------------------- rate limits
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        int not null default 0
);
alter table public.rate_limits enable row level security; -- service role only

create or replace function public.check_rate_limit(_key text, _max int, _window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur record;
begin
  select * into cur from public.rate_limits where key = _key for update;
  if cur is null or cur.window_start < now() - make_interval(secs => _window_seconds) then
    insert into public.rate_limits (key, window_start, count) values (_key, now(), 1)
      on conflict (key) do update set window_start = now(), count = 1;
    return true;
  end if;
  if cur.count >= _max then
    return false;
  end if;
  update public.rate_limits set count = count + 1 where key = _key;
  return true;
end;
$$;
revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
