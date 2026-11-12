# Public website refresh
# November 11 v2 admin update
- [x] Merge Instagram discovery/manual messaging, scan-size recovery and safe sender improvements without reverting existing protections, history, first-contact filters or the permanent daily cap.
- [ ] Run regressions and inspect public/admin pages without sending emails or spending search credits.

# November 9 outreach and scraper update
- [x] Install history-preserving sequence deletion, automatic bounced Raw Data cleanup, shared 2,000-result scrape ceiling and background/offline recovery; retain Stop, provider safeguards, website, security and 1,000 daily mailbox cap.
- [x] Verify 286 regression tests, transactional database history/bounce tests, cleaned saved Raw Data, preview build and public/admin entry rendering without emails or paid searches.
- [ ] Signed-in live scraper/recovery verification requires an available authorized preview session; own-account mint found no matching account. Keeping Scraper mounted across admin tabs was omitted pending Stop/lifecycle verification.

# Public website refresh
- [x] Make website quotes deletable from Pipeline with account-specific dismissals; confirmed deletion survives reopening and refresh, original requests retained, temporary verification data removed.
- [x] Add admin Inboxes with live GoHighLevel email conversations, sent bodies, reply status, search, older pages and one-minute refresh; verified real sent email and phone layout, 27 tests pass, no emails sent. New incoming reply arrival not exercised.
- [x] Prevent browser autofill from filling quote/contact bot-trap fields and return field-specific validation errors; 20 tests pass and completed browser quote returns success. Removed temporary test entry; original visitor failure could not be reproduced.
- [x] Connect structured quote/contact requests to Pipeline, preserve full details, and merge duplicate deals safely.
- [x] Add an optional personal message to quotes and show it with the original request in Pipeline.
- [x] Verify public submission, identical retry (one stored row), signed-in pipeline details and phone layout; removed test entries. Owner emails are not enabled (no verified sender domain).
- [x] Replace generic visual effects with an editorial design on the homepage.
- [x] Match the results and privacy pages while preserving content and existing flows.
- [x] Verify navigation, calculator, and narrow-screen layout.
- [x] Apply required package security update and check preview errors.

# Quote and admin security
- [x] Inspect and safely merge inspirova-admin-engine-3.zip pacing, enrollment and scan recovery fixes without replacing current security or data.
- [x] Add approved custom quote/contact request limits and real private quote submission.
- [x] Require successful server-side admin verification and reject oversized requests.
- [x] Verify abuse rejection, private quote storage, protected RPC grants and signed-out admin denial; CAPTCHA excluded by user choice.
- [ ] Signed-in admin/email verification: blocked by unavailable matching managed session; user must sign in. No emails sent.

# Replacement archive
- [x] Apply inspected inspirova-rebuilt-2.zip differences without replacing Cloud configuration or saved data.
- [x] Verify homepage calculator, navigation, and existing public pages.
- [ ] Live outreach verification: blocked by provider setup and published schedule verification; do not send test emails.

# Homepage-only reversal
- [x] Restore the homepage design from before the editorial redesign.
- [x] Preserve the new ZIP's scraper files, migrations, and saved backend data unchanged.
- [x] Verify restored homepage rendering, calculator, and navigation.

# Latest admin archive
- [x] Apply new scraper layout and persisted scores from inspirova-admin-engine_1.zip without changing homepage, accounts or migrations.
- [x] Verify scraper controls and preview rendering without sending emails or running paid searches.

# Integration entry
- [x] Add secure administrator credential entry and use saved credentials in scraper/mailbox requests.
- [x] Verify entry controls, validation, authorization and encrypted storage without paid calls or email sends; remove temporary test credentials.
# Mailbox archive update
- [x] Apply archive changes while retaining secure integration setup and existing data.
- [x] Add restricted enrichment cache and verify Settings mailbox controls.
- [x] Request publishing of verified update; Google consent completion, live provider/schedule checks and deployment completion remain unverified.

# Updated admin fix
- [x] Apply stationary button/panel hover fix from inspirova-admin-engine_4.zip while retaining secure settings, crawler protections, homepage and data.
- [x] Verify signed-in admin hover behavior and retained mailbox/key controls; seven safety tests passed, no runtime errors.

# Outreach People update
- [x] Apply new People view while preserving homepage, data and security protections.
- [x] Verify signed-in filters, history and CSV export with temporary paused records; cleaned up without sending emails.

# Admin engine 9 update
- [x] Apply seasonal niches and provider warning fixes while retaining security and existing Outreach improvements.
- [x] Verify signed-in scraper controls and provider response handling without live searches or sends; 12 tests passed and build OK.

# Admin engine 15 update
- [x] Apply GHL plain-text body fallback with safe escaping; retain homepage, data and security protections.
- [x] Verify email payloads and signed-in Settings without sending real emails; 15 tests passed and build OK.

# Admin engine 18 update
- [x] Apply read-only sending status and invalid-address improvements while retaining security and existing data.
- [x] Verify authenticated status and Re-check against real Cloud data; 21 regression tests passed, build OK; no emails sent.

# Admin engine 19 and Results update
- [x] Apply safe admin archive differences and five new Results screenshots.
- [x] Verify signed-in diagnostics and Results on desktop/mobile without sending emails.
- [ ] Live own Maps scraper: blocked by missing hosted scraper connection; no external service supplied.

# Admin engine 20 update
- [x] Add secure resumable scans, progress, Stop and Recent scans.
- [x] Verify persistence, cancellation, ownership and unchanged Results; remove temporary scan.
- [ ] Closed-tab scan continuation: blocked by unverified automatic scheduler; live enrichment not exercised.

# Quote access and admin engine 21
- [x] Add top quote access and non-final price estimate notices; verify form navigation.
- [x] Inspect and apply safe admin engine 21 changes while preserving data and protections.
- [x] Verify changed admin flows without paid searches or real email sends; 34 tests passed and signed-in lookup toggle checked.

# Reveal scan control
- [x] Add visible Stop beside Reveal and stop further scan steps while retaining saved results.
- [x] Verify cancellation with five passing tests and preview compilation.
- [ ] Signed-in Stop flow: blocked because the requesting user has no matching managed session; sign in to verify without paid searches.

# Raw Data reveal repair
- [x] Connect Raw Data Reveal to saved scans, retain found contact details and Stop support, and recover published emails previously suppressed by website MX checks.
- [x] Run 17 targeted regression tests and check the live admin entry for runtime errors without paid searches or email sends.
- [ ] Verify Reveal with the user's saved rows: blocked by no matching managed session; user must sign in to the preview.

# Uploaded email scraping fixes
- [x] Merge safe email scraping improvements from inspirova-admin-engine-4.zip while preserving saved data, cancellation and security.
- [x] Run 27 scraping, cache recovery, cancellation and security tests; build OK and admin entry has no runtime errors; no outbound emails.
- [ ] Verify email recovery with saved rows: blocked by unavailable own-account preview session; user must sign in.

# Proper admin engine 5 update
- [x] Merge safe new archive fixes while preserving saved data, Stop reveal, secure integrations and request protection.
- [x] Verify 80 regression tests and preview build; admin entry renders without runtime errors and signed-out enrichment is denied; no emails or paid searches.
- [ ] Verify new admin checks and Reveal against saved rows: blocked by unavailable own-account session; user must sign in. Live verifier and production publishing remain unverified.

# Reveal request-limit repair
- [x] Isolate scan action budgets, wait and retry explicit throttling, preserve Stop and saved results, and reduce redundant result reads.
- [x] Verify throttling recovery, cancellation and security with 28 passing tests; preview build OK and admin entry has no runtime errors.
- [ ] Signed-in saved-row Reveal check: blocked by no matching own-account session; sign in to the preview to verify live data.

# Comprehensive admin update
- [x] Finish compatibility fixes and install the reviewed archive while preserving public pages, saved data, secure credentials and fail-closed protection.
- [x] Apply additive private timer/delivery schema, register the scheduled runtime hook, preserve ID/step snapshots, Stop and token-fenced scan writes.
- [x] Verify 218 regression tests, preview build, homepage/admin entry and unauthorized timer rejection; no emails or paid searches.
- [ ] Signed-in saved-row admin/Reveal verification: blocked by no matching own-account session; user must sign in to the preview.
- [ ] Closed-tab timer and live provider verification: blocked by deployment/heartbeat checks and unavailable database timer extensions; no timer activated.

# Automatic email hygiene
- [x] Merge duplicate raw email entries on load/save/UI updates, retaining canonical sent identity and useful contact details.
- [x] Add atomic invalid/bounced transitions to suppressions and stop matching enrollments; backfill existing invalid/bounced addresses (zero missing blacklist rows verified).
- [x] Verify 227 tests and preview build; admin entry has no runtime errors, protected endpoints deny signed-out requests; no emails sent.
- [ ] Signed-in cleanup/email-check flow: blocked by no matching own-account session; sign in to the preview for saved-row verification.

# Admin fix 2
- [x] Merge new company-contact and opt-in fallback fixes without reverting existing protections.
- [x] Verify 240 tests, preview build and signed-in dashboard/scraper with saved searches; no real sends or paid searches.
- [ ] Live new company contact/send and paid fallback verification: requires real provider calls; not performed to avoid outreach and search charges.

# November 8 admin update
- [x] Merge new archived admin changes without reverting existing data, website or security protections.
- [x] Verify 272 regression tests, build, Results navigation and admin sign-in without sending emails or paid searches.
- [ ] November 8 signed-in live discovery verification: requires preview sign-in and optional Brave configuration; no emails or paid searches performed.
- [x] Relax admin sign-in attempt limit (user locked out after 2 tries)
- [x] Raw Data: show which contacts are already in a sequence (+ date added), block adding to another
- [x] Add Raw Data Never contacted filter and optional first-contact enrollment checkbox; refresh complete history before adding and stop marking enrollment as a send. Twelve tests pass, build OK, signed-in filter and checked dialog verified without enrolling people or sending emails.
