/**
 * Self-hosted Google Maps scraper — gosom/google-maps-scraper (MIT).
 *
 *   docker run -d --restart unless-stopped -p 8080:8080 \
 *     -v $PWD/gmapsdata:/gmapsdata gosom/google-maps-scraper -data-folder /gmapsdata
 *
 * Then set the Cloudflare secret GMAPS_SCRAPER_URL=https://maps.yourdomain.com
 * (put it behind Cloudflare Tunnel or basic auth; GMAPS_SCRAPER_AUTH="user:pass"
 * is sent as Basic auth when present).
 *
 * No per-result cost, no 60-per-point cap, no daily quota, and it reads each
 * site for e-mail addresses. Trade-off: it's YOUR server; Google can throttle
 * it if you run huge jobs back to back (the scraper supports proxies).
 *
 * API (web runner): POST /api/v1/jobs → {id}; GET /api/v1/jobs/{id} → {status};
 * GET /api/v1/jobs/{id}/download → CSV.
 */

import type { PlaceBusiness } from "./places";

type Env = Record<string, string | undefined>;
const secret = (e: Env, k: string) => e[k] || process.env?.[k];

export function gmapsSelfAvailable(env: Env): boolean {
  return !!secret(env, "GMAPS_SCRAPER_URL");
}

function base(env: Env): string {
  return (secret(env, "GMAPS_SCRAPER_URL") || "").replace(/\/+$/, "");
}

function headers(env: Env): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const auth = secret(env, "GMAPS_SCRAPER_AUTH");
  if (auth) h.Authorization = `Basic ${btoa(auth)}`;
  return h;
}

export interface GmapsJob {
  id: string;
  status: string; // pending | working | ok | failed
}

/** Start one job: every keyword × the location, up to `depth` result pages each. */
export async function gmapsSelfStart(
  env: Env,
  p: {
    queries: string[];
    location: string;
    max: number;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    emails?: boolean;
    lang?: string;
  },
): Promise<{ job: GmapsJob } | { error: string }> {
  const url = base(env);
  if (!url) return { error: "GMAPS_SCRAPER_URL is not set" };
  // The scraper takes "keyword in location" queries, one per line / array item.
  const keywords = p.queries.slice(0, 12).map((k) => `${k} in ${p.location}`);
  // Depth = how far it scrolls the results list per query (~20 per page).
  const perQuery = Math.ceil(p.max / Math.max(1, keywords.length));
  const depth = Math.max(1, Math.min(20, Math.ceil(perQuery / 20)));
  const body: Record<string, unknown> = {
    name: `inspirova ${new Date().toISOString().slice(0, 16)} ${p.location}`,
    keywords,
    lang: p.lang || "en",
    zoom: 13,
    depth,
    email: p.emails !== false,
    max_time: 3600,
    fast_mode: false,
  };
  if (p.lat != null && p.lng != null) {
    body.lat = String(p.lat);
    body.lon = String(p.lng);
    body.radius = Math.round((p.radiusKm || 25) * 1000);
  }
  try {
    const res = await fetch(`${url}/api/v1/jobs`, {
      method: "POST",
      headers: { ...headers(env), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok)
      return { error: `Maps scraper ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const j = (await res.json()) as { id?: string; ID?: string; status?: string };
    const id = j.id || j.ID;
    if (!id) return { error: "Maps scraper returned no job id" };
    return { job: { id, status: (j.status || "pending").toLowerCase() } };
  } catch (e) {
    return { error: `Maps scraper unreachable: ${(e as Error).message}` };
  }
}

export async function gmapsSelfStatus(env: Env, id: string): Promise<GmapsJob | null> {
  try {
    const res = await fetch(`${base(env)}/api/v1/jobs/${encodeURIComponent(id)}`, {
      headers: headers(env),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { id?: string; status?: string; Status?: string };
    return { id, status: String(j.status || j.Status || "").toLowerCase() };
  } catch {
    return null;
  }
}

export const GMAPS_DONE = new Set(["ok", "done", "completed", "finished", "failed", "error"]);

/** Download the CSV and turn it into PlaceBusiness rows (+ emails when found). */
export async function gmapsSelfItems(
  env: Env,
  id: string,
  fallbackCity: string,
  fallbackIndustry: string,
): Promise<(PlaceBusiness & { email?: string })[]> {
  try {
    const res = await fetch(`${base(env)}/api/v1/jobs/${encodeURIComponent(id)}/download`, {
      headers: { ...headers(env), Accept: "text/csv" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return [];
    return parseGmapsCsv(await res.text(), fallbackCity, fallbackIndustry);
  } catch {
    return [];
  }
}

/** RFC-4180-ish CSV parser (quoted fields, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}

const AGGREGATOR =
  /facebook\.com|instagram\.com|yelp\.com|linktr\.ee|google\.com|business\.site$|nextdoor\.com|angi\.com|homeadvisor\.com|thumbtack\.com/i;

export function parseGmapsCsv(
  csv: string,
  fallbackCity: string,
  fallbackIndustry: string,
): (PlaceBusiness & { email?: string })[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const iTitle = col("title");
  const iWeb = col("website");
  const iPhone = col("phone");
  const iAddr = col("address");
  const iCat = col("category");
  const iRating = col("review_rating");
  const iCount = col("review_count");
  const iLat = col("latitude");
  const iLng = col("longitude");
  const iCid = col("cid");
  const iStatus = col("status");
  const iEmails = col("emails");
  const iComplete = col("complete_address");
  const out: (PlaceBusiness & { email?: string })[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(1)) {
    const title = (r[iTitle] || "").trim();
    if (!title) continue;
    const status = (iStatus >= 0 ? r[iStatus] : "").toLowerCase();
    if (/permanently closed/.test(status)) continue;
    const rawWeb = (iWeb >= 0 ? r[iWeb] : "").trim();
    const website = rawWeb && !AGGREGATOR.test(rawWeb) ? rawWeb : "";
    const cid = iCid >= 0 ? r[iCid] : "";
    const id = cid ? `gmaps_${cid}` : `gmaps_${title.toLowerCase()}|${website}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let city = fallbackCity;
    if (iComplete >= 0 && r[iComplete]) {
      // complete_address is JSON: {"borough":"","street":"","city":"Phoenix","postal_code":"","state":"AZ","country":"US"}
      try {
        const j = JSON.parse(r[iComplete]) as { city?: string };
        if (j.city) city = j.city;
      } catch {
        /* keep fallback */
      }
    }
    const emails = (iEmails >= 0 ? r[iEmails] : "")
      .split(/[,\s;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e));
    const rating = iRating >= 0 ? Number(r[iRating]) : NaN;
    const count = iCount >= 0 ? Number(r[iCount]) : NaN;
    out.push({
      id,
      company: title,
      website,
      phone: (iPhone >= 0 ? r[iPhone] : "").trim(),
      address: (iAddr >= 0 ? r[iAddr] : "").trim(),
      city,
      industry: (iCat >= 0 && r[iCat]) || fallbackIndustry,
      rating: Number.isFinite(rating) ? rating : undefined,
      reviews: Number.isFinite(count) ? count : undefined,
      lat: iLat >= 0 && r[iLat] ? Number(r[iLat]) : undefined,
      lng: iLng >= 0 && r[iLng] ? Number(r[iLng]) : undefined,
      email: emails[0],
    });
  }
  return out;
}

/** Cron/saved-search path: start, poll up to `maxWaitSec`, download. */
export async function gmapsSelfRunAndWait(
  env: Env,
  p: Parameters<typeof gmapsSelfStart>[1] & { maxWaitSec?: number },
): Promise<{ businesses: (PlaceBusiness & { email?: string })[]; error?: string; jobId?: string }> {
  const started = await gmapsSelfStart(env, p);
  if ("error" in started) return { businesses: [], error: started.error };
  const deadline = Date.now() + (p.maxWaitSec ?? 240) * 1000;
  let status = started.job.status;
  while (Date.now() < deadline && !GMAPS_DONE.has(status)) {
    await new Promise((r) => setTimeout(r, 5000));
    status = (await gmapsSelfStatus(env, started.job.id))?.status || status;
  }
  if (!GMAPS_DONE.has(status))
    return {
      businesses: [],
      jobId: started.job.id,
      error: `Maps scraper still running (job ${started.job.id}) — results will appear on the next run`,
    };
  const businesses = await gmapsSelfItems(env, started.job.id, p.location, p.queries[0] || "");
  return { businesses, jobId: started.job.id };
}
