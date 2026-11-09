# Project conventions
- Website intake remains authoritative in contact_submissions; authenticated Pipeline overlays merge requests by normalized email while retaining immutable original request details and account-specific stages. Submission fingerprints are unique to prevent retry duplicates.
- Pipeline dedup uses source identity, normalized email, or company plus phone (never company alone); preserve IDs, stage decisions and source/request history rather than inventing missing data.
- Pipeline deletion persists account-specific dismissed request IDs alongside deals so refreshing cannot recreate deleted quotes; original intake and outreach history remain immutable.
- Inboxes reads live GoHighLevel conversations through a bounded role-verified server function, validating mailbox access and conversation location before returning plain text; it never sends or changes messages.
- Email dispatch checks a per-run time budget before claiming another recipient or sleeping; keep reply/opt-out sync fail-closed and existing atomic claims while carrying remaining work into later runs.
- Quote/contact writes use bounded same-origin requests and atomic server-only request counters; admin proxies require explicit verified roles and fail closed if abuse protection is unavailable.
- Keep the public homepage inside its existing HTML document and iframe navigation bridge; this preserves its calculator and quote interactions.
- Scope public editorial theme tokens to public pages so redesigns do not alter account-side CRM appearance.
- When importing replacement archives, retain generated Cloud clients/types and existing migration tooling; archive copies may be stale and must not replace managed configuration or replay applied migrations.
- Shared outreach integration credentials are admin/CEO-managed through authenticated server functions and encrypted in a server-only table; API requests and scheduled jobs resolve them without exposing stored values to browsers.
- Scraper and scheduled searches share server-only domain enrichment caching; public website extracts are cached without browser grants to reduce repeated crawling.
- Website enrichment uses a public-destination fetch guard on every redirect, with DNS checks and bounded reads, to prevent crawling internal endpoints.
- Outreach People history queries must filter by enrollment ID through the authenticated RLS client; spreadsheet exports escape cells and neutralize formula prefixes to keep lead data safe.
- GHL plain-text sends must populate its HTML email-body field with escaped text; URL attributes must also be escaped to prevent injection.

- Sending diagnostics use an authenticated, rate-limited server function with verified admin/CEO roles; the diagnostic helper only reads records and never triggers delivery.
- Own Maps scraper connections use server-only configuration, public HTTPS/DNS validation, no redirects, and bounded downloads; never forward credentials to an unvalidated destination.
- Bulk manual sequence sends freeze eligible enrollment IDs and send each once per action, preserving follow-up delays and server-side caps/claims.
- Persisted enrichment scans are owner-scoped through authenticated admin/CEO server functions; every worker write requires its claim token and running status so cancellation cannot be undone by stale work.
- Scraper owner LinkedIn searches are an explicit scan option passed through validation and persisted job options; disabling it must suppress fresh and cached-profile lookups to avoid unexpected search credits.
- Reveal polling waits for server cancellation before issuing another slice; failed cancellation remains retryable and completed results stay saved.
- Scan actions use independent bounded request budgets; explicit throttling retries with cancellation-aware waits, and successful reveal slices avoid redundant full-result polling.
- Raw Data Reveal uses owner-scoped persisted scans and merges results by original row ID into saved raw contacts; keep existing details, label guesses, and never synthesize demo addresses on failure.
- Version email extraction in cached site profiles; refresh older profiles when decoding or business relevance changes so caches cannot retain stale addresses.
- Manual email checks use authenticated admin/CEO server functions with fail-closed rate limits, bounded batches and email-keyed advisory results; MX checks never mean mailbox confirmation or successful suppression.
- Guessed-address enrollment requires verifier confirmation unless an explicit boolean override is supplied; invalid addresses remain blocked regardless of override.

- Background timer configuration and token hashes are service-role-only; validate approved published destinations, wake its bounded processor on enqueue, and disarm after drain. Nitro scheduled work uses the Cloudflare scheduled hook because generated hosting entries do not invoke the custom server scheduled export.
- GoHighLevel delivery checks persist a last-check cursor so missed scheduling windows cannot hide hard bounces.
- Raw email cleanup merges normalized duplicate addresses within each account at load/save and UI update boundaries; retain the canonical sent/contact identity and never delete outreach history. Invalid lead and bounced enrollment transitions atomically populate suppressions and stop matching outreach through database triggers.

- First-contact company checks are shared by manual enrollment, saved searches and dispatch; acquire the company lease before history reads and fail closed on lookup/lease errors to prevent parallel duplicate starts. Individual explicit sends retain the override but never bypass suppressions.
- Search fallback can switch from exhausted Serper to SerpApi only with the existing paid opt-in; keep provider warnings sanitized and preserve bounded reveal concurrency.
- Optional Brave fallback runs server-side between Serper and paid-opt-in SerpApi with serialized provider advancement and pacing; extraction compares complete email tokens and bounds expanded contact/sitemap crawling to preserve safety.
- The public homepage keeps its own dark violet design; its business-types scroller and receipts reel loop through a script that fills each row to the screen width (a static grid without scripts or with reduced motion). Case and reel screenshots arrive through __CASE_*__/__REEL_*__ placeholders in src/routes/index.tsx, and the homepage iframe needs allow-forms so the contact form's submit event fires. The results page mirrors that design with styles scoped under .results-site.
