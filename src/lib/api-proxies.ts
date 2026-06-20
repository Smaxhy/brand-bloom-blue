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

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function getSecret(env: Env, name: string): string | undefined {
  const fromBinding = env[name]?.trim();
  if (fromBinding) return fromBinding;

  const runtimeEnv = (globalThis as typeof globalThis & { process?: { env?: Env } }).process?.env;
  const fromRuntime = runtimeEnv?.[name]?.trim();
  return fromRuntime || undefined;
}

/**
 * Returns a Response for any /api/* route this module owns, or null to let the
 * request fall through to normal SSR routing.
 */
export async function handleApiRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/geocode") return geocode(url, env);
  if (path === "/api/apollo/search") return apolloSearch(request, env);
  if (path === "/api/enrich") return enrich(request, env);
  if (path === "/api/hunter/domain") return hunterDomain(url, env);
  if (path === "/api/ghl/send") return ghlSend(request, env);

  return null;
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
  const key = getSecret(env, "APOLLO_API_KEY");
  // No key configured -> tell the client to use demo data.
  if (!key) return json({ demo: true });

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
  try {
    for (const kw of queries) {
      const body = { ...baseBody } as Record<string, unknown>;
      if (kw) body.q_keywords = kw;
      const pages = Math.ceil(perQuery / PER_PAGE);
      for (let page = 1; page <= pages; page++) {
        const res = await fetch("https://api.apollo.io/api/v1/people/search", {
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
          if (page === 1 && byId.size === 0) {
            const text = await res.text();
            return json({ error: `apollo ${res.status}`, detail: text.slice(0, 300) }, 502);
          }
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
      }
      if (byId.size >= wanted) break;
    }
    const people = Array.from(byId.values()).slice(0, wanted).map(normalizePerson);
    return json({ demo: false, people });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

/* --------------------------------------------------------------------- */
/* Enrichment waterfall — Apollo bulk_match, then Hunter.io fallback       */
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
  const people = (payload.people ?? []).slice(0, 10); // 1 Apollo bulk call = max 10
  if (!people.length) return json({ results: [] });

  const apolloKey = getSecret(env, "APOLLO_API_KEY");
  const hunterKey = getSecret(env, "HUNTER_API_KEY");

  // No keys at all -> demo: synthesise plausible emails so the flow is usable.
  if (!apolloKey && !hunterKey) {
    return json({
      demo: true,
      results: people.map((p) => ({
        id: p.id,
        email: demoEmail(p),
        phone: "",
        source: "demo",
      })),
    });
  }

  // Start with empty results keyed by id/index.
  const results: { id?: string; email: string; phone: string; source: string }[] = people.map((p) => ({
    id: p.id,
    email: "",
    phone: "",
    source: "",
  }));

  // 1) Apollo bulk enrichment (best for Apollo-sourced contacts).
  if (apolloKey) {
    try {
      const details = people.map((p) => ({
        id: p.id,
        first_name: p.firstName,
        last_name: p.lastName,
        name: p.name,
        organization_name: p.organizationName,
        domain: p.domain,
        linkedin_url: p.linkedin,
      }));
      const url = new URL("https://api.apollo.io/api/v1/people/bulk_match");
      url.searchParams.set("reveal_personal_emails", "true");
      if (payload.revealPhone) url.searchParams.set("reveal_phone_number", "true");
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          Accept: "application/json",
          "X-Api-Key": apolloKey,
        },
        body: JSON.stringify({
          details,
          reveal_personal_emails: true,
          reveal_phone_number: !!payload.revealPhone,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { matches?: (ApolloPerson | null)[] };
        (data.matches ?? []).forEach((m, i) => {
          if (!m || !results[i]) return;
          const email = m.email && !isLocked(m.email) ? m.email : "";
          const phone =
            m.phone_numbers?.[0]?.sanitized_number || m.phone_numbers?.[0]?.raw_number || "";
          if (email) {
            results[i].email = email;
            results[i].source = "Apollo";
          }
          if (phone) results[i].phone = phone;
        });
      }
    } catch {
      /* fall through to Hunter */
    }
  }

  // 2) Hunter.io fallback for anyone still missing an email (searches the web by domain).
  if (hunterKey) {
    for (let i = 0; i < people.length; i++) {
      if (results[i].email) continue;
      const p = people[i];
      const domain = cleanDomain(p.domain);
      if (!domain) continue;
      try {
        const u = new URL("https://api.hunter.io/v2/email-finder");
        u.searchParams.set("domain", domain);
        if (p.firstName) u.searchParams.set("first_name", p.firstName);
        if (p.lastName) u.searchParams.set("last_name", p.lastName);
        u.searchParams.set("api_key", hunterKey);
        const res = await fetch(u.toString());
        if (res.ok) {
          const d = (await res.json()) as { data?: { email?: string } };
          if (d.data?.email) {
            results[i].email = d.data.email;
            results[i].source = "Hunter";
          }
        }
      } catch {
        /* skip this one */
      }
    }
  }

  // 3) Google (via SerpAPI) fallback — searches the whole web. For anyone
  //    still missing an email, query Google for the person + company and pull
  //    any address out of the result snippets.
  const serpKey = getSecret(env, "SERPAPI_API_KEY");
  if (serpKey) {
    for (let i = 0; i < people.length; i++) {
      if (results[i].email) continue;
      const p = people[i];
      const domain = cleanDomain(p.domain);
      const q = [
        p.name ? `"${p.name}"` : "",
        p.organizationName ? `"${p.organizationName}"` : "",
        domain ? `OR "@${domain}"` : "",
        "email",
      ]
        .filter(Boolean)
        .join(" ");
      try {
        const url = `https://serpapi.com/search.json?engine=google&num=10&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(serpKey)}`;
        const res = await fetch(url);
        if (res.ok) {
          const d = (await res.json()) as {
            organic_results?: { title?: string; snippet?: string; link?: string }[];
            knowledge_graph?: Record<string, unknown>;
          };
          const blob =
            JSON.stringify(d.organic_results ?? []) + JSON.stringify(d.knowledge_graph ?? {});
          const email = pickEmail(blob, domain);
          if (email) {
            results[i].email = email;
            results[i].source = "Google";
          }
        }
      } catch {
        /* skip this one */
      }
    }
  }

  return json({ demo: false, results });
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

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

/* --------------------------------------------------------------------- */
/* Hunter.io — find every public email at a company domain                 */
/* --------------------------------------------------------------------- */

async function hunterDomain(url: URL, env: Env): Promise<Response> {
  const key = getSecret(env, "HUNTER_API_KEY");
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

function isLocked(email: string): boolean {
  return /not_unlocked|email_not_unlocked|@domain\.com$|locked/i.test(email);
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
  const key = getSecret(env, "GHL_API_KEY") || payload.apiKey;
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
