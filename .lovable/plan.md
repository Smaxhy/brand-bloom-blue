## What you can do now that the GHL key is in

Short answers first, then the plan.

**Will it send?** Yes — once `GHL_API_KEY` is on the server and you've set a **Location ID** + a verified **From email** in Settings, `/api/ghl/send` POSTs to GoHighLevel's `services.leadconnectorhq.com/emails/send`. The current proxy only reports `sent / total`, so if GHL rejects the from-address (not verified in that Location) or the location ID is wrong, you'd get "0/1 sent" with no reason. We'll fix that.

**Promotional or "real"?** Both are real SMTP sends. GoHighLevel itself decides routing by the sending domain you've verified inside GHL (Settings → Email Services). It is **transactional/1-to-1** when sent through this endpoint — not a bulk marketing blast — but inboxing still depends on:
- The From email's domain being verified in GHL (SPF/DKIM done in GHL, not on your site).
- GHL's sending reputation for that subaccount.
- Content not tripping spam filters (links, all-caps subject, etc.).

So you don't need DNS on Lovable; you do need the From email's domain verified inside GHL.

## Plan

### 1. Add a "Send test email" tool in Settings
- New section under the GHL block: input for a test recipient + "Send test" button.
- Calls `/api/ghl/send` with a fixed subject/body so you can confirm end-to-end delivery without touching real leads.
- Shows the exact provider response (success, or GHL's error message + status code).

### 2. Improve `/api/ghl/send` error reporting
Currently returns `Forwarded X/Y` with no detail. Change to:
- Return per-recipient `{ email, ok, status, error }` array.
- Include GHL's response body on failure (truncated to ~300 chars) so the UI can show "GHL: from-email not verified in this location" etc.
- Keep the server-secret-first behavior (`GHL_API_KEY` env beats client-supplied key).

### 3. Surface results in the Email Hub
- After Send, show a small results panel: ✅ delivered to N, ❌ failed for M (with reason per failure).
- No change to scraping/raw-data flow.

### 4. Settings copy update
- Replace the "deploy a small Cloudflare Worker" paragraph (no longer accurate — the proxy is already live) with: "GHL key is configured on the server. Set Location ID + From email below, send a test, then use the Email Hub to send to real leads."
- Add a one-line note: "Verify your From email's domain inside GHL → Settings → Email Services before going live."

### Files
- `src/lib/api-proxies.ts` — `ghlSend()` returns per-recipient detail.
- `src/admin/store.ts` — update `ghlSendEmail` return type to include `details`.
- `src/admin/views/SettingsView.tsx` — test-send UI + updated copy.
- `src/admin/views/EmailHub.tsx` — render per-recipient results after send.

No new secrets needed; `GHL_API_KEY` is already in place.
