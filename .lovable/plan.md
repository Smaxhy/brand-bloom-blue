
## What's happening

The `HTTP 429 Too Many Requests` from GoHighLevel is a **per-second/per-minute API rate limit**, not your monthly email quota. GHL caps API calls (roughly 10 requests/second, 200k/day per location) regardless of how many email credits you have left. Right now `ghlSendEmail` in `src/admin/store.ts` fires one HTTP request per recipient back-to-back with no throttling, so any campaign over ~10 recipients trips the limit.

## Plan

1. **Throttle sends in `ghlSendEmail`** (`src/admin/store.ts`)
   - Send recipients sequentially with a small delay (~150–200ms between requests) to stay under GHL's per-second cap.
   - On `429`: read the `Retry-After` header if present, otherwise use exponential backoff with jitter (1s → 2s → 4s, capped at ~10s), retry up to 4 times per recipient before marking it failed.
   - On `5xx`: same backoff, fewer retries (2).
   - Keep the existing per-recipient `GhlSendDetail` result shape so the UI keeps working.

2. **Surface progress in the campaign UI** (`src/admin/views/EmailHub.tsx`)
   - While sending, show `Sending X / N…` on the button instead of a static "Sending…".
   - After completion, if any recipients were rate-limited and dropped, show a friendlier message ("GHL rate limit hit — N emails were retried, M still failed, try again in a minute") alongside the existing details list.

3. **No changes** to templates, recipients storage, or GHL credentials — the fix is purely in the send pipeline.

## Technical notes

- Sequential + delay is simpler and safer than a token-bucket here since campaigns are small and user-initiated.
- Successfully-sent recipients are already marked via `lastEmailedAt` per-email in the result loop, so partial success on retry won't double-send.
- No new dependencies needed.
