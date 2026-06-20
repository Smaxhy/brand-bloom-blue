## Goal
Make the marketing site usable on mobile and remove the cheesy glow/spark effects (especially the stretched glowing line down the "How it works" timeline) on desktop. Desktop layout stays as-is.

## Files
- `src/inspirova.html` (all changes happen here)

## 1. Remove the glow / spark effects (desktop + mobile)

- **Delete the timeline "comet" stretched line.** The `.tl-spine::after` rule + `@keyframes spineflow` (lines ~170-173) creates a glowing purple streak that animates down the page. Remove that pseudo-element entirely. Keep the static spine gradient itself, but tone it down to a soft 1px line `rgba(255,255,255,.08)` so it reads as a divider, not a laser.
- **Kill the ringpulse on timeline dots.** Remove `.step .dot::before` + `@keyframes ringpulse` so the step circles stop emitting expanding rings.
- **Calm the section background orbs.** In the hero, `.feat`, `.how`, `.calc` sections the `background` stacks three high-opacity `radial-gradient`s (`rgba(124,92,255,.42)` etc). Lower each radial alpha to ~`.10` max so the page reads dark navy with subtle depth instead of glowing blobs.
- **Drop the orbit `floaty` + `corepulse` animations** on the hero illustration — keep the orbit static (rings + nodes + logo, no bobbing).
- **Remove glow shadows on the floating panel** (`box-shadow:0 0 0 4px ...glow...`) on `.step .dot` and `.btn-primary` hover — keep a flat, subtle drop shadow only.

## 2. Fix mobile

Audit and fix everything visible at ≤480px. Desktop CSS is untouched; only the existing `@media (max-width:880px)` / `@media (max-width:520px)` blocks (lines ~292-307) and a new `@media (max-width:520px)` block get edits.

- **Header brand is invisible.** `<a class="brand">` is empty — inject the Inspirova logo image (same `__LOGO__` token already used elsewhere) so the brand mark shows on mobile too.
- **Header overflows on mobile.** "Get started" pill + hamburger crowd the row. At ≤520px hide "Get started", keep only the burger + brand. Reduce header horizontal padding.
- **Hero orbit overlaps text and clips header.** At ≤880px shrink the orbit to `min(320px, 78vw)`, add top margin, and ensure it sits *after* the hero copy in document flow (it already does — just fix the size + spacing).
- **Timeline broken on mobile.** The current `@media` rule sets `grid-template-columns:64px 1fr` but `.step.left .txt` keeps its desktop `order` so text gets pushed into the 64px column. Force `order` on `.dot`, `.txt`, `.spacer` inside the mobile block so every step renders as `[dot][text]` regardless of left/right variant. Move `.tl-spine` to `left:32px` (already there) and verify it lines up with the new dot column.
- **Pricing calculator + bundles** stack to one column already; tighten padding (`.calc-card` padding from `40px clamp(20px,4vw,56px)` to `28px 18px` on mobile) so the card doesn't overflow the viewport.
- **Footer** `.foot-grid` switches to column on mobile with left-aligned text.
- **Body horizontal scroll**: add `html,body{overflow-x:hidden}` and `.wrap{padding-inline:18px}` on mobile to stop the orbit/glow gradients from creating a horizontal scrollbar.

## 3. Verify

After edits run a quick Playwright pass at 390×844 (mobile) and 1280×1800 (desktop) inside the iframe, screenshot the hero, timeline, and pricing sections, and confirm:
- No glowing comet on the timeline.
- No spark rings around step dots.
- Mobile: brand visible, hero orbit fits, every timeline step shows `[dot] [text]` with text readable, pricing card fits without horizontal scroll.
- Desktop: layout looks identical to before, minus the removed glow effects.

## Out of scope
- Apollo / lead pipeline / results page logic — no changes.
- Color palette, fonts, copy — unchanged.
- No new dependencies or new routes.
