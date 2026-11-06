# Project conventions
- Keep the public homepage inside its existing HTML document and iframe navigation bridge; this preserves its calculator and quote interactions.
- Scope public editorial theme tokens to public pages so redesigns do not alter account-side CRM appearance.
- When importing replacement archives, retain generated Cloud clients/types and existing migration tooling; archive copies may be stale and must not replace managed configuration or replay applied migrations.
- Shared outreach integration credentials are admin/CEO-managed through authenticated server functions and encrypted in a server-only table; API requests and scheduled jobs resolve them without exposing stored values to browsers.
- Scraper and scheduled searches share server-only domain enrichment caching; public website extracts are cached without browser grants to reduce repeated crawling.
- Website enrichment uses a public-destination fetch guard on every redirect, with DNS checks and bounded reads, to prevent crawling internal endpoints.
- Outreach People history queries must filter by enrollment ID through the authenticated RLS client; spreadsheet exports escape cells and neutralize formula prefixes to keep lead data safe.
- GHL plain-text sends must populate its HTML email-body field with escaped text; URL attributes must also be escaped to prevent injection.

- Sending diagnostics use an authenticated, rate-limited server function with verified admin/CEO roles; the diagnostic helper only reads records and never triggers delivery.
