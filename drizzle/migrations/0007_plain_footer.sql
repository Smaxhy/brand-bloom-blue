alter table public.outreach_settings
  add column if not exists footer_style text not null default 'sentence'
    check (footer_style in ('sentence','block')),
  add column if not exists plain_text boolean not null default true,
  add column if not exists optout_line_us text not null default
    'If this isn''t relevant, just reply "no" and I won''t write again.',
  add column if not exists optout_line_eu text not null default
    'Niet relevant? Antwoord gewoon "nee" en ik mail je niet meer.';