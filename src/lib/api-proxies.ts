/**
 * Server-side API proxies, run inside the Cloudflare Worker (src/server.ts).
 *
 * Why a proxy? Third-party APIs (Apollo.io, GoHighLevel) block direct browser
 * calls (CORS) and your secret keys must never ship in front-end code. These
 * handlers run on the edge, read keys from Worker secrets / env, and forward
 * the request. The browser only ever talks to same-origin /api/* routes.
 *
 * Secrets (set with `wrangler secret put NAME`, or in .dev.vars for local dev):
 *   APOLLO_API_KEY   – Apollo.io master API key (Settings → Integrations → API)
 *   GHL_API_KEY      – GoHighLevel private integration token (optional)
 *
 * If APOLLO_API_KEY is missing, /api/apollo/search returns { demo:true } and the
 * front-end falls back to sample data, so the UI stays usable before go-live.
 */

import { getApiUser, hasCronSecret, unauthorized } from "./api-auth";
import { regionSubAreas, bboxSpanKm } from "./providers/regions";
import { anthropicProblem } from "./anthropic-error";
import { placesTextSearch } from "./providers/places";
import { overpassBusinesses } from "./providers/osm";
import {
  apifyAvailable,
  apifyStart,
  apifyRunStatus,
  apifyItems,
  apifyRunAndWait,
  apifyAbort,
} from "./providers/apify";
import {
  gmapsSelfAvailable,
  gmapsSelfStart,
  gmapsSelfStatus,
  gmapsSelfItems,
  gmapsSelfRunAndWait,
  GMAPS_DONE,
} from "./providers/gmaps-self";
import { enrichSite, enrichMany } from "./enrich-site";
import { withTimeout } from "./send-errors";
import { publicCheck, publicConfig } from "./public-check";
import { freeEnrich, hasMx, scoreLead, pickBusinessEmail, type SiteSignals } from "./providers/free-enrich";
import { handleOutreachRoute } from "./outreach-routes";
import { hideSeenBusinesses, rememberBusinesses } from "./seen-businesses";
import { Db } from "./db";
import { resolveIntegrationEnv } from "./integration-settings.server";
import { runTick, keepAlive, verifySchedulerToken } from "./tick";
import { requestIpHash, securityJson } from "./request-security";

type Env = Record<string, string | undefined>;

/** Read a secret from Worker env binding OR process.env (Lovable injects secrets via process.env). */
function secret(env: Env, name: string): string | undefined {
  return env[name] || (typeof process !== "undefined" ? process.env?.[name] : undefined);
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Returns a Response for any /api/* route this module owns, or null to let the
 * request fall through to normal SSR routing.
 */
export async function handleApiRequest(
  request: Request,
  env: Env,
  ctx?: { waitUntil?: (p: Promise<unknown>) => void },
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/")) return null;
  // Public contact form is handled by its own route (validated + rate-limited there).
  if (path === "/api/public/contact") return null;

  // Background timer (database pg_cron, Cloudflare cron, or an outside pinger).
  // Authenticated by its own random token or CRON_SECRET — never a login.
  if (path === "/api/cron/tick" || path === "/api/public/cron/tick") {
    if (request.method !== "POST") return securityJson({ error: "POST only" }, 405);
    const cron = hasCronSecret(request, env);
    const timer = !cron && (await verifySchedulerToken(env, request.headers.get("x-scheduler-token")).catch(() => false));
    if (!cron && !timer) return unauthorized();
    const configured = await resolveIntegrationEnv(env);
    const onlySearches = url.searchParams.get("only") === "searches";
    const tick = await keepAlive(
      ctx,
      runTick(configured, onlySearches
        ? { trigger: timer ? "db" : "external", origin: url.origin, dispatch: false, scans: false, searches: true }
        : { trigger: timer ? "db" : "external", origin: url.origin, searches: true }),
    );
    const sent = tick.dispatch?.mailboxes.reduce((a, m) => a + m.sent, 0) ?? 0;
    return json({ ok: true, sent, read: tick.scans?.read ?? 0, errors: tick.errors.slice(0, 5) });
  }

  // Public endpoints (no login): unsubscribe links + health. Everything else
  // costs money or acts on your behalf, so it needs a signed-in admin — or the
  // cron secret for scheduled jobs.
  const isPublic =
    path === "/api/health" ||
    path === "/api/unsub" ||
    path === "/api/google/oauth/callback" ||
    path === "/api/public/check" ||
    path === "/api/public/config";
  if (path === "/api/public/check") return publicCheck(request, env);
  if (path === "/api/public/config") return publicConfig(env);
  let user = null as Awaited<ReturnType<typeof getApiUser>>;
  if (!isPublic) {
    if (!hasCronSecret(request, env) || path === "/api/outreach/scheduler") {
      // Flood guard per network address (before any login lookup). Generous
      // enough for a busy admin screen (keep-alive, scans, sending loops);
      // fails closed if the protection itself is unavailable.
      try {
        const permitted = await new Db(env).rpc<boolean>("check_rate_limit", {
          _key: `admin:attempts:${await requestIpHash(request)}`, _max: 120, _window_seconds: 60,
        });
        if (permitted !== true) return securityJson({ error: "Too many requests. Please wait a minute." }, 429, 60);
      } catch {
        return securityJson({ error: "Request protection is temporarily unavailable." }, 503, 60);
      }
    }
    user = await getApiUser(request, env);
    if (!user && (!hasCronSecret(request, env) || path === "/api/outreach/scheduler")) return unauthorized();
  }

  if (path === "/api/health") return json({ ok: true });

  // Rate limits per signed-in admin (cron and public routes are exempt).
  // Expensive routes: 60/min. Everything else: 300/min (the admin screens poll,
  // keep sending loops and scans alive). Fails closed if protection is unavailable.
  if (user) {
    if (!Db.available(env)) return json({ error: "Request protection is temporarily unavailable." }, 503);
    const heavy =
      /^\/api\/(discover|enrich|apollo|claude|scrape-site|outreach\/(enroll|test-send|verify|search))/.test(
        path,
      );
    let ok: boolean;
    try {
      ok = (await new Db(env).rpc<boolean>("check_rate_limit", {
        _key: `${heavy ? "heavy" : "api"}:${user.id}`,
        _max: heavy ? 30 : 120,
        _window_seconds: 60,
      })) === true;
    } catch {
      return json({ error: "Request protection is temporarily unavailable. Try again later." }, 503);
    }
    if (!ok) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          message: "Too many requests — wait a minute and try again.",
        }),
        {
          status: 429,
          headers: { ...JSON_HEADERS, "Retry-After": "60" },
        },
      );
    }
  }

  // Load shared encrypted credentials only after caller verification and rate checks.
  env = await resolveIntegrationEnv(env);
  const outreach = await handleOutreachRoute(path, request, env, user, ctx);
  if (outreach) return outreach;
  if (path === "/api/geocode") return geocode(url, env);
  if (path === "/api/discover/businesses") return discoverBusinesses(request, env);
  if (path === "/api/enrich/free") return enrichFree(request, env);
  if (path === "/api/verify-domain") return verifyDomain(url);
  if (path === "/api/diag") return diag(env);
  if (path === "/api/discover/apify/start") return apifyStartRoute(request, env);
  if (path === "/api/discover/apify/abort") return apifyAbortRoute(request, env);
  if (path === "/api/discover/apify/status") return apifyStatusRoute(request, env);
  if (path === "/api/discover/gmaps/start") return gmapsStartRoute(request, env);
  if (path === "/api/discover/gmaps/status") return gmapsStatusRoute(request, env);
  if (path === "/api/apollo/search") return apolloSearch(request, env);
  if (path === "/api/enrich") return enrich(request, env);
  if (path === "/api/hunter/domain") return hunterDomain(url, env);
  if (path === "/api/ghl/send") return ghlSend(request, env);
  if (path === "/api/google/businesses") return googleBusinesses(request, env);
  if (path === "/api/scrape-site") return scrapeSite(request, env);
  if (path === "/api/claude/extract") return claudeExtract(request, env);
  if (path === "/api/claude/keywords") return claudeKeywords(request, env);
  if (path === "/api/claude/areas") return claudeAreas(request, env);
  if (path === "/api/claude/ad-scan") return claudeAdScan(request, env);

  return null;
}

/* --------------------------------------------------------------------- */
/* Diagnostics — tells the UI exactly why it might be in demo mode         */
/* --------------------------------------------------------------------- */

async function diag(env: Env): Promise<Response> {
  const apolloKey = secret(env, "APOLLO_API_KEY");
  const out: Record<string, unknown> = {
    apolloKeyPresent: !!apolloKey,
    apolloKeyLength: apolloKey ? apolloKey.length : 0,
    hunterKeyPresent: !!secret(env, "HUNTER_API_KEY"),
    serpapiKeyPresent: !!secret(env, "SERPAPI_API_KEY"),
    ghlKeyPresent: !!secret(env, "GHL_API_KEY"),
    placesKeyPresent: !!secret(env, "GOOGLE_PLACES_API_KEY"),
    apifyKeyPresent: apifyAvailable(env),
    gmapsSelfPresent: gmapsSelfAvailable(env),
    serperKeyPresent: !!secret(env, "SERPER_API_KEY"),
    anthropicKeyPresent: !!secret(env, "ANTHROPIC_API_KEY"),
  };
  if (apolloKey) {
    try {
      const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Api-Key": apolloKey,
        },
        body: JSON.stringify({ page: 1, per_page: 1 }),
      });
      out.apolloStatus = res.status;
      out.apolloOk = res.ok;
      if (res.ok) {
        const d = (await res.json()) as { people?: unknown[] };
        out.apolloReturned = Array.isArray(d.people) ? d.people.length : 0;
      } else {
        out.apolloDetail = (await res.text()).slice(0, 200);
      }
    } catch (e) {
      out.apolloError = (e as Error).message;
    }
  }
  return json(out);
}

/* --------------------------------------------------------------------- */
/* Geocoding — OpenStreetMap Nominatim                                     */
/* --------------------------------------------------------------------- */

async function geocode(url: URL, _env: Env): Promise<Response> {
  const q = url.searchParams.get("q")?.trim();
  if (!q) return json({ error: "missing q" }, 400);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`,
      {
        headers: {
          // Nominatim requires a descriptive User-Agent / contact.
          "User-Agent": "Inspirova-Admin/1.0 (admin@inspirova.com)",
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) return json({ error: `geocode upstream ${res.status}` }, 502);
    const arr = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      boundingbox: [string, string, string, string]; // [south, north, west, east]
    }>;
    if (!arr.length) return json({ error: "not found" }, 404);
    const r = arr[0];
    const bb = r.boundingbox.map(Number) as [number, number, number, number];
    return json({
      lat: Number(r.lat),
      lng: Number(r.lon),
      displayName: r.display_name,
      bbox: bb,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

/* --------------------------------------------------------------------- */
/* Apollo.io — people search                                               */
/* --------------------------------------------------------------------- */

interface ScrapeFilters {
  location?: string;
  titles?: string;
  industry?: string;
  seniorities?: string[];
  perPage?: number;
  employeeRanges?: string[];
  minRevenue?: number;
  locationScope?: "person" | "company" | "both";
  requireEmail?: boolean;
  requirePhone?: boolean;
}

async function apolloSearch(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const key = secret(env, "APOLLO_API_KEY");
  // No key configured -> tell the client to use demo data, with the reason.
  if (!key) return json({ demo: true, reason: "missing_key" });

  let filters: ScrapeFilters = {};
  try {
    filters = (await request.json()) as ScrapeFilters;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // Total contacts the user wants (cap 500 to keep credit use + Worker time sane).
  const wanted = Math.min(Math.max(filters.perPage ?? 25, 1), 500);
  const titles = (filters.titles ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // Keywords can be a comma-separated list (e.g. "Real Estate, Tree, Store").
  // Each is searched separately and the results are merged + de-duplicated so
  // you get a union across all the niches you picked.
  const keywords = (filters.industry ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 6); // bound credit + Worker time

  const baseBody: Record<string, unknown> = {};
  if (filters.location?.trim()) {
    const loc = [filters.location.trim()];
    const scope = filters.locationScope ?? "both";
    if (scope === "person" || scope === "both") baseBody.person_locations = loc;
    if (scope === "company" || scope === "both") baseBody.organization_locations = loc;
  }
  if (titles.length) baseBody.person_titles = titles;
  if (filters.seniorities?.length) baseBody.person_seniorities = filters.seniorities;
  // Company size (e.g. ["1,10","11,20"]) — great for targeting local SMBs.
  if (filters.employeeRanges?.length) {
    baseBody.organization_num_employees_ranges = filters.employeeRanges;
  }
  // Minimum company revenue (USD).
  if (filters.minRevenue && filters.minRevenue > 0) {
    baseBody.revenue_range = { min: filters.minRevenue };
  }

  const queries = keywords.length ? keywords : [""]; // at least one (no keyword) query
  // Per-keyword target so a multi-keyword search still lands near `wanted` total.
  const perQuery = Math.min(Math.ceil(wanted / queries.length) + 25, wanted, 200);
  const PER_PAGE = 100;

  const byId = new Map<string, ApolloPerson>();
  let lastError: { status: number; detail: string } | null = null;

  for (const kw of queries) {
    const body = { ...baseBody } as Record<string, unknown>;
    if (kw) body.q_keywords = kw;
    const pages = Math.ceil(perQuery / PER_PAGE);
    for (let page = 1; page <= pages; page++) {
      try {
        const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            Accept: "application/json",
            "X-Api-Key": key,
          },
          body: JSON.stringify({ ...body, page, per_page: PER_PAGE }),
        });
        if (!res.ok) {
          // Remember the error, but keep trying the other keywords/pages —
          // one failed call should never wipe out the whole scrape.
          lastError = { status: res.status, detail: (await res.text()).slice(0, 300) };
          break;
        }
        const data = (await res.json()) as { people?: ApolloPerson[] };
        const batch = data.people ?? [];
        for (const p of batch) {
          const id = p.id || `${p.first_name}_${p.last_name}_${p.organization?.name}`;
          if (!byId.has(id)) byId.set(id, p);
        }
        if (batch.length < PER_PAGE) break;
        if (byId.size >= wanted) break;
      } catch (e) {
        lastError = { status: 0, detail: (e as Error).message };
        break;
      }
    }
    if (byId.size >= wanted) break;
  }

  // If we got ANY live contacts, return them live — even if some calls failed.
  if (byId.size > 0) {
    let collected = Array.from(byId.values());
    // Targeting: keep only reachable contacts when requested.
    if (filters.requireEmail) collected = collected.filter((p) => p.has_email === true);
    if (filters.requirePhone)
      collected = collected.filter(
        (p) => p.has_direct_phone === true || p.has_direct_phone === "Yes",
      );
    const people = collected.slice(0, wanted).map(normalizePerson);
    if (!people.length) return json({ demo: true, reason: "no_results" });
    return json({ demo: false, people });
  }
  // Nothing came back. Surface the reason so the banner can explain it.
  if (lastError) {
    return json({
      demo: true,
      reason: "apollo_error",
      status: lastError.status,
      detail: lastError.detail,
    });
  }
  // No error, just no matches for these filters.
  return json({ demo: true, reason: "no_results" });
}

/* --------------------------------------------------------------------- */
/* Reveal — use Apollo's data to power a Google (Serper) search            */
/* --------------------------------------------------------------------- */

export interface EnrichInput {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  domain?: string; // company website / domain
  organizationName?: string;
  linkedin?: string;
  rating?: number;
  reviews?: number;
  phone?: string;
}

export type EnrichRow = {
  id: string; email: string; phone: string; website: string; source: string; sourceUrl: string;
  name: string; title: string; linkedin: string; mx: boolean | null; guessed: boolean;
  score: number; scoreReasons: string[]; signals: SiteSignals | null;
  ai: { need: number; reasons: string[]; pitch: string; gap: string; siteQuality: string } | null;
};

/** One website may take at most this long; a slow site can no longer stall a whole reveal. */
const SITE_TIMEOUT_MS = 25_000;

export async function enrichPeople(env: Env, people: EnrichInput[], opts: { usePaid?: boolean; useClaude?: boolean; revealPhone?: boolean; findLinkedin?: boolean; allowGuesses?: boolean } = {}): Promise<{ results: EnrichRow[]; warnings: string[] }> {
  if (!people.length) return { results: [], warnings: [] };
  // Paid sources are OPT-IN per call. Default is free only.
  const usePaid = opts.usePaid === true;
  const apolloKey = usePaid ? secret(env, "APOLLO_API_KEY") : undefined;
  const hunterKey = usePaid ? secret(env, "HUNTER_API_KEY") : undefined;
  // Cheap Google (Serper ≈ $1/1k) is allowed as a fallback even without usePaid; SerpApi only with usePaid.
  const serperKey = secret(env, "SERPER_API_KEY");
  const serpapiKey = usePaid ? secret(env, "SERPAPI_API_KEY") : undefined;
  let googleKey = serperKey || serpapiKey;
  // Provider problems (quota used up, bad key) — shown once in the scraper banner.
  const warnings = new Set<string>();
  const warn = (w: string) => warnings.add(w);
  // No searches left / key rejected: don't ask again for every next business.
  let googleOff = false;
  const stopGoogle = () => {
    // Serper empty (or its key rejected) and "Paid fallback" is on with a
    // SerpApi key: carry on with SerpApi instead of stopping.
    if (googleKey && googleKey === serperKey && serpapiKey && serpapiKey !== serperKey) {
      googleKey = serpapiKey;
      warn("Switched to SerpApi for the Google lookups (Serper has no searches left)");
    } else googleOff = true;
  };

  const results = people.map((p) => ({
    id: p.id,
    email: "",
    phone: "",
    website: cleanDomain(p.domain),
    source: "",
    sourceUrl: "",
    name: "",
    title: "",
    linkedin: "",
    mx: null as boolean | null,
    guessed: false,
    score: 0,
    scoreReasons: [] as string[],
    signals: null as SiteSignals | null,
    ai: null as {
      need: number;
      reasons: string[];
      pitch: string;
      gap: string;
      siteQuality: string;
    } | null,
  }));
  const byId = new Map(results.map((r) => [r.id, r]));

  // 0) FREE pass — read each company's own website. Cached per domain for 30 days,
  //    tiered crawl, Claude only when the pages didn't already name owner + email.
  const cacheDb = Db.available(env) ? new Db(env) : null;
  const aiInstructions = cacheDb
    ? (
        await cacheDb
          .one<{ ai_instructions?: string }>(
            "outreach_settings",
            "id=eq.singleton&select=ai_instructions",
          )
          .catch(() => null)
      )?.ai_instructions || ""
    : "";
  let slowSites = 0;
  await enrichMany(people, 6, async (p) => {
    const r = byId.get(p.id);
    if (!r || !r.website) return;
    const prof = await withTimeout(enrichSite(env, {
      onWarn: warn,
      instructions: aiInstructions,
      findLinkedin: opts.findLinkedin,
      website: r.website,
      company: p.organizationName || "",
      industry: (p as { industry?: string }).industry || "",
      city: (p as { city?: string }).city || "",
      rating: p.rating,
      reviews: p.reviews,
      ownerName: p.name,
      useClaude: opts.useClaude !== false,
      db: cacheDb,
    }), SITE_TIMEOUT_MS, "website").catch(() => {
      slowSites++;
      return null;
    });
    if (!prof) return;
    r.ai = prof.ai;
    r.website = prof.website || r.website;
    r.mx = prof.mx;
    r.signals = prof.signals;
    if (prof.linkedin && !r.linkedin) r.linkedin = prof.linkedin;
    if (!r.phone && prof.phone) r.phone = prof.phone;
    if (prof.name && !p.name) r.name = prof.name;
    if (prof.title) r.title = prof.title;
    if (prof.email && !prof.emailGuessed) {
      r.email = prof.email;
      r.source = "Website";
      r.sourceUrl = `https://${prof.website}${prof.emailPage && prof.emailPage !== "/" ? prof.emailPage : ""}`;
    } else if (prof.email && prof.emailGuessed) {
      // keep as a guess candidate; the later pattern step will flag it
      (r as { _guess?: string })._guess = prof.email;
    }
  });

  // 1) Apollo enrichment (paid, opt-in): emails + websites + phones, one batch call.
  if (apolloKey) {
    try {
      const missing = people.filter((p) => {
        const r = byId.get(p.id);
        return r && (!r.email || (opts.revealPhone && !r.phone));
      });
      const matches = missing.length
        ? await apolloBulkMatch(apolloKey, missing, !!opts.revealPhone)
        : [];
      matches.forEach((m, i) => {
        const r = byId.get(missing[i].id);
        if (!r || !m) return;
        if (m.email) {
          r.email = m.email;
          r.source = "Apollo";
        }
        if (m.website && !r.website) r.website = m.website;
        if (m.phone && opts.revealPhone) r.phone = m.phone;
      });
    } catch {
      /* fall through to Google/Hunter */
    }
  }

  // 2) Per-contact gap-filling with Hunter + Google for anyone Apollo missed
  //    (four at a time, each lookup time-limited).
  await enrichMany(people, 4, async (p) => {
    const r = byId.get(p.id);
    if (!r) return;
    if (r.email && (!opts.revealPhone || r.phone)) return;

    // 2a) Find the company website via Google if we still don't have one.
    if (!r.website && googleKey && !googleOff && p.organizationName) {
      try {
        const key = googleKey;
        let site = await withTimeout(googleFindWebsite(key, p.organizationName, warn, stopGoogle), 12_000, "website search");
        // Just switched provider (the first one is out of searches): ask the new one.
        if (!site && googleKey && googleKey !== key && !googleOff)
          site = await withTimeout(googleFindWebsite(googleKey, p.organizationName, warn, stopGoogle), 12_000, "website search");
        if (site && !NOT_A_WEBSITE.test(site)) r.website = site;
      } catch {
        /* skip */
      }
    }
    const domain = cleanDomain(r.website);

    // 2b) Email via Hunter (needs name + domain).
    if (!r.email && hunterKey && domain) {
      const first = p.firstName || p.name?.split(" ")[0] || "";
      const last = p.lastName || p.name?.split(" ").slice(-1)[0] || "";
      if (first && last) {
        try {
          const u = new URL("https://api.hunter.io/v2/email-finder");
          u.searchParams.set("domain", domain);
          u.searchParams.set("first_name", first);
          u.searchParams.set("last_name", last);
          u.searchParams.set("api_key", hunterKey);
          const res = await fetch(u.toString(), { signal: AbortSignal.timeout(12_000) });
          if (res.ok) {
            const d = (await res.json()) as {
              data?: { email?: string; phone_number?: string; sources?: { uri?: string }[] };
            };
            if (d.data?.email) {
              r.email = d.data.email;
              r.source = "Hunter";
              r.sourceUrl = d.data.sources?.find((s) => s.uri)?.uri ?? "";
              if (opts.revealPhone && d.data.phone_number) r.phone = d.data.phone_number;
            }
          }
        } catch {
          /* fall through to Google */
        }
      }
    }

    // 2c) Email via Google search (last resort), tracking the source URL. Only
    //     an address that belongs to THIS business is accepted.
    if (!r.email && googleKey && !googleOff) {
      const q = [
        p.name ? `"${p.name}"` : "",
        p.organizationName ? `"${p.organizationName}"` : "",
        domain ? `"@${domain}"` : "",
        opts.revealPhone ? "email OR phone" : "email",
      ]
        .filter(Boolean)
        .join(" ");
      try {
        const key = googleKey;
        let { blob, firstLink, error, stop } = await withTimeout(googleSearch(key, q), 12_000, "email search");
        if (error) warn(error);
        if (stop) {
          stopGoogle();
          // Switched to the other provider: ask it instead.
          if (googleKey && googleKey !== key && !googleOff) {
            ({ blob, firstLink, error, stop } = await withTimeout(googleSearch(googleKey, q), 12_000, "email search"));
            if (error) warn(error);
            if (stop) stopGoogle();
          }
        }
        const found = pickBusinessEmail(blob, domain, { company: p.organizationName, owner: r.name || p.name });
        if (found) {
          r.email = found;
          r.source = "Google";
          r.sourceUrl = firstLink;
        }
        if (opts.revealPhone && !r.phone) r.phone = pickPhone(blob);
      } catch {
        /* leave locked */
      }
    }
  });
  if (slowSites) warn(`${slowSites} website${slowSites === 1 ? "" : "s"} took longer than ${SITE_TIMEOUT_MS / 1000} s and ${slowSites === 1 ? "was" : "were"} skipped`);

  // 3) Optional last resort: a pattern guess (info@…) on a domain that accepts
  //    mail. OFF unless asked for — guesses look like real addresses but often
  //    bounce or reach nobody. Flagged so the UI and sequences treat them as such.
  for (const r of results) {
    if (!opts.allowGuesses) break;
    if (r.email || !r.website) continue;
    const pre = (r as { _guess?: string })._guess;
    if (pre) {
      r.email = pre;
      r.source = "Guess";
      r.guessed = true;
      continue;
    }
    const mx = r.mx ?? (await hasMx(r.website));
    r.mx = mx;
    if (mx !== true) continue;
    const who = (r.name || people.find((p) => p.id === r.id)?.name || "")
      .replace(/^Dr\.?\s+/i, "")
      .trim();
    const [first, ...rest] = who.split(/\s+/);
    const last = rest.at(-1) || "";
    const f = (first || "").toLowerCase().replace(/[^a-z]/g, "");
    const l = last.toLowerCase().replace(/[^a-z]/g, "");
    r.email = f && l ? `${f}@${r.website}` : `info@${r.website}`;
    r.source = "Guess";
    r.guessed = true;
  }

  // 4) Score every contact for prioritisation.
  for (const r of results) {
    const p = people.find((x) => x.id === r.id);
    const sc = scoreLead({
      rating: p?.rating,
      reviews: p?.reviews,
      website: r.website,
      name: r.name || p?.name || "",
      email: r.email,
      emailGuessed: r.guessed,
      mx: r.mx,
      phone: r.phone || p?.phone || "",
      signals: r.signals,
      aiNeed: r.ai?.need ?? null,
    });
    r.score = sc.score;
    r.scoreReasons = r.ai?.reasons?.length
      ? [...sc.reasons, ...r.ai.reasons.map((x) => `• ${x}`)]
      : sc.reasons;
  }

  return { results: results as EnrichRow[], warnings: Array.from(warnings) };
}

async function enrich(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let payload: {
    people?: EnrichInput[];
    revealPhone?: boolean;
    usePaid?: boolean;
    useClaude?: boolean;
    findLinkedin?: boolean;
  } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const people = (payload.people ?? []).slice(0, 10);
  if (!people.length) return json({ results: [] });
  const { results, warnings } = await enrichPeople(env, people, payload);
  return json({ demo: false, results, warnings: Array.from(warnings) });
}

/** SerpApi.com keys are 64 hex chars; Serper.dev keys are ~40. */
function isSerpApi(key: string): boolean {
  return key.length >= 50;
}

/** Provider-side URLs that must never be mistaken for a business website. */
const PROVIDER_URL_RE =
  /https?:\/\/[^"\\ ]*(serpapi\.com|serper\.dev|google\.com\/search|gstatic\.com|googleusercontent\.com)[^"\\ ]*/gi;

/**
 * Why a search provider refused a request, in plain words, and whether to stop
 * asking it for the rest of this scan (no credits / bad key won't fix itself).
 * Serper answers "out of credits" with a 400 and explains it in the body — the
 * old message only showed "HTTP 400".
 */
export function searchProviderProblem(
  provider: "SerpApi" | "Serper",
  status: number,
  body = "",
): { text: string; stop: boolean } {
  // The provider's own words are only used to tell the cases apart — never
  // shown (they can carry account details).
  let said = "";
  try {
    const j = JSON.parse(body) as { message?: string; error?: string };
    said = String(j.message || j.error || "");
  } catch {
    said = body;
  }
  if (/credit|quota|plan|run out|limit|exceed/i.test(said) || status === 429 || status === 402)
    return {
      text: `${provider}: no searches left on your ${provider} account — finding websites/emails through Google is skipped until you top it up; free website reading carries on`,
      stop: true,
    };
  if (status === 401 || status === 403 || /api key|unauthori[sz]ed|forbidden/i.test(said))
    return { text: `${provider}: key rejected — check the ${provider} key in Settings`, stop: true };
  if (status >= 500) return { text: `${provider}: temporary problem on their side (${status})`, stop: false };
  return { text: `${provider}: refused a search (HTTP ${status})`, stop: false };
}

/** Run a Google search via whichever provider the key belongs to. */
async function googleSearch(
  key: string,
  q: string,
): Promise<{ blob: string; firstLink: string; error?: string; stop?: boolean }> {
  if (isSerpApi(key)) {
    const u = new URL("https://serpapi.com/search.json");
    u.searchParams.set("engine", "google");
    u.searchParams.set("q", q);
    u.searchParams.set("num", "10");
    u.searchParams.set("api_key", key);
    const res = await fetch(u.toString());
    if (!res.ok) {
      const p = searchProviderProblem("SerpApi", res.status, await res.text().catch(() => ""));
      return { blob: "", firstLink: "", error: p.text, stop: p.stop };
    }
    const d = (await res.json()) as {
      organic_results?: { link?: string; title?: string; snippet?: string }[];
      knowledge_graph?: { website?: string; description?: string; title?: string };
      answer_box?: unknown;
      error?: string;
    };
    if (d.error && /limit|exceed|run out|plan/i.test(d.error)) {
      const p = searchProviderProblem("SerpApi", 429, d.error);
      return { blob: "", firstLink: "", error: p.text, stop: true };
    }
    // Only the fields that describe the RESULT. The raw SerpApi JSON is full of
    // serpapi.com links (serpapi_link, thumbnails, pagination) that used to leak
    // in as "the website".
    const organic = (d.organic_results ?? []).map((o) => ({
      link: o.link,
      title: o.title,
      snippet: o.snippet,
    }));
    const kg = d.knowledge_graph
      ? {
          website: d.knowledge_graph.website,
          title: d.knowledge_graph.title,
          description: d.knowledge_graph.description,
        }
      : {};
    return {
      blob: (JSON.stringify(organic) + JSON.stringify(kg)).replace(PROVIDER_URL_RE, ""),
      firstLink: organic[0]?.link ?? "",
    };
  }
  // Serper.dev
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q, num: 10 }),
  });
  if (!res.ok) {
    const p = searchProviderProblem("Serper", res.status, await res.text().catch(() => ""));
    return { blob: "", firstLink: "", error: p.text, stop: p.stop };
  }
  const d = (await res.json()) as {
    organic?: { link?: string; title?: string; snippet?: string }[];
    knowledgeGraph?: { website?: string; title?: string; description?: string };
  };
  const organic = (d.organic ?? []).map((o) => ({
    link: o.link,
    title: o.title,
    snippet: o.snippet,
  }));
  return {
    blob: (JSON.stringify(organic) + JSON.stringify(d.knowledgeGraph ?? {})).replace(
      PROVIDER_URL_RE,
      "",
    ),
    firstLink: organic[0]?.link ?? "",
  };
}

const SOCIAL_RE =
  /(serpapi\.com|serper\.dev|facebook|instagram|linkedin|twitter|x\.com|youtube|yelp|wikipedia|crunchbase|bloomberg|indeed|glassdoor|tripadvisor|mapquest|yellowpages|google\.|g\.page|goo\.gl|business\.site|bing\.|duckduckgo|angi\.|homeadvisor|thumbtack|houzz|nextdoor|bbb\.org|manta\.|chamberofcommerce|zoominfo|dnb\.com|buzzfile|cylex|hotfrog)/i;

/** Find a company's website domain via Google (skips social/directory links). */
async function googleFindWebsite(
  key: string,
  company: string,
  warn?: (w: string) => void,
  onStop?: () => void,
): Promise<string> {
  const { blob, firstLink, error, stop } = await googleSearch(key, `${company} official website`);
  if (error) warn?.(error);
  if (stop) onStop?.();
  if (firstLink && !SOCIAL_RE.test(firstLink)) {
    const dom = cleanDomain(firstLink);
    if (dom && dom.includes(".")) return dom;
  }
  const links = blob.match(/https?:\/\/[^"\\ ]+/g) ?? [];
  for (const l of links) {
    if (SOCIAL_RE.test(l)) continue;
    const dom = cleanDomain(l);
    if (dom && dom.includes(".")) return dom;
  }
  return "";
}

/** Apollo bulk people enrichment — emails, websites and phones (Professional plan). */
async function apolloBulkMatch(
  key: string,
  people: EnrichInput[],
  revealPhone: boolean,
): Promise<({ email: string; website: string; phone: string } | null)[]> {
  const details = people.map((p) => ({
    id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    name: p.name,
    organization_name: p.organizationName,
    domain: cleanDomain(p.domain) || undefined,
    linkedin_url: p.linkedin,
  }));
  const url = new URL("https://api.apollo.io/api/v1/people/bulk_match");
  url.searchParams.set("reveal_personal_emails", "true");
  if (revealPhone) url.searchParams.set("reveal_phone_number", "true");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      Accept: "application/json",
      "X-Api-Key": key,
    },
    body: JSON.stringify({
      details,
      reveal_personal_emails: true,
      reveal_phone_number: revealPhone,
    }),
  });
  if (!res.ok) return people.map(() => null);
  const data = (await res.json()) as { matches?: (ApolloPerson | null)[] };
  return (data.matches ?? []).map((m) => {
    if (!m) return null;
    const rawEmail = m.email ?? "";
    const locked =
      !rawEmail ||
      /not_unlocked|email_not_unlocked|locked/i.test(rawEmail) ||
      m.email_status === "unavailable";
    const org = m.organization ?? {};
    const website = (org.website_url || org.primary_domain || "")
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    const phone = m.phone_numbers?.[0]?.sanitized_number || m.phone_numbers?.[0]?.raw_number || "";
    return { email: locked ? "" : rawEmail, website, phone };
  });
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;

/** Best-effort phone extraction from a text blob. */
function pickPhone(text: string): string {
  const m = text.match(PHONE_RE);
  if (!m) return "";
  // Pick the first candidate with a sensible number of digits (8–15).
  for (const cand of m) {
    const digits = cand.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return cand.trim();
  }
  return "";
}

/* --------------------------------------------------------------------- */
/* Hunter.io — find every public email at a company domain                 */
/* --------------------------------------------------------------------- */

async function hunterDomain(url: URL, env: Env): Promise<Response> {
  const key = secret(env, "HUNTER_API_KEY");
  const domain = cleanDomain(url.searchParams.get("domain") ?? "");
  if (!domain) return json({ error: "missing domain" }, 400);
  if (!key) return json({ demo: true, emails: [] });
  try {
    const u = new URL("https://api.hunter.io/v2/domain-search");
    u.searchParams.set("domain", domain);
    u.searchParams.set("limit", url.searchParams.get("limit") ?? "10");
    const sen = url.searchParams.get("seniority");
    if (sen) u.searchParams.set("seniority", sen);
    u.searchParams.set("api_key", key);
    const res = await fetch(u.toString());
    if (!res.ok) return json({ error: `hunter ${res.status}` }, 502);
    const d = (await res.json()) as {
      data?: { emails?: Array<Record<string, unknown>> };
    };
    const emails = (d.data?.emails ?? []).map((e) => ({
      email: String(e.value ?? ""),
      name: [e.first_name, e.last_name].filter(Boolean).join(" "),
      title: String(e.position ?? ""),
      seniority: String(e.seniority ?? ""),
      department: String(e.department ?? ""),
      confidence: Number(e.confidence ?? 0),
    }));
    return json({ demo: false, emails });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

function cleanDomain(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim();
}

function demoEmail(p: EnrichInput): string {
  const first = (p.firstName || p.name?.split(" ")[0] || "contact").toLowerCase();
  const last = (p.lastName || p.name?.split(" ").slice(-1)[0] || "info").toLowerCase();
  const dom = cleanDomain(p.domain) || "example.com";
  return `${first}.${last}@${dom}`.replace(/\s+/g, "");
}

interface ApolloPerson {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  seniority?: string;
  email?: string;
  email_status?: string;
  has_email?: boolean;
  has_direct_phone?: boolean | string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  phone_numbers?: Array<{ raw_number?: string; sanitized_number?: string }>;
  organization?: {
    name?: string;
    website_url?: string;
    primary_domain?: string;
    phone?: string;
    primary_phone?: { number?: string };
    industry?: string;
  };
}

function normalizePerson(p: ApolloPerson) {
  const org = p.organization ?? {};
  const rawEmail = p.email ?? "";
  const locked =
    !rawEmail ||
    /not_unlocked|email_not_unlocked|locked/i.test(rawEmail) ||
    p.email_status === "unavailable";
  const website = (org.website_url || org.primary_domain || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const phone =
    p.phone_numbers?.[0]?.sanitized_number ||
    p.phone_numbers?.[0]?.raw_number ||
    org.primary_phone?.number ||
    org.phone ||
    "";
  return {
    id: p.id || `sp_${Math.random().toString(36).slice(2, 9)}`,
    name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown",
    title: p.title || "",
    seniority: p.seniority || "",
    email: locked ? "" : rawEmail,
    emailLocked: locked,
    phone,
    linkedin: p.linkedin_url || "",
    company: org.name || "",
    website,
    city: p.city || [p.state, p.country].filter(Boolean).join(", ") || "",
    industry: org.industry || "",
  };
}

/* --------------------------------------------------------------------- */
/* GoHighLevel — send email (best-effort forward)                          */
/* --------------------------------------------------------------------- */

interface GhlPayload {
  apiKey?: string;
  companyId?: string;
  locationId?: string;
  to?: { name: string; email: string }[];
  subject?: string;
  body?: string;
  fromName?: string;
  fromEmail?: string;
}

async function ghlSend(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let payload: GhlPayload = {};
  try {
    payload = (await request.json()) as GhlPayload;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  // Prefer the key currently entered in Settings; fall back to the server secret.
  // This avoids a stale server key silently overriding a newly scoped GHL token.
  const key = (payload.apiKey || secret(env, "GHL_API_KEY") || "").trim();
  const locationId = (payload.locationId || "").trim();
  const companyId = (payload.companyId || "").trim();
  const recipients = payload.to ?? [];
  if (!key) {
    return json({
      ok: true,
      simulated: true,
      message: "No GHL key on server — simulated send.",
      details: recipients.map((r) => ({ email: r.email, ok: true, simulated: true })),
    });
  }
  if (!locationId) {
    return json({
      ok: false,
      message: "Missing Location ID. Set it in Settings → GoHighLevel.",
      details: recipients.map((r) => ({ email: r.email, ok: false, error: "missing locationId" })),
    });
  }
  const jsonHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
    Accept: "application/json",
  });
  try {
    let activeKey = key;
    if (companyId) {
      const tokenRes = await fetch("https://services.leadconnectorhq.com/oauth/locationToken", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Version: "2021-07-28",
          Accept: "application/json",
        },
        body: new URLSearchParams({ companyId, locationId }).toString(),
      });
      if (!tokenRes.ok) {
        const detail = (await tokenRes.text()).slice(0, 300);
        return json({
          ok: false,
          message: "GHL could not create a location-scoped token from that Agency token.",
          details: recipients.map((r) => ({
            email: r.email,
            ok: false,
            status: tokenRes.status,
            error: `location token: ${detail}`,
          })),
        });
      }
      const tokenJson = (await tokenRes.json()) as { accessToken?: string };
      if (tokenJson.accessToken) activeKey = tokenJson.accessToken;
    }
    const ghlHeaders = jsonHeaders(activeKey);

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const jitter = () => Math.floor(Math.random() * 250);

    // Fetch with automatic retry on 429 / 5xx. Honors Retry-After when present.
    async function fetchWithRetry(
      url: string,
      init: RequestInit,
      maxRetries: number,
    ): Promise<Response> {
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await fetch(url, init);
        if (res.status !== 429 && res.status < 500) return res;
        if (attempt >= maxRetries) return res;
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 10000)
            : Math.min(1000 * 2 ** attempt, 8000) + jitter();
        await sleep(backoff);
        attempt++;
      }
    }

    // Sequential send — GHL caps at ~10 req/sec/location and each recipient uses 2 calls.
    const details: Array<{
      email: string;
      ok: boolean;
      status?: number;
      error?: string;
      simulated?: boolean;
    }> = [];
    for (let i = 0; i < recipients.length; i++) {
      const rcpt = recipients[i];
      try {
        const [firstName, ...rest] = (rcpt.name || rcpt.email).split(" ");
        const upsertRes = await fetchWithRetry(
          "https://services.leadconnectorhq.com/contacts/upsert",
          {
            method: "POST",
            headers: ghlHeaders,
            body: JSON.stringify({
              locationId,
              email: rcpt.email,
              firstName: firstName || rcpt.email,
              lastName: rest.join(" ") || undefined,
            }),
          },
          4,
        );
        if (!upsertRes.ok) {
          const detail = (await upsertRes.text()).slice(0, 300);
          details.push({
            email: rcpt.email,
            ok: false,
            status: upsertRes.status,
            error: `upsert: ${detail}`,
          });
        } else {
          const upsertJson = (await upsertRes.json()) as { contact?: { id?: string }; id?: string };
          const contactId = upsertJson.contact?.id ?? upsertJson.id;
          if (!contactId) {
            details.push({ email: rcpt.email, ok: false, error: "upsert returned no contactId" });
          } else {
            await sleep(150);
            const res = await fetchWithRetry(
              "https://services.leadconnectorhq.com/conversations/messages",
              {
                method: "POST",
                headers: ghlHeaders,
                body: JSON.stringify({
                  type: "Email",
                  contactId,
                  subject: payload.subject,
                  html: (payload.body ?? "").replace(/\n/g, "<br>"),
                  emailFrom: payload.fromName
                    ? `${payload.fromName} <${payload.fromEmail}>`
                    : payload.fromEmail,
                }),
              },
              4,
            );
            if (res.ok) {
              details.push({ email: rcpt.email, ok: true, status: res.status });
            } else {
              const detail = (await res.text()).slice(0, 300);
              details.push({ email: rcpt.email, ok: false, status: res.status, error: detail });
            }
          }
        }
      } catch (e) {
        details.push({ email: rcpt.email, ok: false, error: (e as Error).message });
      }
      // Small pace between recipients to stay under GHL's per-second cap.
      if (i < recipients.length - 1) await sleep(200);
    }

    const sent = details.filter((d) => d.ok).length;
    return json({
      ok: sent > 0,
      message:
        sent === details.length
          ? `Delivered to all ${sent} recipient(s) via GoHighLevel.`
          : `Delivered ${sent}/${details.length} — see details below.`,
      details,
    });
  } catch (e) {
    return json({ ok: false, message: (e as Error).message, details: [] }, 500);
  }
}

/* --------------------------------------------------------------------- */
/* Business discovery — cheapest provider first                            */
/*   Google Places (New)  → free monthly allowance, best data              */
/*   Serper.dev            → ~$1 per 1,000 searches                         */
/*   SerpApi               → legacy, expensive                               */
/*   OpenStreetMap         → free, patchier coverage                         */
/* --------------------------------------------------------------------- */

type DiscoverProvider = "places" | "serper" | "serpapi" | "osm" | "apify" | "selfhost";

export interface DiscoverFilters {
  location?: string;
  industry?: string;
  perPage?: number;
  providers?: DiscoverProvider[];
  /** From /api/geocode — lets Places bias to the area and OSM query a bbox. */
  lat?: number;
  lng?: number;
  bbox?: [number, number, number, number];
  /** Run Apify synchronously inside discoverCore (cron). The browser polls instead. */
  apifyWait?: boolean;
  /** Universal filters, applied to every source before results are returned. */
  radiusKm?: number; // keep businesses within this distance of lat/lng
  minRating?: number; // e.g. 4.0
  minReviews?: number; // e.g. 10
  maxReviews?: number; // e.g. 500 — a cheap way to exclude chains
  /** Also search common synonyms of each keyword (default on). */
  expandKeywords?: boolean;
  /** Hide businesses already seen in any earlier scan / in Leads (default on). */
  hideSeen?: boolean;
  /** When the scan (all its keywords and sources) started — what it found itself isn't "seen before". */
  since?: string;
}

/** Domains that are never the business's own site. */
const NOT_A_WEBSITE =
  /(^|\.)(serpapi\.com|serper\.dev|google\.com|google\.[a-z]{2,3}|g\.page|goo\.gl|business\.site|facebook\.com|fb\.com|instagram\.com|linkedin\.com|yelp\.com|yellowpages\.com|linktr\.ee|wixsite\.com|nextdoor\.com|angi\.com|homeadvisor\.com|thumbtack\.com|houzz\.com|bark\.com|trustpilot\.com|mapquest\.com|bing\.com)$/i;

/** Grid of search points across the area. 1 point for small pulls, up to 5x5 for big ones. */
function tilePoints(
  f: DiscoverFilters,
  wanted: number,
  queryCount: number,
): { lat?: number; lng?: number; radiusM?: number; label?: string }[] {
  const hasCentre = typeof f.lat === "number" && typeof f.lng === "number";
  if (typeof f.lat !== "number" || typeof f.lng !== "number") return [{ label: f.location }];
  const centerLat = f.lat;
  const centerLng = f.lng;
  const perQuery = Math.ceil(wanted / Math.max(1, queryCount));
  const n =
    perQuery <= 60 ? 1 : perQuery <= 120 ? 2 : perQuery <= 220 ? 3 : perQuery <= 350 ? 4 : 5;
  const radiusKm =
    f.radiusKm ||
    (f.bbox ? Math.min(60, Math.max(8, Math.abs(f.bbox[1] - f.bbox[0]) * 111 * 0.6)) : 20);
  if (n === 1) return [{ lat: f.lat, lng: f.lng, radiusM: radiusKm * 1000 }];
  const pts: { lat: number; lng: number; radiusM: number }[] = [];
  const step = (2 * radiusKm) / n; // km between tile centres
  const tileR = Math.max(2000, (step / 1.4) * 1000);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dy = -radiusKm + step * (i + 0.5);
      const dx = -radiusKm + step * (j + 0.5);
      const lat = f.lat + dy / 111;
      const lng = f.lng + dx / (111 * Math.cos((f.lat * Math.PI) / 180));
      pts.push({ lat, lng, radiusM: tileR });
    }
  }
  // Centre tile first so small result sets are still the most central businesses.
  pts.sort(
    (a, b) => distanceKm(centerLat, centerLng, a.lat, a.lng) - distanceKm(centerLat, centerLng, b.lat, b.lng),
  );
  return pts;
}

/** Cheap synonym expansion so "roofing" also finds "roofer" and "roof repair" listings. */
const KEYWORD_SYNONYMS: Record<string, string[]> = {
  roofing: ["roofer", "roof repair", "roofing contractor"],
  roofer: ["roofing", "roof repair"],
  plumbing: ["plumber", "plumbing contractor", "drain cleaning"],
  plumber: ["plumbing", "drain cleaning"],
  hvac: ["heating and air conditioning", "furnace repair", "ac repair"],
  electrician: ["electrical contractor", "electrical services"],
  landscaping: ["landscaper", "lawn care", "landscape contractor"],
  "tree service": ["tree removal", "arborist", "tree trimming"],
  "tree specialists": ["tree service", "tree removal", "arborist"],
  "christmas light installation": [
    "holiday lighting",
    "christmas light installer",
    "holiday light installation",
  ],
  "holiday lighting": ["christmas light installation", "christmas lights installer"],
  "christmas lights": ["christmas light installation", "holiday lighting"],
  dentist: ["dental clinic", "dental office", "family dentistry"],
  dental: ["dentist", "dental clinic"],
  chiropractor: ["chiropractic clinic"],
  "med spa": ["medical spa", "aesthetic clinic"],
  "law firm": ["attorney", "lawyer"],
  accountant: ["cpa", "accounting firm", "bookkeeping"],
  "auto repair": ["mechanic", "car repair shop"],
  dakwerker: ["dakwerken", "dakdekker"],
  dakwerkers: ["dakwerken", "dakdekker"],
  tandarts: ["tandartspraktijk", "tandartsen"],
  loodgieter: ["sanitair", "loodgieterij"],
  tuinaanleg: ["tuinaannemer", "tuinonderhoud"],
};
function expandKeyword(kw: string, on: boolean): string[] {
  const k = kw.trim();
  if (!on) return [k];
  const syn = KEYWORD_SYNONYMS[k.toLowerCase()] ?? [];
  return [k, ...syn.filter((x) => x.toLowerCase() !== k.toLowerCase())];
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Universal post-filters. Rows with unknown rating/reviews/coords are kept (we can't judge them). */
function applyUniversalFilters<
  T extends { rating?: number; reviews?: number; lat?: number; lng?: number },
>(list: T[], f: DiscoverFilters): { kept: T[]; dropped: number } {
  let dropped = 0;
  const kept = list.filter((b) => {
    if (f.radiusKm && f.lat != null && f.lng != null && b.lat != null && b.lng != null) {
      if (distanceKm(f.lat, f.lng, b.lat, b.lng) > f.radiusKm) return (dropped++, false);
    }
    if (f.minRating && typeof b.rating === "number" && b.rating < f.minRating)
      return (dropped++, false);
    if (f.minReviews && typeof b.reviews === "number" && b.reviews < f.minReviews)
      return (dropped++, false);
    if (f.maxReviews && typeof b.reviews === "number" && b.reviews > f.maxReviews)
      return (dropped++, false);
    return true;
  });
  return { kept, dropped };
}

async function apifyStartRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!apifyAvailable(env)) return json({ ok: false, error: "APIFY_TOKEN is not set" }, 400);
  const f = (await request.json().catch(() => ({}))) as DiscoverFilters;
  const queries = (f.industry || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const location = (f.location || "").trim();
  if (!location) return json({ ok: false, error: "location required" }, 400);
  const r = await apifyStart(env, {
    queries: queries.length ? queries : ["business"],
    location,
    max: Math.max(20, Math.min(f.perPage || 100, 1000)),
  });
  if ("error" in r) return json({ ok: false, error: r.error }, 502);
  return json({ ok: true, runId: r.run.id, datasetId: r.run.defaultDatasetId });
}

/** Self-hosted Maps scraper: start a job, the browser polls /status. */
async function gmapsStartRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!gmapsSelfAvailable(env))
    return json({ ok: false, error: "Connect your own Maps scraper before searching." }, 400);
  const f = (await request.json().catch(() => ({}))) as DiscoverFilters;
  if (typeof f.location !== "string" || f.location.length > 200 ||
      (f.industry != null && (typeof f.industry !== "string" || f.industry.length > 2000)) ||
      (f.perPage != null && !Number.isFinite(f.perPage))) return json({ ok: false, error: "Invalid search details." }, 400);
  const queries = (f.industry || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const location = (f.location || "").trim();
  if (!location) return json({ ok: false, error: "location required" }, 400);
  const r = await gmapsSelfStart(env, {
    queries: queries.length ? queries : ["business"],
    location,
    max: Math.max(20, Math.min(f.perPage || 100, 2000)),
    lat: f.lat,
    lng: f.lng,
    radiusKm: f.radiusKm || undefined,
  });
  if ("error" in r) return json({ ok: false, error: r.error }, 502);
  return json({ ok: true, jobId: r.job.id });
}

async function gmapsStatusRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return json({ error: "GET only" }, 405);
  const u = new URL(request.url);
  const id = u.searchParams.get("job") || "";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return json({ ok: false, error: "Valid job required" }, 400);
  const st = await gmapsSelfStatus(env, id);
  const status = st?.status || "unknown";
  if (!GMAPS_DONE.has(status)) return json({ ok: true, status, done: false });
  if (status === "failed" || status === "error")
    return json({
      ok: true,
      status,
      done: true,
      businesses: [],
      error: `Maps scraper job ${status}`,
    });
  const found = await gmapsSelfItems(
    env,
    id,
    u.searchParams.get("city") || "",
    u.searchParams.get("industry") || "",
  );
  const { businesses, notes } = await onlyNew(env, found, u);
  return json({
    ok: true,
    status,
    done: true,
    businesses: businesses.map((b) => ({ ...b, source: "Google Maps" })),
    notes,
  });
}

/** Stop a run the browser gave up waiting for, so it stops costing credits. */
async function apifyAbortRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const u = new URL(request.url);
  const runId = u.searchParams.get("run") || "";
  if (!runId) return json({ ok: false, error: "run required" }, 400);
  await apifyAbort(env, runId);
  return json({ ok: true });
}

async function apifyStatusRoute(request: Request, env: Env): Promise<Response> {
  const u = new URL(request.url);
  const runId = u.searchParams.get("run") || "";
  const datasetId = u.searchParams.get("dataset") || "";
  if (!runId || !datasetId) return json({ ok: false, error: "run and dataset required" }, 400);
  const st = await apifyRunStatus(env, runId);
  const status = st?.status || "UNKNOWN";
  const finished = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status);
  if (!finished) return json({ ok: true, status, done: false });
  const found = await apifyItems(
    env,
    datasetId,
    u.searchParams.get("city") || "",
    u.searchParams.get("industry") || "",
  );
  const { businesses, notes } = await onlyNew(env, found, u);
  return json({
    ok: true,
    status,
    done: true,
    businesses: businesses.map((b) => ({ ...b, source: "Google Maps" })),
    notes,
  });
}

/** Bulk results (own Maps scraper, Apify) get the same "Only new" memory as Google. */
async function onlyNew<T extends { company: string; website?: string; phone?: string; city?: string; industry?: string }>(
  env: Env,
  found: T[],
  u: URL,
): Promise<{ businesses: T[]; notes: string[] }> {
  if (!Db.available(env)) return { businesses: found, notes: [] };
  const db = new Db(env);
  const { kept, notes } = await hideSeenBusinesses(db, found, {
    hideSeen: u.searchParams.get("hideSeen") !== "0",
    since: u.searchParams.get("since"),
  });
  await rememberBusinesses(db, kept);
  return { businesses: kept, notes };
}

async function discoverBusinesses(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let f: DiscoverFilters = {};
  try {
    f = (await request.json()) as DiscoverFilters;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const r = await discoverCore(f, env);
  return json(r.businesses.length ? { demo: false, ...r } : { demo: true, reason: r.reason, ...r });
}

export interface DiscoverResult {
  businesses: (DiscoveredBusiness & { provider: string })[];
  used: Record<string, number>;
  available: Record<string, boolean>;
  errors: string[];
  reason?: string;
}

/** Provider waterfall shared by the UI route and scheduled saved searches. */
export async function discoverCore(f: DiscoverFilters, env: Env): Promise<DiscoverResult> {
  const wanted = Math.min(Math.max(f.perPage ?? 25, 1), 1000);
  const keywords = (f.industry ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 6);
  const queries = keywords.length ? keywords : ["business"];
  const location = (f.location ?? "").trim();
  const city = location.split(",")[0] || "";
  const want = f.providers?.length
    ? f.providers
    : (["places", "serper", "serpapi", "osm"] as DiscoverProvider[]);

  const placesKey = secret(env, "GOOGLE_PLACES_API_KEY");
  const serperKey = secret(env, "SERPER_API_KEY");
  const serpapiKey = secret(env, "SERPAPI_API_KEY");

  const byKey = new Map<string, DiscoveredBusiness & { provider: string }>();
  const used: Record<string, number> = {};
  const errors: string[] = [];
  const perQuery = Math.ceil(wanted / queries.length);
  // Big areas (a state, a country): search city by city instead of one point.
  const region = regionSubAreas(location, f.bbox);
  const bbox = f.bbox;
  const osmPromise =
    want.includes("osm") && bbox && !region
      ? Promise.all(
          queries.map((kw) =>
            overpassBusinesses({ keyword: kw, bbox, city, max: wanted, timeoutSec: 12 }),
          ),
        )
      : Promise.resolve([] as Awaited<ReturnType<typeof overpassBusinesses>>[]);

  const add = (b0: DiscoveredBusiness, provider: string) => {
    // Google sometimes hands back google.com / g.page / business.site or a social
    // profile as the "website". Blank those so the real-site lookup runs instead.
    const b = NOT_A_WEBSITE.test(cleanDomain(b0.website)) ? { ...b0, website: "" } : b0;
    const k =
      cleanDomain(b.website) || `${b.company.toLowerCase()}|${(b.phone || "").replace(/\D/g, "")}`;
    if (!k || byKey.has(k)) return false;
    byKey.set(k, { ...b, provider });
    used[provider] = (used[provider] ?? 0) + 1;
    return true;
  };

  if (want.includes("places") && placesKey && region) {
    // REGION MODE. Each keyword is searched in each city (biggest first), five
    // calls in flight at a time, until we have what was asked for. A city that
    // returns nothing for a keyword is skipped for the remaining keywords.
    const MAX_CALLS = 240;
    const jobs: { kw: string; area: (typeof region.areas)[number] }[] = [];
    for (const area of region.areas) for (const kw of queries) jobs.push({ kw, area });
    const dead = new Set<string>();
    let calls = 0;
    let cursor = 0;
    let quotaHit = false;
    const worker = async () => {
      while (cursor < jobs.length && byKey.size < wanted && calls < MAX_CALLS && !quotaHit) {
        const job = jobs[cursor++];
        const areaKey = job.area.label + "|" + (job.area.lat ?? "");
        if (dead.has(areaKey)) continue;
        calls++;
        const r = await placesTextSearch(placesKey, {
          keyword: job.kw,
          location: job.area.label,
          max: Math.min(60, Math.max(20, wanted - byKey.size)),
          bias:
            job.area.lat != null && job.area.lng != null
              ? { lat: job.area.lat, lng: job.area.lng, radiusM: job.area.radiusM }
              : undefined,
        });
        if (r.error && !errors.includes(r.error)) errors.push(r.error);
        if (r.quota) {
          quotaHit = true; // stop every worker — more calls just add more 429s
          break;
        }
        const city = job.area.label.split(",")[0].trim();
        for (const b of r.businesses)
          add({ ...b, city: b.city || city, source: "Google Maps" }, "places");
        if (r.businesses.length === 0) dead.add(areaKey);
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    const covered = new Set(jobs.slice(0, cursor).map((j) => j.area.label)).size;
    errors.push(
      region.kind === "cities"
        ? `Searched ${covered} of ${region.areas.length} cities in ${location} (${calls} Google calls)`
        : `Big area (${Math.round(bboxSpanKm(f.bbox))} km wide): searched ${covered} zones (${calls} Google calls)`,
    );
  } else if (want.includes("places") && placesKey) {
    // Google returns at most 60 per query+point. To get MORE than 60 for an area we
    // tile it: a grid of points across the bbox/radius, each searched separately and
    // de-duplicated. 3x3 for ~100, 4x4 for ~200, 5x5 for 300+.
    const tiles = tilePoints(f, wanted, queries.length);
    // Synonyms only when the user gave a few keywords; a preset of 15 keywords
    // already covers the ground, and tiles × keywords × synonyms adds up fast.
    const synonyms = (kw: string) =>
      expandKeyword(kw, f.expandKeywords !== false && queries.length <= 4);
    outer: for (const kw of queries) {
      for (const variant of synonyms(kw)) {
        for (const t of tiles) {
          if (byKey.size >= wanted) break outer;
          const r = await placesTextSearch(placesKey, {
            keyword: variant,
            location: t.label || location,
            max: Math.min(perQuery, 60),
            bias:
              t.lat != null && t.lng != null
                ? { lat: t.lat, lng: t.lng, radiusM: t.radiusM }
                : undefined,
          });
          if (r.error && !errors.includes(r.error)) errors.push(r.error);
          if (r.quota) break outer;
          let fresh = 0;
          for (const b of r.businesses) {
            if (add({ ...b, source: "Google Maps" }, "places")) fresh++;
            if (byKey.size >= wanted) break;
          }
          // A tile that adds nothing new means the area is exhausted for this keyword.
          if (fresh === 0 && tiles.length > 1 && r.businesses.length > 0) continue;
        }
      }
    }
  }

  if (byKey.size < wanted && want.includes("serper") && serperKey) {
    const serperPlaces = region ? region.areas.slice(0, 8).map((a) => a.label) : [location];
    const serperJobs = serperPlaces.flatMap((loc) => queries.map((kw) => ({ kw, loc })));
    for (const { kw, loc } of serperJobs) {
      if (byKey.size >= wanted) break;
      try {
        const res = await fetch("https://google.serper.dev/places", {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: loc ? `${kw} in ${loc}` : kw, num: 20 }),
        });
        if (!res.ok) {
          const p = searchProviderProblem("Serper", res.status, await res.text().catch(() => ""));
          errors.push(p.text);
          if (p.stop) break; // no credits / bad key: the next keyword won't do better
          continue;
        }
        const d = (await res.json()) as {
          places?: Array<{
            title?: string;
            address?: string;
            phoneNumber?: string;
            website?: string;
            category?: string;
            rating?: number;
            ratingCount?: number;
            cid?: string;
          }>;
        };
        for (const r of d.places ?? []) {
          add(
            {
              id: r.cid || `${(r.title || "").toLowerCase()}|${cleanDomain(r.website || "")}`,
              company: r.title || "",
              website: cleanDomain(r.website || ""),
              phone: r.phoneNumber || "",
              address: r.address || "",
              city,
              industry: r.category || kw,
              rating: r.rating,
              reviews: r.ratingCount,
              source: "Google Maps",
            },
            "serper",
          );
          if (byKey.size >= wanted) break;
        }
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }

  if (byKey.size < wanted && want.includes("serpapi") && serpapiKey && !placesKey && !serperKey) {
    for (const kw of queries) {
      if (byKey.size >= wanted) break;
      try {
        const u = new URL("https://serpapi.com/search.json");
        u.searchParams.set("engine", "google_maps");
        u.searchParams.set("q", location ? `${kw} in ${location}` : kw);
        u.searchParams.set("type", "search");
        u.searchParams.set("api_key", serpapiKey);
        const res = await fetch(u.toString());
        if (!res.ok) {
          const p = searchProviderProblem("SerpApi", res.status, await res.text().catch(() => ""));
          errors.push(p.text);
          if (p.stop) break;
          continue;
        }
        const d = (await res.json()) as {
          local_results?: Array<{
            place_id?: string;
            title?: string;
            website?: string;
            phone?: string;
            address?: string;
            type?: string;
            rating?: number;
            reviews?: number;
          }>;
        };
        for (const r of d.local_results ?? []) {
          add(
            {
              id: r.place_id || `${(r.title || "").toLowerCase()}|${cleanDomain(r.website)}`,
              company: r.title || "",
              website: cleanDomain(r.website || ""),
              phone: r.phone || "",
              address: r.address || "",
              city,
              industry: r.type || kw,
              rating: r.rating,
              reviews: r.reviews,
              source: "Google Maps",
            },
            "serpapi",
          );
          if (byKey.size >= wanted) break;
        }
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }

  if (byKey.size < wanted && want.includes("osm") && f.bbox) {
    // OSM was started at the top so its latency overlaps the Places calls.
    const osmResults = await osmPromise;
    for (const r of osmResults) {
      if (byKey.size >= wanted) break;
      if (r.error) errors.push(r.error);
      for (const b of r.businesses) {
        add({ ...b, source: "Google" }, "osm");
        if (byKey.size >= wanted) break;
      }
    }
  }

  // Bulk: Apify walks the map for hundreds per query. Only in "wait" mode (cron /
  // saved searches); the browser starts a run and polls via /api/discover/apify/*.
  if (want.includes("selfhost") && gmapsSelfAvailable(env) && f.apifyWait) {
    const r = await gmapsSelfRunAndWait(env, {
      queries,
      location: f.location || city,
      max: wanted,
      lat: f.lat,
      lng: f.lng,
      radiusKm: f.radiusKm || undefined,
    });
    if (r.error) errors.push(r.error);
    for (const b of r.businesses) add({ ...b, source: "Google Maps" }, "selfhost");
  }
  if (want.includes("apify") && apifyAvailable(env) && f.apifyWait) {
    const r = await apifyRunAndWait(env, { queries, location: f.location || city, max: wanted });
    if (r.error) errors.push(r.error);
    for (const b of r.businesses) {
      add({ ...b, source: "Google Maps" }, "apify");
      if (byKey.size >= wanted) break;
    }
  }

  const filtered = applyUniversalFilters(Array.from(byKey.values()), f);
  if (filtered.dropped) errors.push(`${filtered.dropped} filtered out (radius / rating / reviews)`);

  // Global "seen" memory: drop anything an EARLIER scan already returned, or that
  // is already in Leads (and blacklisted companies); then remember what we return.
  let kept = filtered.kept;
  if (Db.available(env)) {
    const db = new Db(env);
    const seen = await hideSeenBusinesses(db, kept, { hideSeen: f.hideSeen !== false, since: f.since });
    kept = seen.kept;
    errors.push(...seen.notes);
    await rememberBusinesses(db, kept.slice(0, wanted));
  }
  const businesses = kept.slice(0, wanted);
  if (
    businesses.length < wanted &&
    byKey.size < wanted &&
    !region &&
    // (not when a provider refused: then the area isn't the reason)
    !errors.some((e) => /^(SerpApi|Serper)\b/.test(e))
  )
    errors.push(
      `Google only had ${byKey.size} businesses for this search area — widen the radius, add nearby cities, or add keywords for more`,
    );
  const available = {
    places: !!placesKey,
    serper: !!serperKey,
    serpapi: !!serpapiKey,
    osm: true,
    apify: apifyAvailable(env),
    selfhost: gmapsSelfAvailable(env),
  };
  const reason = businesses.length
    ? undefined
    : !placesKey && !serperKey && !serpapiKey && !f.bbox
      ? "missing_key"
      : "no_results";
  return { businesses, used, available, errors, reason };
}

/* --------------------------------------------------------------------- */
/* Free enrichment — website scrape + MX check (+ Claude on the same text) */
/* --------------------------------------------------------------------- */

async function enrichFree(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let body: { website?: string; company?: string; ownerName?: string; useClaude?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const r = await freeEnrich({ website: body.website || "", ownerName: body.ownerName });
  if (!r.ok) return json({ ok: false, error: r.error, website: r.website });

  // Optional Claude pass on the SAME text (no second fetch), to name the decision-maker.
  let extracted: unknown = null;
  if (body.useClaude !== false && secret(env, "ANTHROPIC_API_KEY") && r.text) {
    const hint = r.names.length
      ? `People found on the site: ${r.names.map((n) => `${n.name}${n.title ? ` (${n.title})` : ""}`).join("; ")}`
      : undefined;
    extracted = await runClaudeExtract(env, {
      company: body.company || "",
      website: r.website,
      text: r.text,
      hint,
    });
  }
  // Don't ship 30 KB of page text back to the browser.
  const { text: _t, ...rest } = r;
  void _t;
  const ex = (extracted ?? {}) as { ownerName?: string; email?: string };
  const best = r.emails.find((e) => e.source === "site") ?? r.emails[0];
  const sc = scoreLead({
    website: r.website,
    name: ex.ownerName || r.names[0]?.name || "",
    email: ex.email || best?.email || "",
    emailGuessed: best?.source === "guess" && !ex.email,
    mx: r.mx,
    phone: r.phones[0] || "",
    signals: r.signals,
  });
  return json({ ...rest, extracted, score: sc.score, scoreReasons: sc.reasons });
}

/** MX check for any domain — the UI uses it before queueing a guessed address. */
async function verifyDomain(url: URL): Promise<Response> {
  const domain = cleanDomain(url.searchParams.get("domain") ?? "");
  if (!domain) return json({ error: "missing domain" }, 400);
  return json({ domain, mx: await hasMx(domain) });
}

/* --------------------------------------------------------------------- */
/* Google Maps business discovery (via SerpApi / Serper)                   */
/* --------------------------------------------------------------------- */

interface GoogleBusinessFilters {
  location?: string;
  industry?: string; // comma-separated keywords
  perPage?: number;
}

interface DiscoveredBusiness {
  id: string;
  company: string;
  website: string;
  phone: string;
  address: string;
  city: string;
  industry: string;
  rating?: number;
  reviews?: number;
  lat?: number;
  lng?: number;
  /** Pre-found address (the self-hosted Maps scraper reads sites itself). */
  email?: string;
  source: "Google Maps" | "Google";
}

async function googleBusinesses(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const key = secret(env, "SERPAPI_API_KEY") || secret(env, "SERPER_API_KEY");
  if (!key) return json({ demo: true, reason: "missing_key", businesses: [] });

  let f: GoogleBusinessFilters = {};
  try {
    f = (await request.json()) as GoogleBusinessFilters;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const wanted = Math.min(Math.max(f.perPage ?? 25, 1), 200);
  const keywords = (f.industry ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 6);
  const queries = keywords.length ? keywords : ["business"];
  const location = (f.location ?? "").trim();

  const byKey = new Map<string, DiscoveredBusiness>();
  const perQuery = Math.ceil(wanted / queries.length);

  for (const kw of queries) {
    if (byKey.size >= wanted) break;
    const q = location ? `${kw} in ${location}` : kw;
    try {
      if (isSerpApi(key)) {
        // Try Google Maps engine first (richest local data).
        const pages = Math.ceil(perQuery / 20);
        for (let page = 0; page < pages; page++) {
          const u = new URL("https://serpapi.com/search.json");
          u.searchParams.set("engine", "google_maps");
          u.searchParams.set("q", q);
          u.searchParams.set("type", "search");
          u.searchParams.set("start", String(page * 20));
          u.searchParams.set("api_key", key);
          const res = await fetch(u.toString());
          if (!res.ok) break;
          const d = (await res.json()) as {
            local_results?: Array<{
              place_id?: string;
              title?: string;
              website?: string;
              phone?: string;
              address?: string;
              type?: string;
              types?: string[];
              rating?: number;
              reviews?: number;
              gps_coordinates?: { latitude?: number; longitude?: number };
            }>;
          };
          const batch = d.local_results ?? [];
          if (!batch.length) break;
          for (const r of batch) {
            const id = r.place_id || `${(r.title || "").toLowerCase()}|${cleanDomain(r.website)}`;
            if (byKey.has(id)) continue;
            byKey.set(id, {
              id,
              company: r.title || "",
              website: cleanDomain(r.website || ""),
              phone: r.phone || "",
              address: r.address || "",
              city: location.split(",")[0] || "",
              industry: r.type || (r.types?.[0] ?? kw),
              rating: r.rating,
              reviews: r.reviews,
              source: "Google Maps",
            });
            if (byKey.size >= wanted) break;
          }
          if (byKey.size >= wanted) break;
        }
      } else {
        // Serper.dev — use /places endpoint.
        const res = await fetch("https://google.serper.dev/places", {
          method: "POST",
          headers: { "X-API-KEY": key, "Content-Type": "application/json" },
          body: JSON.stringify({ q, num: Math.min(perQuery, 20) }),
        });
        if (res.ok) {
          const d = (await res.json()) as {
            places?: Array<{
              title?: string;
              address?: string;
              phoneNumber?: string;
              website?: string;
              category?: string;
              rating?: number;
              ratingCount?: number;
              cid?: string;
            }>;
          };
          for (const r of d.places ?? []) {
            const id = r.cid || `${(r.title || "").toLowerCase()}|${cleanDomain(r.website || "")}`;
            if (byKey.has(id)) continue;
            byKey.set(id, {
              id,
              company: r.title || "",
              website: cleanDomain(r.website || ""),
              phone: r.phoneNumber || "",
              address: r.address || "",
              city: location.split(",")[0] || "",
              industry: r.category || kw,
              rating: r.rating,
              reviews: r.ratingCount,
              source: "Google Maps",
            });
            if (byKey.size >= wanted) break;
          }
        }
      }
    } catch {
      /* keep trying remaining keywords */
    }
  }

  const businesses = Array.from(byKey.values()).slice(0, wanted);
  if (!businesses.length) return json({ demo: true, reason: "no_results", businesses: [] });
  return json({ demo: false, businesses });
}

/* --------------------------------------------------------------------- */
/* Scrape a single website -> plain text (for Claude extraction)           */
/* --------------------------------------------------------------------- */

async function scrapeSite(request: Request, env: Env): Promise<Response> {
  void env;
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let body: { url?: string } = {};
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const target = (body.url || "").trim();
  if (!target) return json({ error: "missing url" }, 400);
  const r = await freeEnrich({ website: target });
  if (!r.ok) return json({ ok: false, error: r.error });
  return json({
    ok: true,
    text: r.text.slice(0, 18000),
    emails: r.emails,
    phones: r.phones,
    socials: r.socials,
    names: r.names,
    mx: r.mx,
  });
}

/* --------------------------------------------------------------------- */
/* Claude — extract decision-maker contact from a scraped website          */
/* --------------------------------------------------------------------- */

interface ClaudeExtractInput {
  company?: string;
  website?: string;
  text?: string;
  hint?: string;
}

async function claudeExtract(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!secret(env, "ANTHROPIC_API_KEY"))
    return json({ demo: true, reason: "missing_key", extracted: null });
  let body: ClaudeExtractInput = {};
  try {
    body = (await request.json()) as ClaudeExtractInput;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body.text) return json({ ok: false, reason: "no_text" });
  const extracted = await runClaudeExtract(env, body);
  return json({ ok: extracted !== null, extracted });
}

const EXTRACT_SYSTEM = `You are a B2B lead-research assistant. Extract the SINGLE most senior decision-maker (Owner/Founder/CEO/Managing Director > C-Suite > VP > Director > Manager) plus reachable contact info from the provided website text.

Respond with ONLY a JSON object, no prose, no markdown fences, matching:
{
  "ownerName": string,           // person's full name, "" if not found
  "ownerTitle": string,          // job title, "" if not found
  "email": string,               // most relevant email at the company's domain, "" if not found
  "phone": string,               // primary phone, "" if not found
  "linkedin": string,            // LinkedIn URL of the person, "" if not found
  "industry": string,            // 1-3 words describing what the company does
  "city": string,                // primary city
  "confidence": number           // 0..1, your confidence in the person identification
}

Rules:
- Prefer emails on the company's own domain over generic gmail/hotmail addresses.
- Never invent. If you can't find a field, return "".
- If you only find a generic info@/contact@ email but no person, still return the email with ownerName="" and confidence ~0.3.`;

/** Claude Haiku call shared by /api/claude/extract and /api/enrich/free. */
async function runClaudeExtract(env: Env, body: ClaudeExtractInput): Promise<unknown> {
  const key = secret(env, "ANTHROPIC_API_KEY");
  if (!key) return null;
  const company = (body.company || "").slice(0, 200);
  const website = (body.website || "").slice(0, 200);
  const text = (body.text || "").slice(0, 16000);
  if (!text) return null;
  const user = `Company: ${company}\nWebsite: ${website}\n${body.hint ? `Hint: ${body.hint}\n` : ""}\nWebsite text (truncated):\n"""\n${text}\n"""`;
  const call = (model: string) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key ?? "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system: EXTRACT_SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
  try {
    let res = await call("claude-haiku-4-5");
    if (!res.ok && (res.status === 404 || res.status === 400))
      res = await call("claude-3-5-haiku-latest");
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { text?: string }[] };
    return parseClaudeJson(data.content?.[0]?.text || "");
  } catch {
    return null;
  }
}

function parseClaudeJson(raw: string): unknown {
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  const slice = m ? m[0] : raw;
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

/**
 * "Where should we prospect?" — Claude ranks metro areas for a niche + what we sell.
 * Returns a list the scraper can scan with one click. Opinionated, not a dataset:
 * it reasons from market size, growth, home-service demand, ticket size and how
 * saturated local agencies already are.
 */
async function claudeAreas(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const key = secret(env, "ANTHROPIC_API_KEY");
  if (!key) return json({ ok: false, reason: "missing_key", areas: [] });
  const body = (await request.json().catch(() => ({}))) as {
    niche?: string;
    country?: string;
    region?: string;
    count?: number;
  };
  const niche = (body.niche || "local service businesses").slice(0, 120);
  const country = (body.country || "United States").slice(0, 60);
  const region = (body.region || "").slice(0, 120);
  const count = Math.max(5, Math.min(body.count || 12, 20));
  const system = `You advise a small marketing agency (websites, Google/Meta ads, review generation, lead automation) on WHERE to prospect by cold email. Rank metro areas for the given niche in the given country${region ? ` (focus: ${region})` : ""}.

Favour: many independent (non-franchise) businesses in the niche; population growth and new-housing activity; high average job ticket; seasonality that creates urgency; owners who buy marketing (affluent suburbs, service areas of 200k–2M people); less saturation by local agencies than the biggest coastal metros.
Avoid: the five largest metros unless there's a specific reason (they're over-prospected), and places where the niche barely exists.

Reply with ONLY JSON:
{"areas":[{"area":"Denver, CO","state":"CO","why":"one sentence, concrete","estBusinesses":"~400","competition":"low|medium|high","season":"best months to email, short","searchAs":"Denver, CO"}]}
Return exactly ${count} entries, best first. "searchAs" must be a string Google Maps understands as a place.`;
  try {
    const call = (model: string) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key ?? "",
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1800,
          system,
          messages: [{ role: "user", content: `Niche: ${niche}\nCountry: ${country}` }],
        }),
        signal: AbortSignal.timeout(40000),
      });
    let res = await call("claude-sonnet-4-5");
    if (!res.ok && (res.status === 404 || res.status === 400)) res = await call("claude-haiku-4-5");
    if (!res.ok) return json({ ok: false, reason: await anthropicProblem(res), areas: [] });
    const d = (await res.json()) as { content?: { text?: string }[] };
    const m = (d.content?.[0]?.text || "").match(/\{[\s\S]*\}/);
    if (!m) return json({ ok: false, reason: "no_json", areas: [] });
    const j = JSON.parse(m[0]) as { areas?: unknown[] };
    const areas = (Array.isArray(j.areas) ? j.areas : [])
      .map((x) => x as Record<string, unknown>)
      .filter((x) => x.area)
      .slice(0, count)
      .map((x) => ({
        area: String(x.area),
        state: String(x.state || ""),
        why: String(x.why || ""),
        estBusinesses: String(x.estBusinesses || ""),
        competition: String(x.competition || ""),
        season: String(x.season || ""),
        searchAs: String(x.searchAs || x.area),
      }));
    return json({ ok: true, areas });
  } catch (e) {
    return json({ ok: false, reason: (e as Error).message, areas: [] });
  }
}

async function claudeKeywords(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const key = secret(env, "ANTHROPIC_API_KEY");
  if (!key) return json({ ok: false, reason: "missing_key", keywords: [] });
  let body: { location?: string; seed?: string; note?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const location = (body.location || "").slice(0, 200);
  const seed = (body.seed || "").slice(0, 200);
  const note = (body.note || "").slice(0, 400);

  const system = `You are a B2B lead-gen strategist for a marketing agency that sells websites, paid ads, and lead automation to local service-based small businesses (owner-operators, 1-50 employees). Your job: propose the BEST industry keywords to search on Apollo + Google Maps to find high-intent, high-ticket local service businesses that need marketing help.

Rules:
- Focus on SERVICE-BASED businesses (contractors, home services, health, wellness, beauty, professional services, trades). Skip pure e-commerce, franchises of huge chains, and public institutions.
- Prefer verticals with high customer LTV and existing paid-ad spend patterns (roofing, HVAC, dental, med spa, real estate, law firms, remodelers, tree care, landscaping, auto body, etc.).
- Return short, Google-Maps-friendly keywords ("Roofing", "Tree Removal", "Med Spa") — NOT long phrases.
- If a location is given, tilt toward verticals that are strong in that region (e.g. pool service in Florida, snow removal in Canada).
- Return ONLY a JSON object of the form: { "keywords": string[] } with 25-40 items, no duplicates, no prose, no markdown fences.`;

  const user = `Location: ${location || "any"}
Seed / current keywords: ${seed || "(none)"}
Extra note: ${note || "(none)"}

Suggest the best keywords.`;

  async function callClaude(model: string) {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key ?? "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  }

  try {
    let res = await callClaude("claude-haiku-4-5");
    if (!res.ok && (res.status === 404 || res.status === 400)) {
      res = await callClaude("claude-3-5-haiku-latest");
    }
    if (!res.ok) {
      return json({
        ok: false,
        status: res.status,
        detail: (await res.text()).slice(0, 300),
        keywords: [],
      });
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const raw = data.content?.[0]?.text || "";
    const parsed = parseClaudeJson(raw) as { keywords?: unknown } | null;
    const list = Array.isArray(parsed?.keywords)
      ? (parsed.keywords as unknown[])
          .map((k) => (typeof k === "string" ? k.trim() : ""))
          .filter((k) => k && k.length <= 60)
      : [];
    // De-dupe case-insensitively
    const seen = new Set<string>();
    const keywords = list.filter((k) => {
      const key = k.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return json({ ok: true, keywords });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message, keywords: [] });
  }
}

/* ----------------------------------------------------------------------- */
/* Claude vision — extract ad-dashboard metrics from a screenshot           */
/* ----------------------------------------------------------------------- */

interface AdScanInput {
  imageBase64?: string; // data URL or raw base64
  mediaType?: string;
  platform?: string;
  hint?: string;
}

async function claudeAdScan(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  // Prefer the free Lovable AI Gateway (uses included monthly credits).
  // Fall back to Anthropic direct only if a project key is set AND the gateway key is missing.
  const lovableKey = secret(env, "LOVABLE_API_KEY");
  const anthropicKey = secret(env, "ANTHROPIC_API_KEY");
  if (!lovableKey && !anthropicKey) {
    return json({
      ok: false,
      reason: "missing_key",
      error:
        "No vision API configured. Lovable AI Gateway is not available and ANTHROPIC_API_KEY is unset.",
    });
  }

  let body: AdScanInput = {};
  try {
    body = (await request.json()) as AdScanInput;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  let img = (body.imageBase64 || "").trim();
  if (!img) return json({ ok: false, error: "no image" });
  let mediaType = (body.mediaType || "image/png").toLowerCase();
  const m = img.match(/^data:([^;]+);base64,(.*)$/);
  if (m) {
    mediaType = m[1];
    img = m[2];
  }
  if (!/^image\/(png|jpeg|jpg|gif|webp)$/.test(mediaType)) mediaType = "image/png";
  if (mediaType === "image/jpg") mediaType = "image/jpeg";
  if (img.length > 6_500_000) return json({ ok: false, error: "image too large (max ~5MB)" });

  const platform = (body.platform || "other").toLowerCase();
  const platformHint =
    platform === "meta"
      ? "Meta / Facebook / Instagram Ads Manager"
      : platform === "google"
        ? "Google Ads"
        : platform === "tiktok"
          ? "TikTok Ads Manager"
          : "generic ad platform";

  const system = `You are a marketing-analytics assistant. The user gives you a screenshot of an ad platform or e-commerce / service-business analytics dashboard (${platformHint}) and you extract the headline metrics.

Respond with ONLY a JSON object (no markdown, no prose) shaped like:
{
  "campaign": string,        // campaign / ad-set / report name if visible, else ""
  "dateRange": string,       // e.g. "Nov 1 - Nov 30 2024", else ""
  "spend": number,           // total ad spend / amount spent
  "currency": string,        // ISO code or symbol, else ""
  "impressions": number,
  "reach": number,
  "clicks": number,
  "ctr": number,             // percentage, e.g. 3.2 (not 0.032)
  "cpc": number,
  "cpm": number,
  "conversions": number,
  "cpa": number,
  "roas": number,
  "revenue": number,         // total revenue attributed
  "sales": number,           // total sales value if shown separately
  "orders": number,          // total orders
  "sessions": number,        // online store / site sessions
  "visitors": number,
  "aov": number,             // average order value
  "conversionRate": number,  // percent, e.g. 0.68
  "returningRate": number,   // returning customer rate, percent
  "leads": number,
  "bookings": number,
  "showRate": number,        // percent
  "avgTicket": number,       // average ticket / deal size for service businesses
  "notes": string            // 1-line summary of the screenshot, else ""
}

Rules:
- Return 0 for numeric fields you cannot read; never invent numbers.
- Strip commas / currency symbols / thousand separators before returning numbers.
- Percentages must be plain numbers (e.g. 3.2 means 3.2%), not decimals.
- If several campaigns/rows are shown, prefer the aggregate totals; if only per-row is available, sum them and mention in "notes".`;

  const userText = body.hint
    ? `Context hint: ${body.hint}`
    : "Extract the metrics from this screenshot.";
  const dataUrl = `data:${mediaType};base64,${img}`;

  // --- Path 1: Lovable AI Gateway (free / included credits) ------------------
  if (lovableKey) {
    async function callGateway(model: string): Promise<Response> {
      return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
    }
    try {
      let res = await callGateway("google/gemini-2.5-flash");
      if (!res.ok && (res.status === 400 || res.status === 404)) {
        res = await callGateway("google/gemini-2.5-flash-lite");
      }
      if (res.status === 429) {
        return json({
          ok: false,
          status: 429,
          error: "AI gateway rate limit hit — please retry in a moment.",
        });
      }
      if (res.status === 402) {
        return json({
          ok: false,
          status: 402,
          error: "Workspace AI credits exhausted. Add credits in Settings → Plans & credits.",
        });
      }
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 400);
        return json({
          ok: false,
          status: res.status,
          error: `AI gateway ${res.status}: ${detail}`,
        });
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content || "";
      const parsed = parseClaudeJson(text) as Record<string, unknown> | null;
      return json({ ok: true, metrics: parsed ?? {}, raw: data, provider: "lovable-gateway" });
    } catch (e) {
      // If gateway path threw, only fall through to Anthropic when that key is present.
      if (!anthropicKey) return json({ ok: false, error: (e as Error).message });
    }
  }

  // --- Path 2: Anthropic direct (legacy fallback) ----------------------------
  if (!anthropicKey) return json({ ok: false, error: "AI service is not configured" }, 503);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey ?? "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 800,
        system,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: img } },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      return json({
        ok: false,
        status: res.status,
        error: `Anthropic responded ${res.status}: ${detail}`,
      });
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const parsed = parseClaudeJson(data.content?.[0]?.text || "") as Record<string, unknown> | null;
    return json({ ok: true, metrics: parsed ?? {}, raw: data, provider: "anthropic" });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
}
