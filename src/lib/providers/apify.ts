/**
 * Apify Google Maps scraper as a BULK discovery source.
 *
 * Google's official Places API stops at 60 results per query. Apify's
 * `compass/crawler-google-places` actor walks the map and returns hundreds
 * per search for a few dollars per 1,000 places. Runs take 1–10 minutes, so
 * the browser starts a run and polls; saved searches (cron) wait in-process.
 *
 * Secret: APIFY_TOKEN. Optional: APIFY_ACTOR (default compass~crawler-google-places;
 * cheaper community actors can be swapped in if their output uses the same fields).
 */

import type { PlaceBusiness } from "./places";

type Env = Record<string, string | undefined>;
const secret = (e: Env, k: string) => e[k] || process.env?.[k];
const API = "https://api.apify.com/v2";

export interface ApifyRun {
  id: string;
  status: string; // READY | RUNNING | SUCCEEDED | FAILED | ABORTED | TIMED-OUT
  defaultDatasetId: string;
  startedAt?: string;
  finishedAt?: string;
}

export function apifyAvailable(env: Env): boolean {
  return !!secret(env, "APIFY_TOKEN");
}

function actorId(env: Env): string {
  return (secret(env, "APIFY_ACTOR") || "compass~crawler-google-places").replace("/", "~");
}

/** Start a run. Returns the run id + dataset id immediately. */
export async function apifyStart(
  env: Env,
  opts: { queries: string[]; location: string; max: number; language?: string },
): Promise<{ run: ApifyRun } | { error: string }> {
  const token = secret(env, "APIFY_TOKEN");
  if (!token) return { error: "APIFY_TOKEN missing" };
  // `max` is the TOTAL we want. The actor's limit is per search string, so
  // split it — before this fix 10 keywords × 500 asked Apify for 5,000 places
  // (≈ $20, a whole month of the Starter plan) in one click.
  const queries = opts.queries.slice(0, 6);
  const max = Math.max(20, Math.min(opts.max, 1000));
  const perSearch = Math.max(10, Math.ceil(max / queries.length));
  const input = {
    searchStringsArray: queries,
    locationQuery: opts.location,
    maxCrawledPlacesPerSearch: perSearch,
    language: opts.language || "en",
    skipClosedPlaces: true,
    scrapeContacts: false, // we read the website ourselves (free, cached)
    scrapeReviewsPersonalData: false,
    maxReviews: 0,
    maxImages: 0,
  };
  try {
    const res = await fetch(`${API}/acts/${actorId(env)}/runs?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { error: `Apify start ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const d = (await res.json()) as { data: ApifyRun };
    return { run: d.data };
  } catch (e) {
    return { error: `Apify start failed: ${(e as Error).message}` };
  }
}

export async function apifyRunStatus(env: Env, runId: string): Promise<ApifyRun | null> {
  const token = secret(env, "APIFY_TOKEN");
  if (!token) return null;
  try {
    const res = await fetch(
      `${API}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`,
      {
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return null;
    return ((await res.json()) as { data: ApifyRun }).data;
  } catch {
    return null;
  }
}

export async function apifyAbort(env: Env, runId: string): Promise<void> {
  const token = secret(env, "APIFY_TOKEN");
  if (!token) return;
  try {
    await fetch(
      `${API}/actor-runs/${encodeURIComponent(runId)}/abort?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    /* ignore */
  }
}

interface ApifyPlace {
  placeId?: string;
  title?: string;
  website?: string;
  phone?: string;
  phoneUnformatted?: string;
  address?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  categoryName?: string;
  totalScore?: number;
  reviewsCount?: number;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  location?: { lat?: number; lng?: number };
  url?: string;
}

function cleanDomain(u: string): string {
  return (u || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

/** Pull the dataset of a finished (or partially finished) run, normalized. */
export async function apifyItems(
  env: Env,
  datasetId: string,
  fallbackCity: string,
  fallbackIndustry: string,
  limit = 1000,
): Promise<PlaceBusiness[]> {
  const token = secret(env, "APIFY_TOKEN");
  if (!token) return [];
  try {
    const res = await fetch(
      `${API}/datasets/${encodeURIComponent(datasetId)}/items?token=${encodeURIComponent(token)}&clean=true&limit=${limit}&fields=placeId,title,website,phone,phoneUnformatted,address,city,state,categoryName,totalScore,reviewsCount,permanentlyClosed,temporarilyClosed,location,url`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as ApifyPlace[];
    const out: PlaceBusiness[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.title || r.permanentlyClosed) continue;
      const website = cleanDomain(r.website || "");
      // Skip aggregator "websites" that aren't the business's own site.
      if (
        /facebook\.com|instagram\.com|yelp\.com|linktr\.ee|google\.com|business\.site$/.test(
          website,
        )
      )
        continue;
      const id = r.placeId ? `apify_${r.placeId}` : `apify_${r.title.toLowerCase()}|${website}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        company: r.title,
        website,
        phone: r.phone || r.phoneUnformatted || "",
        address: r.address || "",
        city: r.city || fallbackCity,
        industry: r.categoryName || fallbackIndustry,
        rating: typeof r.totalScore === "number" ? r.totalScore : undefined,
        reviews: typeof r.reviewsCount === "number" ? r.reviewsCount : undefined,
        lat: r.location?.lat,
        lng: r.location?.lng,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** For cron/saved searches: start, poll, return items. Gives up after maxWaitMs (partial results are kept). */
export async function apifyRunAndWait(
  env: Env,
  opts: { queries: string[]; location: string; max: number; language?: string },
  maxWaitMs = 240_000,
): Promise<{ businesses: PlaceBusiness[]; error?: string; runId?: string }> {
  const started = await apifyStart(env, opts);
  if ("error" in started) return { businesses: [], error: started.error };
  const run = started.run;
  const t0 = Date.now();
  let status = run.status;
  while (Date.now() - t0 < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 6000));
    const s = await apifyRunStatus(env, run.id);
    if (!s) continue;
    status = s.status;
    if (
      status === "SUCCEEDED" ||
      status === "FAILED" ||
      status === "ABORTED" ||
      status === "TIMED-OUT"
    )
      break;
  }
  const businesses = await apifyItems(
    env,
    run.defaultDatasetId,
    opts.location,
    opts.queries[0] || "",
  );
  if (status !== "SUCCEEDED") {
    if (status === "RUNNING" || status === "READY") void apifyAbort(env, run.id);
    return {
      businesses,
      runId: run.id,
      error: `Apify run ${status.toLowerCase()} — returned ${businesses.length} so far`,
    };
  }
  return { businesses, runId: run.id };
}
