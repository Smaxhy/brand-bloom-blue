alter table public.mailboxes drop constraint if exists mailboxes_provider_check;
alter table public.mailboxes add column if not exists provider text not null default 'google';
alter table public.mailboxes add constraint mailboxes_provider_check check (provider in ('google','ghl'));
alter table public.mailbox_tokens alter column refresh_token set default '';
alter table public.mailbox_tokens add column if not exists ghl_api_key text;
alter table public.mailbox_tokens add column if not exists ghl_location_id text;
alter table public.mailbox_tokens add column if not exists ghl_company_id text;
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check check (status in ('sent','failed','received','bounced'));