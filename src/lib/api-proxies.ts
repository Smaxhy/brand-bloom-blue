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

type Env = Record<string, string | undefined>;

/** Read a secret from Worker env binding OR process.env (Lovable injects secrets via process.env). */
function secret(env: Env, name: string): string | undefined {
  return env[name] || (typeof process !== "undefined" ? process.env?.[name] : undefined);
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Returns a Response for any /api/* route this module owns, or null to let the
 * request fall through to normal SSR routing.
 */
export async function handleApiRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/geocode") return geocode(url, env);
  if (path === "/api/diag") return diag(env);
  if (path === "/api/apollo/search") return apolloSearch(request, env);
  if (path === "/api/enrich") return enrich(request, env);
  if (path === "/api/hunter/domain") return hunterDomain(url, env);
  if (path === "/api/ghl/send") return ghlSend(request, env);

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
    serperKeyPresent: !!secret(env, "SERPAPI_API_KEY"),
    ghlKeyPresent: !!secret(env, "GHL_API_KEY"),
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
    baseBody.person_locations = [filters.location.trim()];
    baseBody.organization_locations = [filters.location.trim()];
  }
  if (titles.length) baseBody.person_titles = titles;
  if (filters.seniorities?.length) baseBody.person_seniorities = filters.seniorities;

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
    const people = Array.from(byId.values()).slice(0, wanted).map(normalizePerson);
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

interface EnrichInput {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  domain?: string; // company website / domain
  organizationName?: string;
  linkedin?: string;
}

async function enrich(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let payload: { people?: EnrichInput[]; revealPhone?: boolean } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const people = (payload.people ?? []).slice(0, 10);
  if (!people.length) return json({ results: [] });

  const hunterKey = secret(env, "HUNTER_API_KEY");
  const serperKey = secret(env, "SERPAPI_API_KEY");

  if (!hunterKey && !serperKey) {
    return json({
      demo: true,
      reason: "missing_reveal_keys",
      results: people.map((p) => ({
        id: p.id,
        email: demoEmail(p),
        phone: "",
        source: "demo",
        sourceUrl: "",
      })),
    });
  }

  const results: {
    id?: string;
    email: string;
    phone: string;
    source: string;
    sourceUrl: string;
  }[] = [];
  for (const p of people) {
    const domain = cleanDomain(p.domain);
    let email = "";
    let phone = "";
    let source = "";
    let sourceUrl = "";

    // 1) Hunter email-finder — most reliable for name + domain → email
    if (hunterKey && domain) {
      const first = p.firstName || p.name?.split(" ")[0] || "";
      const last = p.lastName || p.name?.split(" ").slice(-1)[0] || "";
      if (first && last) {
        try {
          const u = new URL("https://api.hunter.io/v2/email-finder");
          u.searchParams.set("domain", domain);
          u.searchParams.set("first_name", first);
          u.searchParams.set("last_name", last);
          u.searchParams.set("api_key", hunterKey);
          const res = await fetch(u.toString());
          if (res.ok) {
            const d = (await res.json()) as {
              data?: {
                email?: string;
                phone_number?: string;
                sources?: { uri?: string }[];
              };
            };
            if (d.data?.email) {
              email = d.data.email;
              source = "Hunter";
              sourceUrl = d.data.sources?.find((s) => s.uri)?.uri ?? "";
              if (payload.revealPhone && d.data.phone_number) phone = d.data.phone_number;
            }
          }
        } catch {
          /* fall through to Serper */
        }
      }
    }

    // 2) Serper fallback — scrape Google, track which result the email came from
    if (!email && serperKey) {
      const q = [
        p.name ? `"${p.name}"` : "",
        p.organizationName ? `"${p.organizationName}"` : "",
        domain ? `"@${domain}"` : "",
        payload.revealPhone ? "email OR phone" : "email",
      ]
        .filter(Boolean)
        .join(" ");
      try {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q, num: 10 }),
        });
        if (res.ok) {
          const d = (await res.json()) as {
            organic?: { title?: string; snippet?: string; link?: string }[];
            knowledgeGraph?: Record<string, unknown>;
          };
          const organic = d.organic ?? [];
          // Prefer the first organic hit that actually contains a matching email
          for (const o of organic) {
            const text = `${o.title ?? ""} ${o.snippet ?? ""}`;
            const found = pickEmail(text, domain);
            if (found) {
              email = found;
              sourceUrl = o.link ?? "";
              break;
            }
          }
          // Fallback: scan everything (knowledgeGraph etc.)
          if (!email) {
            const blob = JSON.stringify(organic) + JSON.stringify(d.knowledgeGraph ?? {});
            email = pickEmail(blob, domain);
            if (email && organic[0]?.link) sourceUrl = organic[0].link;
          }
          if (email) source = "Google";
          if (payload.revealPhone && !phone) {
            const blob = JSON.stringify(organic) + JSON.stringify(d.knowledgeGraph ?? {});
            phone = pickPhone(blob);
          }
        }
      } catch {
        /* leave locked */
      }
    }

    results.push({ id: p.id, email, phone, source, sourceUrl });
  }
  return json({ demo: false, results });
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;

/** Pull the best email out of a text blob, preferring one on the company domain. */
function pickEmail(text: string, domain?: string): string {
  const found = (text.match(EMAIL_RE) ?? [])
    .map((e) => e.toLowerCase())
    // drop obvious junk / image filenames mistaken as emails
    .filter((e) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e))
    .filter((e) => !/(example|sentry|wixpress|domain)\.com$/i.test(e));
  if (!found.length) return "";
  if (domain) {
    const onDomain = found.find((e) => e.endsWith("@" + domain.toLowerCase()));
    if (onDomain) return onDomain;
  }
  return found[0];
}

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
  // Prefer the server secret; fall back to a key passed from the client.
  const key = secret(env, "GHL_API_KEY") || payload.apiKey;
  if (!key || !payload.locationId) {
    return json({ ok: true, simulated: true, message: "No GHL key on server — simulated." });
  }
  try {
    // Create/queue an email per recipient via the LeadConnector API.
    // (Endpoint shapes vary by GHL plan; adjust to your account's email API.)
    const results = await Promise.all(
      (payload.to ?? []).map((rcpt) =>
        fetch("https://services.leadconnectorhq.com/emails/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
          body: JSON.stringify({
            locationId: payload.locationId,
            to: rcpt.email,
            subject: payload.subject,
            html: (payload.body ?? "").replace(/\n/g, "<br>"),
            fromName: payload.fromName,
            fromEmail: payload.fromEmail,
          }),
        }).then((r) => r.ok),
      ),
    );
    const sent = results.filter(Boolean).length;
    return json({ ok: sent > 0, message: `Forwarded ${sent}/${results.length} to GoHighLevel.` });
  } catch (e) {
    return json({ ok: false, message: (e as Error).message }, 500);
  }
}
