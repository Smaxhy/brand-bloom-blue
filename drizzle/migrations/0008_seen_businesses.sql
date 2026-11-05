-- Global memory of every business any scan has returned, so repeat searches surface NEW businesses instead of the same top 60 again.
create table if not exists public.seen_businesses (
  key           text primary key,
  company       text not null default '',
  domain        text,
  city          text not null default '',
  industry      text not null default '',
  times_seen    int  not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists seen_businesses_last_idx on public.seen_businesses (last_seen_at);
grant select, delete on public.seen_businesses to authenticated;
grant all on public.seen_businesses to service_role;
alter table public.seen_businesses enable row level security;
create policy "Team reads seen" on public.seen_businesses for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Team deletes seen" on public.seen_businesses for delete to authenticated using (public.is_team_member(auth.uid()));