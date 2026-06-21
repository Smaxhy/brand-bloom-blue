## Goal
At the top of `/results`, lead with the exact summed client revenue figure pulled from the uploaded dashboards, then back it with a curated gallery of the strongest screenshots.

## What I found in the zip
50 screenshots, OCR'd. The cleanest, non-overlapping headline figures (the rest are duplicates, smaller campaign tiles, or sub-views of these dashboards):

| Screenshot | Figure | Window / context |
|---|---|---|
| 185007 | **$1,037,785** | Grand total — revenue generated across clients |
| 185110 | $659,262 | Last 365 days (single client) |
| 185051 | $197,736 | ~Lifetime ("push 200K") |
| 185038 | $114,233 | Jan–May 2025 |
| 185019 | $101,255 | Jan–May 2025 |
| 185652 | $98,558 | ~1 month (Mar–Apr) |
| 185628 | $91,439 | 1 month (March) |
| 185128 | $84,343 | 30 days, all channels |

The $1,037,785 dashboard is the aggregate; the other 7 are the underlying client receipts that prove it.

## Build plan

### 1. Upload the 8 screenshots as CDN assets
`lovable-assets create` for each of the 8 PNGs above → `src/assets/proof-revenue-*.png.asset.json`.

### 2. New hero block at top of `/results` (above existing headline stats)
- Eyebrow: "Verified client revenue"
- Massive animated count-up to **$1,037,785** (Inter tabular-nums, `text-gradient-brand`, ~text-7xl/8xl)
- Subline: "Tracked across client dashboards — Shopify, Meta Ads, GHL. Screenshots below."
- Small meta row: "7-figure milestone · 2025" · "8 client dashboards" · "Updated Jun 2026"
- Count-up runs once on mount with `requestAnimationFrame` (no extra deps), respects `prefers-reduced-motion`.

### 3. New "Receipts" gallery directly under the hero
Replace nothing — insert between the new hero and the existing `headlineStats` grid.
- Grid of 8 cards (1 col mobile / 2 md / 4 lg), `aspect-[4/3]` screenshot on top, caption bar below.
- Each card shows the figure as a large overlay chip (`$659,262`) + the context line ("Last 365 days").
- Same `rounded-2xl border bg-card shadow-card hover:-translate-y-1 hover:shadow-glow` treatment used elsewhere on the page for visual consistency.
- The $1,037,785 card spans 2 cols on `lg` and is flagged "Aggregate" so the hierarchy reads correctly.

### 4. SEO
Update the route's `head()` title/description to mention "$1M+ in tracked client revenue".

## Out of scope
- Not touching the existing headline stats, case studies, picture-proof masonry, or CTA — they stay as-is below the new section.
- Not migrating the existing `proof-1..7.png` imports.
- No new dependencies.

## Files touched
- `src/routes/results.tsx` — add hero + receipts section, update `head()`.
- `src/assets/proof-revenue-{total,659k,197k,114k,101k,98k,91k,84k}.png.asset.json` — 8 new CDN pointers.