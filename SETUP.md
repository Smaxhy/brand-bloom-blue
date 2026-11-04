# Inspirova lead engine — setup checklist

Every site and key the rebuilt system needs, in the order to do them.
Only steps 1–6 are needed to send the first email; 7–10 make it better.

| # | Site | What to do there | Secret / result | Cost |
|---|------|------------------|-----------------|------|
| 1 | [Google Workspace](https://workspace.google.com) → [admin.google.com](https://admin.google.com) | Buy 2–3 mailboxes on a **secondary domain** (e.g. `getinspirova.com`), not your main domain. Turn on 2-step verification. | The sending mailboxes | $7 / mailbox / mo |
| 2 | Your domain registrar → DNS | On the secondary domain add **SPF** `v=spf1 include:_spf.google.com ~all`, **DKIM** (admin.google.com → Apps → Gmail → Authenticate email), **DMARC** `v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>`, and Google's **MX** records. Check at [mxtoolbox.com](https://mxtoolbox.com). | Mail that lands in inboxes | $10–15 / yr |
| 3 | [Google Cloud Console](https://console.cloud.google.com) | One project. APIs & Services → Library: enable **Places API (New)** and **Gmail API**. Credentials → API key, restricted to Places API (New). OAuth consent screen → **Internal**, scopes `gmail.send`, `gmail.readonly`, `userinfo.email`. Credentials → OAuth client → Web application, redirect URI `https://<your-domain>/api/google/oauth/callback`. Attach billing (needed for the free Places allowance). | `GOOGLE_PLACES_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | $0 at normal volume |
| 4 | [console.anthropic.com](https://console.anthropic.com) | API Keys → create. Add ~$10 credit. | `ANTHROPIC_API_KEY` | ≈$5–15 / mo |
| 5 | [Cloudflare dashboard](https://dash.cloudflare.com) | Workers & Pages → this Worker → plan **Workers Paid**. Settings → Variables and Secrets: add every key in this table as a *Secret*, plus `CRON_SECRET` (40+ random chars) and `PUBLIC_ORIGIN=https://<your-domain>`. After deploy, Triggers → Cron should list `*/10 * * * *`. | Scheduler that sends + syncs inboxes | $5 / mo |
| 6 | Lovable → Cloud, or [supabase.com/dashboard](https://supabase.com/dashboard) | SQL Editor: run `supabase/migrations/20261102120000_outreach_engine.sql`, then `20261103090000_outreach_v2.sql`, then `20261103150000_site_cache.sql`, then `20261104100000_inbound_leads.sql`. Settings → API → copy the **service_role** key into the Cloudflare secret `SUPABASE_SERVICE_ROLE_KEY` if Lovable doesn't inject it. | Tables for leads, sequences, enrollments, messages, saved searches | $0 |
| 7 | [serper.dev](https://serper.dev) | Sign up → API key. | `SERPER_API_KEY` (2,500 free searches) | $0, then $1 / 1,000 |
| 7b | [apify.com](https://apify.com) | Sign up (free, $5 credit/mo) → Settings → Integrations → API token → Cloudflare secret `APIFY_TOKEN`. Then tick "Apify bulk" in the scraper. | Hundreds of businesses per search instead of Google's 60 | $0, then ≈ $0.50–4 / 1,000 places |
| 7c | Your calendar tool ([cal.com](https://cal.com) is free, or Calendly / Google appointment page) | Create a 15-minute event → copy its public link → Cloudflare secret `BOOKING_URL`. | Every "Book a call" button on the public pages | $0 |
| 8 | [emailverifier.reoon.com](https://emailverifier.reoon.com) | Sign up → API key. Optional. | `REOON_API_KEY` (20 free / day) | $11.90 / 10,000 |
| 9 | [Google Postmaster Tools](https://postmaster.google.com) | Add + verify the secondary domain. | Spam-rate and reputation graphs | $0 |
| 10 | Inspirova admin → **Settings** | Connect each mailbox (Google button). Daily cap 10 for the first week, then +10 / week up to 40. Hours 08:00–17:00, weekdays only, timezone, signature, physical postal address for the footer. Turn on two-factor. Send a test email. | Everything wired | — |

**No longer needed:** Apollo, Hunter, SerpApi, GoHighLevel. Their keys still work if present; nothing requires them.

**First week:** domain + mailboxes (day 1) → DNS records, wait 24 h → Google Cloud + Cloudflare secrets (day 2) → connect mailboxes, send tests to yourself (day 2) → first real sequence at 10/day per mailbox (day 3) → ramp weekly.

## Secrets summary (Cloudflare → Worker → Settings → Variables and Secrets)

```
GOOGLE_PLACES_API_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
ANTHROPIC_API_KEY
CRON_SECRET
PUBLIC_ORIGIN
SUPABASE_SERVICE_ROLE_KEY
SERPER_API_KEY        (optional)
REOON_API_KEY         (optional)
APIFY_TOKEN           (optional — bulk scraping)
BOOKING_URL           (optional — "Book a call" buttons; falls back to the quote form)
```

For local development copy `.dev.vars.example` to `.dev.vars` and fill the same names.
