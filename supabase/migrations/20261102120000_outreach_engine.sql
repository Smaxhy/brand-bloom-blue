-- Outreach engine: real tables for leads, mailboxes, sequences and sending.
-- Team-scoped (admin + ceo), matching admin_state. Mailbox OAuth tokens live in
-- a separate table that only the service role (the Cloudflare Worker) can read.

create or replace function public.is_team_member(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_uid, 'admin'::public.app_role)
      or public.has_role(_uid, 'ceo'::public.app_role);
$$;
revoke execute on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- mailboxes
create table public.mailboxes (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  display_name  text not null default '',
  provider      text not null default 'google' check (provider in ('google')),
  status        text not null default 'active' check (status in ('active','paused','error')),
  daily_cap     int  not null default 30,
  timezone      text not null default 'America/Denver',
  window_start  int  not null default 8,   -- local hour, inclusive
  window_end    int  not null default 17,  -- local hour, exclusive
  send_days     int[] not null default '{1,2,3,4,5}', -- 0=Sun … 6=Sat
  signature     text not null default '',
  last_error    text,
  last_sync_at  timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.mailboxes enable row level security;
create policy "Team reads mailboxes" on public.mailboxes for select to authenticated using (public.is_team_member(auth.uid()));
create policy "Team updates mailboxes" on public.mailboxes for update to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
create policy "Team deletes mailboxes" on public.mailboxes for delete to authenticated using (public.is_team_member(auth.uid()));
-- inserts happen server-side (OAuth callback) via service role only

create table public.mailbox_tokens (
  mailbox_id    uuid primary key references public.mailboxes(id) on delete cascade,
  refresh_token text not null,
  access_token  text,
  expires_at    timestamptz,
  scope         text,
  updated_at    timestamptz not null default now()
);
alter table public.mailbox_tokens enable row level security;
-- no policies: service role only

-- -------------------------------------------------------------------- leads
create table public.leads (
  id             uuid primary key default gen_random_uuid(),
  company        text not null default '',
  domain         text,
  website        text,
  contact_name   text not null default '',
  contact_title  text not null default '',
  email          text,
  email_source   text not null default '',   -- Website | Guess | Apollo | Hunter | Google | Manual
  email_guessed  boolean not null default false,
  email_verified text not null default 'unknown' check (email_verified in ('unknown','mx_ok','valid','invalid','risky')),
  phone          text not null default '',
  linkedin       text not null default '',
  city           text not null default '',
  region         text not null default 'US' check (region in ('US','EU')),
  industry       text not null default '',
  source         text not null default '',
  place_id       text,
  status         text not null default 'new' check (status in ('new','accepted','rejected','customer')),
  notes          text not null default '',
  raw_id         text,                        -- id of the row in the old admin_state blob, for de-dupe
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index leads_email_unique on public.leads (lower(email)) where email is not null and email <> '';
create index leads_domain_idx on public.leads (domain);
create index leads_status_idx on public.leads (status);
alter table public.leads enable row level security;
create policy "Team manages leads" on public.leads for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

-- ------------------------------------------------------------- suppressions
create table public.suppressions (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  domain     text,
  reason     text not null check (reason in ('unsubscribe','bounce','replied_stop','manual','complaint')),
  note       text not null default '',
  created_at timestamptz not null default now()
);
create unique index suppressions_email_unique on public.suppressions (lower(email)) where email is not null;
create index suppressions_domain_idx on public.suppressions (domain) where domain is not null;
alter table public.suppressions enable row level security;
create policy "Team manages suppressions" on public.suppressions for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

-- ---------------------------------------------------------------- sequences
create table public.sequences (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  status        text not null default 'draft' check (status in ('draft','active','paused','archived')),
  mailbox_ids   uuid[] not null default '{}',   -- round-robin across these
  stop_on_reply boolean not null default true,
  gap_min_sec   int not null default 45,
  gap_max_sec   int not null default 180,
  settings      jsonb not null default '{}'::jsonb,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.sequences enable row level security;
create policy "Team manages sequences" on public.sequences for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

create table public.sequence_steps (
  id          uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  position    int  not null,
  delay_days  int  not null default 0,        -- days after the previous step
  subject     text not null default '',       -- blank on follow-ups = reply in the same thread
  body        text not null default '',       -- plain text with {{variables}}
  unique (sequence_id, position)
);
alter table public.sequence_steps enable row level security;
create policy "Team manages steps" on public.sequence_steps for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

-- -------------------------------------------------------------- enrollments
create table public.enrollments (
  id              uuid primary key default gen_random_uuid(),
  sequence_id     uuid not null references public.sequences(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  mailbox_id      uuid references public.mailboxes(id) on delete set null,
  status          text not null default 'queued' check (status in ('queued','active','completed','replied','bounced','unsubscribed','paused','failed','skipped')),
  current_step    int  not null default 0,     -- next step position to send (0-based)
  next_send_at    timestamptz not null default now(),
  thread_id       text,                        -- Gmail threadId after the first send
  first_message_id text,                       -- RFC 822 Message-ID of step 1 (for In-Reply-To)
  unsub_token     text not null unique default encode(gen_random_bytes(18), 'hex'),
  last_error      text,
  replied_at      timestamptz,
  completed_at    timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (sequence_id, lead_id)
);
create index enrollments_due_idx on public.enrollments (status, next_send_at);
create index enrollments_thread_idx on public.enrollments (thread_id) where thread_id is not null;
alter table public.enrollments enable row level security;
create policy "Team manages enrollments" on public.enrollments for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

-- ----------------------------------------------------------------- messages
create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  enrollment_id    uuid references public.enrollments(id) on delete cascade,
  lead_id          uuid references public.leads(id) on delete cascade,
  mailbox_id       uuid references public.mailboxes(id) on delete set null,
  direction        text not null check (direction in ('out','in')),
  step_position    int,
  gmail_message_id text,
  gmail_thread_id  text,
  rfc_message_id   text,
  subject          text not null default '',
  snippet          text not null default '',
  kind             text not null default 'email' check (kind in ('email','reply','bounce','auto_reply')),
  status           text not null default 'sent' check (status in ('sent','failed','received')),
  error            text,
  sent_at          timestamptz not null default now()
);
create index messages_mailbox_day_idx on public.messages (mailbox_id, direction, sent_at);
create index messages_enrollment_idx on public.messages (enrollment_id);
create unique index messages_gmail_id_unique on public.messages (gmail_message_id) where gmail_message_id is not null;
alter table public.messages enable row level security;
create policy "Team reads messages" on public.messages for select to authenticated using (public.is_team_member(auth.uid()));

-- ---------------------------------------------------------- account settings
-- Sender identity required by CAN-SPAM / GDPR footers. One row for the team.
create table public.outreach_settings (
  id              text primary key default 'singleton' check (id = 'singleton'),
  company_name    text not null default 'Inspirova Marketing',
  postal_address  text not null default '',
  website         text not null default '',
  eu_notice       text not null default 'You are receiving this because your company is publicly listed as a local business and we believe our services may be relevant to it. Reply with "unsubscribe" or use the link below and we will not contact you again.',
  us_notice       text not null default 'You are receiving this one-time business message because your company is publicly listed. Use the link below to opt out at any time.',
  updated_at      timestamptz not null default now()
);
alter table public.outreach_settings enable row level security;
create policy "Team manages outreach settings" on public.outreach_settings for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));
insert into public.outreach_settings (id) values ('singleton') on conflict do nothing;

-- updated_at triggers
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger mailboxes_touch   before update on public.mailboxes   for each row execute function public.touch_updated_at();
create trigger leads_touch       before update on public.leads       for each row execute function public.touch_updated_at();
create trigger sequences_touch   before update on public.sequences   for each row execute function public.touch_updated_at();
create trigger enrollments_touch before update on public.enrollments for each row execute function public.touch_updated_at();
