## Goal

Make the scraper actually pull businesses from Google (not only Apollo), permanently remember every denied/accepted contact so they never resurface, and use Claude to read scraped web pages for the highest-quality contact data.

## What's broken / missing today

- Apollo is the only source of *people*. If Apollo has no record for a local SMB, you get nothing.
- "Deny" only hides a row in the current session — same person comes back next scrape.
- Google is used only as a *fallback for emails*, never to discover businesses.
- No AI step; results are whatever the third-party API returns verbatim.

## Plan

### 1. New Google business discovery source

Add a second discovery pipeline that runs in parallel with Apollo:

- **Server route** `/api/google/businesses` (new function in `src/lib/api-proxies.ts`).
  - Uses existing `SERPAPI_API_KEY` with `engine=google_maps` (SerpApi Maps) → returns local business listings with name, website, phone, address, rating, type.
  - Falls back to `engine=google` organic + Serper if Maps unavailable.
  - Geocodes location (already supported) and passes `ll` for accurate local results.
  - Pagination across multiple `start` offsets up to the user's `perPage`.
- **Server route** `/api/scrape-site` — fetches a business website (HTML → text, capped ~50KB) so Claude can extract owner/decision-maker info.
- New normalizer converts Google Maps results to the same `ScrapedPerson`-ish shape (company-level rows; person fields filled by Claude step).

### 2. Claude-powered enrichment

- Add `ANTHROPIC_API_KEY` via the secrets tool (request it after plan approval).
- New server route `/api/claude/extract`:
  - Input: business name + website HTML + any Google snippet.
  - Asks Claude (haiku for speed) to return strict JSON: `{ ownerName, ownerTitle, email, phone, linkedin, confidence }`.
  - Used to enrich Google Maps results that have a website but no person, and to verify/improve Apollo results when confidence is low.
- All Claude calls server-side only.

### 3. Persistent denylist (per account, backend)

- Extend the per-account `admin_state.data` JSON with a new `denylist` object:
  ```ts
  denylist: {
    byKey: Record<string, { reason: "denied" | "accepted"; ts: number }>
  }
  ```
  Key = stable hash of `lower(email) || lower(company)+"|"+lower(name) || domain`.
- Store helpers in `src/admin/store.ts`: `denyPerson(person)`, `denyMany(people)`, `isDenied(person)`.
- When a contact is accepted into Raw Data (`sendToRaw`), also auto-add it to the denylist as `accepted` so it never re-scrapes.
- When the user clicks "Deny" (single or bulk) in the scraper, write to denylist *before* removing from the list.
- Filter every fresh scrape result through `isDenied` server response handler (client-side filter is enough since denylist lives in `data`).
- Add a small **"Denied & accepted history"** panel in the Scraper view: shows count, search box, "Restore" button per entry.

### 4. Accuracy & dedup improvements

- Merge Apollo + Google Maps results by normalized domain → one row per business, prefer the row that has the most fields filled.
- Drop rows whose website is a known directory/social (reuse existing `SOCIAL_RE`).
- After Claude extraction, drop rows where `confidence < 0.4` and no email/phone found.
- Add a "Sources used" chip on each result (Apollo / Google Maps / Claude+site).

### 5. UI changes (`src/admin/views/Scraper.tsx`)

- New toggle group: **Sources** — `Apollo`, `Google Maps`, `Deep scrape (Claude)` — all on by default.
- Existing "Deny" buttons now persist; tooltip updated to "Hide forever from this account".
- Progress bar shows three phases: discover → enrich → AI extract.
- New collapsible "History (denied / accepted)" section.

### Files touched

- `src/lib/api-proxies.ts` — add `googleBusinesses`, `scrapeSite`, `claudeExtract` handlers; wire into `handleApiRequest`.
- `src/admin/store.ts` — add `denylist` to `AdminData`, helpers, new `searchBusinesses(filters)` that fan-outs to Apollo + Google + Claude.
- `src/admin/views/Scraper.tsx` — sources toggle, persistent deny wiring, history panel, accept-also-denies.
- `src/integrations/supabase/types.ts` — no schema change needed (denylist lives inside existing `admin_state.data` JSON).
- New secret: `ANTHROPIC_API_KEY` (requested via secret tool after approval).

### Out of scope

- No new DB tables — denylist fits in the existing per-account JSON blob and is already auto-synced.
- Not rebuilding the Apollo path; it stays as-is and runs alongside Google.
- No phone reveal changes beyond what Claude finds in page text.
