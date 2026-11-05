# Inspirova — admin engine only (no public site files)

Everything behind the admin login plus the server code it needs. Nothing in here
touches the public homepage or any public page.

| Path | What | Action |
|---|---|---|
| `src/admin/**` | Admin screens: scraper (Apify bulk, AI marketing-need rating, scores), raw data, outreach, settings (Google + **GoHighLevel** sending) | Replace your `src/admin` |
| `src/lib/**` | Server: discovery (Places, OSM, Serper, Apify), tiered crawl + 30-day cache, AI assessment, scoring, sequencer with **two sending channels (Gmail, GHL)**, reply/bounce sync for both, saved searches, auth, DB | Replace your `src/lib` |
| `src/server.ts` | Worker entry (api + cron) | Replace |
| `supabase/migrations/*.sql` | 10 migrations, run in order: outreach_engine → outreach_v2 → site_cache → inbound_leads → ghl_channel → saved_search_filters → plain_footer → seen_businesses → ai_instructions → sequence_send_anytime | Run the ones you haven't |
| `wrangler.jsonc` | cron trigger + CPU limit | Merge `triggers` + `limits` |
| `SETUP.md` | Every site and key, in order | Read |

## What changed in this build (Nov 5, night) — ONE NEW MIGRATION

- **Page "refreshing" fix** (`src/admin/AdminApp.tsx`, `store.ts`): a token refresh — especially with the admin open in two tabs — made Supabase report "signed out" then "signed in" a second later, which rebuilt the whole screen. The app now waits 3 s before treating a sign-out as real, never hydrates twice for the same user, and ignores the realtime echo of its own saves.
- Google Places daily-quota (429) errors now stop the scan immediately instead of burning more calls, and the banner says exactly where to raise the quota.
- **Send now.** People tab: a purple send button on every waiting row, and "Send now to everyone waiting" when a sequence is selected. Ignores the scheduled time and the mailbox's sending hours (daily cap and the bounce check still apply; 20 per click, short gaps). Works even if the sequence is paused/draft.
- The "Send due emails now" toast now says WHY nothing went out, e.g. "m@x.com: outside send hours (08:00–17:00 Europe/Brussels, Mon/Tue/Wed/Thu/Fri)".

Run `supabase/migrations/20261105120000_ai_instructions.sql` (adds `outreach_settings.ai_instructions`).

- **Outreach → Sequences**: every card shows who is in it (N people · waiting · finished · replied · bounced) — click it to open the People tab filtered to that sequence.
- **Add people** button on each sequence: pick from your scraped businesses (search, hide already-emailed, select all), tick "Start sending right away", done. No more Raw Data detour.
- **Write with AI** in the sequence editor: a Write/Rewrite button on every email. Tell it the audience + any direction; it writes subject, A/B subject and body with the {{variables}} filled in at send time.
- **Settings → AI instructions**: ONE editable text that steers all AI: Write with AI, the {{pitch}}/{{gap}} lines at scan time, and reply drafts. Change the prompt whenever you like.

- **Apify overspend fixed.** The per-search limit was being multiplied by the number of keywords (10 × 500 = 5,000 places ≈ $20 in one click). Apify now gets a total, split across at most 6 keywords, is only asked for what Google Maps did NOT already find, and a run the browser stops waiting for is aborted (and its partial results collected) instead of left running. Toggle label shows the price.
- **Automatic bounce check** (`src/lib/bounce.ts`): before an address's first email it is verified (Reoon SMTP check if REOON_API_KEY is set, else MX). Invalid → suppressed, lead flagged, pulled from every sequence. After sending, bounces are classified hard vs soft: hard → suppressed + all the lead's enrollments stopped; soft (mailbox full, greylist) → one retry in 2 days, then treated as hard. Works for Gmail and GHL mailboxes.
- Claude errors now say what's wrong ("out of credit — top up at console.anthropic.com") instead of "claude 400".

- **Whole-state / big-area scans.** Type a US state ("Arizona", "AZ", "Texas") and the scraper searches its biggest cities one by one (18 for Arizona, 20 for Texas/California/Florida), 5 calls in flight, until it has what you asked for. Countries and provinces get a coarse grid instead. Before, it searched one 60 km circle around the state's geographic centre.
- Server cap per scan raised 200 → 1000; "How many" now goes to 1000 (2000 with Apify).
- The banner tells you how many cities it covered, e.g. "Searched 5 of 18 cities in Arizona (13 Google calls)".

- Scraper: **Christmas lights (Dec)** preset + a "Seasonal — Christmas" niche group (installers and the trades that add lighting on).
- Fixed "website: serpapi.com" — provider links can no longer be mistaken for a business site.
- SerpApi / Serper quota or bad-key problems now show as a ⚠ in the scraper banner instead of failing silently.
- The banner now says WHY you got fewer than asked: "N filtered out", "N seen before (hidden)", "Google only had N businesses for this area".
- No new migrations.

## Sending through GoHighLevel

1. GHL → Settings → Email Services → add your sending domain, add its DNS records at your registrar.
2. GHL → Settings → Private Integrations → create a token (scopes: contacts write, conversations/messages write + read, locations read).
3. GHL → Settings → Business Profile → copy the Location ID.
4. Admin → Settings → **Connect GoHighLevel** → paste token, Location ID, the From email (verified in GHL), a From name.
5. The GHL row appears under Sending mailboxes with a daily cap (starts at 100). Tick it in any sequence's "Send from". Replies land in Outreach → Replies with Claude drafts; bounces go on the suppression list automatically.

Google mailboxes and GHL can run side by side; a sequence can use any mix.

Secrets (Cloudflare → Worker → Settings → Variables and Secrets): see SETUP.md.
Optional in this build: `APIFY_TOKEN` (bulk Google Maps scraping).

Install: copy the three `src` paths over, run the migrations you haven't yet
(at least `20261104100000_inbound_leads.sql`, `20261104120000_ghl_channel.sql`, `20261104140000_saved_search_filters.sql` , `20261104160000_plain_footer.sql` and `20261105090000_seen_businesses.sql`),
add secrets, `npm install && npm run build`, deploy.
