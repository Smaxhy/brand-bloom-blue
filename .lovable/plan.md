# Hardening & Polish Plan

A pass across security, safety, and UX. Grouped so you can approve as-is or trim any section.

## 1. Data protection (client leakage + XSS)
- Audit `EmailHub`, `Clients`, `Leads`, `RawData`, `Pipeline`, `Finance` for any place client data (emails, phones, revenue) is rendered via `dangerouslySetInnerHTML` or interpolated into `href`/URLs unsanitized. Replace with escaped JSX + `encodeURIComponent`.
- Add a small `sanitize.ts` helper (strip `<script>`, event handlers, `javascript:` URLs) used anywhere user-entered template bodies/subjects are previewed.
- Never log PII to `console` in production paths.

## 2. RLS + server-side admin check
- Confirm RLS enabled on every `public.*` table (currently only `admin_state` + `user_roles` exist; verify no future tables slip through).
- Move the "is admin" gate off the client. Add a `requireAdmin` server middleware that wraps `requireSupabaseAuth` and calls `has_role(userId, 'admin' | 'ceo')`. Apply to every admin server function (team users, settings mutations, etc.).
- Client keeps a UX-only check; the server is the source of truth.

## 3. Rate limiting
- Note: the backend has no standard rate-limit primitive. Ad-hoc implementation: a `public.rate_limits` table (`key text, window_start timestamptz, count int`) + a `check_and_bump(key, max, window_seconds)` SQL function called from server middleware.
- Applied to: login attempts, password reset requests, email-send bursts, scraper endpoints.
- Keys: `ip:<ip>`, `user:<uid>`, `action:<name>`. Return 429 with `Retry-After`.

## 4. Auth: session, password reset, login rate limit
- Keep Supabase session in `localStorage` (default) — document token lifetime; add `onAuthStateChange` refresh already wired.
- Add `/reset-password` public route: reads `type=recovery` hash, calls `supabase.auth.updateUser({ password })`.
- Add "Forgot password?" link on `/auth` calling `resetPasswordForEmail` with `redirectTo: origin + '/reset-password'`.
- Login + reset endpoints gated by rate limiter (5 / 15 min / IP).

## 5. Error handling
- Wrap each admin view in an `<ErrorBoundary>` with a friendly retry card.
- Route-level `errorComponent` + `notFoundComponent` on `/admin`, `/results`, `__root`.
- Toast on server-fn failures instead of silent console errors.

## 6. Confirmation on destructive actions
- Replace `confirm()` with a shadcn `AlertDialog` `<ConfirmDialog>` component.
- Wire into: delete contact, delete template, delete lead, delete client, delete task, "Move all to sent", clear campaigns.

## 7. Accessibility (ADA / WCAG AA)
- Add `aria-label` to every icon-only button (trash, pencil, close).
- Ensure focus rings via `focus-visible:ring-2` on interactive elements.
- Color contrast pass: replace any `text-muted-foreground/50` etc. with tokens meeting AA.
- Single `<main>` per route; verify heading order.
- 44×44 min tap targets on mobile controls.

## 8. Data deletion policy
- Add a `/privacy` public route with a plain-language policy: what's stored, retention, deletion request email.
- Add an admin "Export & Delete" action on a client row: exports JSON, then hard-deletes the row + related campaigns entries.

## 9. Email UX: sending status + cancel
- Live progress bar (already have counter) → visual bar with percentage.
- "Cancel" button during send: aborts the in-flight chunk loop via `AbortController`; already-sent recipients remain marked.
- Toast on completion (success/partial/failure).
- Disable Send while sending (already done last turn — keep).

## 10. Hover animations & mobile polish
- Add `transition-all hover:-translate-y-0.5 hover:shadow-md` to stat cards, panels, template cards.
- Tabs bar: horizontal scroll on mobile; sidebar collapses to bottom-nav under `md`.
- Modal: full-screen sheet on mobile.
- Tables: card layout on `sm` breakpoint.

## Technical notes
- New files: `src/lib/sanitize.ts`, `src/components/ConfirmDialog.tsx`, `src/components/ErrorBoundary.tsx`, `src/routes/reset-password.tsx`, `src/routes/privacy.tsx`, `src/lib/rate-limit.server.ts`, `src/lib/require-admin.ts`.
- Migration: `rate_limits` table + `check_and_bump` function + GRANTs + RLS deny-all (server-only via service role).
- Modified: `EmailHub.tsx` (AbortController + progress bar), admin views (ConfirmDialog swap, aria-labels, hover), `start.ts` (no change), auth route (forgot-password link).
- No new external services; uses existing Supabase.

## Out of scope / flags
- **Rate limiting caveat**: this is an ad-hoc DB-backed limiter, not a true edge/IP limiter — acceptable for app-level abuse control, not DDoS protection.
- Not adding 2FA / email verification changes unless you ask.

Approve and I'll implement in one pass, or tell me which sections to drop.