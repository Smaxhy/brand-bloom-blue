/**
 * The Ecom scanner's list: what is shown, in which order, and how a brand
 * becomes a Raw Data row (from where it reaches Instagram DMs and outreach).
 * Pure functions, covered by tests.
 */
import { cleanDomain } from "@/lib/business-key";
import { igHandle, igUrl } from "@/lib/instagram";
import {
  type EcomBrand,
  type EcomSource,
  ecomBrandKeys,
  ecomCursorKey,
  ecomFit,
  ecomMarket,
  ecomQueryPlan,
  resolveNiche,
} from "@/lib/ecom-brands";
import type { RawBusiness } from "./store";

/** Brands kept in the list (and saved with the account) at most. */
export const ECOM_LIST_MAX = 1000;

/** A list that grew past the limit keeps the newest finds; among those of one scan, the best. */
export function trimEcomList(brands: EcomBrand[], max = ECOM_LIST_MAX): EcomBrand[] {
  if (brands.length <= max) return brands;
  const keep = new Set(
    brands
      .slice()
      .sort((a, b) => b.foundAt - a.foundAt || b.score - a.score)
      .slice(0, max)
      .map((b) => b.key),
  );
  return brands.filter((b) => keep.has(b.key));
}

/** How many searches one scan may use: the choices on the screen. */
export const ECOM_SEARCH_CHOICES = [10, 20, 40] as const;

const text = (v: unknown, max = 300): string => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * The list as it was saved, made safe to show: only whole brands, every field
 * of the kind the screen expects. Anything else in a saved list is dropped.
 */
export function cleanEcomBrands(value: unknown): EcomBrand[] {
  if (!Array.isArray(value)) return [];
  const out: EcomBrand[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Partial<EcomBrand>;
    const key = text(b.key, 120).toLowerCase();
    if (!key || seen.has(key)) continue;
    const handle = igHandle(text(b.instagram));
    const website = cleanDomain(text(b.website, 120));
    if (!website && !handle) continue;
    seen.add(key);
    const kind: EcomBrand["kind"] = b.kind === "shop" || b.kind === "unread" ? b.kind : "page";
    const followers =
      typeof b.followers === "number" && Number.isFinite(b.followers) && b.followers >= 0
        ? Math.round(b.followers)
        : null;
    const brand: Omit<EcomBrand, "score" | "why"> = {
      key,
      name: text(b.name, 80) || website || `@${handle}`,
      website,
      about: text(b.about),
      kind,
      platform: text(b.platform, 40),
      email: text(b.email, 120),
      instagram: handle ? igUrl(handle) : "",
      instagramSure: handle ? b.instagramSure === true : false,
      instagramVia:
        handle && (b.instagramVia === "site" || b.instagramVia === "search") ? b.instagramVia : "",
      instagramWhy: handle ? text(b.instagramWhy) : "",
      followers: handle ? followers : null,
      tiktok: text(b.tiktok, 200),
      tools: Array.isArray(b.tools)
        ? b.tools.filter((t): t is string => typeof t === "string").slice(0, 8)
        : [],
      currency: text(b.currency, 3),
      niche: text(b.niche, 60),
      industry: text(b.industry, 120),
      source: b.source === "instagram" ? "instagram" : "stores",
      query: text(b.query),
      foundAt: typeof b.foundAt === "number" && Number.isFinite(b.foundAt) ? b.foundAt : 0,
    };
    out.push({ ...brand, ...ecomFit(brand) });
    if (out.length >= ECOM_LIST_MAX) break;
  }
  return out;
}

/* ------------------------------------------------- where a scan carries on */

/** Niches whose progress is remembered at most. */
const ECOM_CURSORS_MAX = 60;

/** The saved progress made safe to use: whole numbers per niche, the newest kept. */
export function cleanEcomCursors(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key, at]) =>
      key.length > 0 &&
      key.length <= 200 &&
      typeof at === "number" &&
      Number.isInteger(at) &&
      at >= 0 &&
      at < 1000,
  ) as [string, number][];
  return Object.fromEntries(entries.slice(-ECOM_CURSORS_MAX));
}

/**
 * Where a scan starts in each source's list of searches. With "Only new" it
 * carries on after the searches an earlier scan of the same niche and country
 * already ran: asking those again would cost a search each and return brands
 * that are hidden anyway. Once every search has run it starts over (new shops
 * appear all the time). Without "Only new" it always starts at the top.
 */
export function ecomStartAt(
  cursors: Record<string, number> | undefined,
  scan: { niche: string; market: string; sources: EcomSource[]; onlyNew: boolean },
): { startAt: Partial<Record<EcomSource, number>>; continuing: boolean } {
  const startAt: Partial<Record<EcomSource, number>> = {};
  const niche = resolveNiche(scan.niche);
  if (!niche || !scan.onlyNew) return { startAt, continuing: false };
  for (const source of scan.sources) {
    const at = cursors?.[ecomCursorKey(scan.niche, scan.market, source)] ?? 0;
    const searches = ecomQueryPlan(niche, source, ecomMarket(scan.market)).length;
    if (at > 0 && at < searches) startAt[source] = at;
  }
  return { startAt, continuing: Object.keys(startAt).length > 0 };
}

/** The progress to save after a scan: where each source it used now stands. */
export function ecomCursorsAfter(
  cursors: Record<string, number> | undefined,
  scan: { niche: string; market: string; sources: EcomSource[] },
  next: Partial<Record<EcomSource, number>>,
): Record<string, number> {
  const out = { ...cleanEcomCursors(cursors) };
  for (const source of scan.sources) {
    const key = ecomCursorKey(scan.niche, scan.market, source);
    const at = next[source];
    if (!key || typeof at !== "number" || !Number.isInteger(at) || at < 0) continue;
    // Re-inserted so the niche scanned last is the one kept longest.
    delete out[key];
    out[key] = at;
  }
  return cleanEcomCursors(out);
}

/* ------------------------------------------------------------- the list */

export type EcomFilter = "all" | "instagram" | "email" | "both";

export const ECOM_FILTERS: { id: EcomFilter; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "Every brand found" },
  { id: "instagram", label: "With Instagram", hint: "Brands you can DM" },
  { id: "email", label: "With email", hint: "Brands you can email" },
  { id: "both", label: "Instagram + email", hint: "Brands you can reach both ways" },
];

const passes = (b: EcomBrand, filter: EcomFilter): boolean =>
  filter === "instagram"
    ? !!b.instagram
    : filter === "email"
      ? !!b.email
      : filter === "both"
        ? !!b.instagram && !!b.email
        : true;

export function ecomCounts(brands: EcomBrand[]): Record<EcomFilter, number> {
  const counts: Record<EcomFilter, number> = { all: 0, instagram: 0, email: 0, both: 0 };
  for (const b of brands) for (const f of ECOM_FILTERS) if (passes(b, f.id)) counts[f.id]++;
  return counts;
}

/** Search box: name, site, Instagram account, what it sells, email. */
export function ecomMatches(b: EcomBrand, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return true;
  return [b.name, b.website, igHandle(b.instagram), b.about, b.email, b.platform, b.niche].some(
    (v) => v.toLowerCase().includes(q),
  );
}

export type EcomSortKey = "score" | "followers" | "name" | "found";
export interface EcomSort {
  key: EcomSortKey;
  dir: "asc" | "desc";
}

export const ECOM_SORTS: { value: string; label: string; sort: EcomSort }[] = [
  { value: "score:desc", label: "Best to contact first", sort: { key: "score", dir: "desc" } },
  { value: "followers:desc", label: "Most followers", sort: { key: "followers", dir: "desc" } },
  { value: "followers:asc", label: "Fewest followers", sort: { key: "followers", dir: "asc" } },
  { value: "found:desc", label: "Newest found", sort: { key: "found", dir: "desc" } },
  { value: "name:asc", label: "Name A–Z", sort: { key: "name", dir: "asc" } },
];

/** Sort the list. Brands without the value (no follower count) always come last. */
export function sortEcomBrands(brands: EcomBrand[], sort: EcomSort): EcomBrand[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const byName = (a: EcomBrand, b: EcomBrand) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  return brands.slice().sort((a, b) => {
    if (sort.key === "name") return sign * byName(a, b);
    if (sort.key === "followers") {
      if (a.followers == null || b.followers == null)
        return (
          Number(a.followers == null) - Number(b.followers == null) ||
          b.score - a.score ||
          byName(a, b)
        );
      return sign * (a.followers - b.followers) || b.score - a.score || byName(a, b);
    }
    if (sort.key === "found")
      return sign * (a.foundAt - b.foundAt) || b.score - a.score || byName(a, b);
    return sign * (a.score - b.score) || (b.followers ?? -1) - (a.followers ?? -1) || byName(a, b);
  });
}

export function ecomVisible(
  brands: EcomBrand[],
  view: { filter: EcomFilter; q: string; niche: string; sort: EcomSort },
): EcomBrand[] {
  return sortEcomBrands(
    brands.filter(
      (b) =>
        passes(b, view.filter) && ecomMatches(b, view.q) && (!view.niche || b.niche === view.niche),
    ),
    view.sort,
  );
}

/** The niches in the list, the most brands first: for the filter when there is more than one. */
export function ecomNiches(brands: EcomBrand[]): { niche: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const b of brands) if (b.niche) counts.set(b.niche, (counts.get(b.niche) ?? 0) + 1);
  return [...counts.entries()]
    .map(([niche, n]) => ({ niche, n }))
    .sort((a, b) => b.n - a.n || a.niche.localeCompare(b.niche));
}

/* ------------------------------------------------------- into Raw Data */

/**
 * A brand as a Raw Data row. Its Instagram goes along with where it was found
 * and why, so it lands in the right section of Instagram DMs; its trade
 * ("online anime brands") is what the DM list and outreach filter on.
 */
export function ecomToRaw(b: EcomBrand, id: string, now = Date.now()): RawBusiness {
  const handle = igHandle(b.instagram);
  return {
    id,
    business: b.name || b.website || (handle ? `@${handle}` : ""),
    email: b.email,
    phone: "",
    website: b.website,
    city: "",
    industry: b.industry,
    status: "raw",
    scrapedAt: now,
    source: "Ecom scanner",
    emailSource: b.email ? "Website" : undefined,
    score: b.score,
    scoreWhy: b.why,
    instagram: handle ? igUrl(handle) : undefined,
    instagramSure: handle ? b.instagramSure : undefined,
    instagramFollowers: handle ? (b.followers ?? undefined) : undefined,
    instagramVia: handle ? b.instagramVia || undefined : undefined,
    instagramWhy: handle ? b.instagramWhy || undefined : undefined,
  };
}

/** The shops and Instagram accounts already saved in Raw Data, as brand keys. */
export function ecomSavedKeys(raw: Pick<RawBusiness, "website" | "instagram">[]): Set<string> {
  const keys = new Set<string>();
  for (const row of raw) {
    const domain = cleanDomain(row.website);
    if (domain) keys.add(domain);
    const handle = igHandle(row.instagram || "");
    if (handle) keys.add(`ig:${handle}`);
  }
  return keys;
}

export const ecomIsSaved = (b: EcomBrand, saved: Set<string>): boolean =>
  ecomBrandKeys(b).some((k) => saved.has(k));

/* ----------------------------------------------------------- one scan */

export interface EcomScanTally {
  /** Searches a provider answered: what was paid for. */
  searches: number;
  /** New brands this scan put in the list. */
  found: number;
  withInstagram: number;
  withEmail: number;
  notBrands: number;
  seen: number;
  notShops: number;
}

const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;

/** What a finished scan tells the user, in one line. */
export function ecomScanSummary(
  t: EcomScanTally,
  why: "done" | "stopped" | "dry" | "plan" = "done",
): string {
  const head = t.found
    ? `Found ${many(t.found, "new brand")} with ${many(t.searches, "search", "searches")}: ${t.withInstagram} with Instagram, ${t.withEmail} with an email`
    : t.searches
      ? `No new brands in ${many(t.searches, "search", "searches")}`
      : "No search was used";
  const left = [
    t.seen ? `${t.seen} found before` : "",
    t.notBrands
      ? `${many(t.notBrands, "marketplace, big name or fan page", "marketplaces, big names and fan pages")}`
      : "",
    t.notShops ? `${many(t.notShops, "site that sells nothing", "sites that sell nothing")}` : "",
  ].filter(Boolean);
  const tail =
    why === "stopped"
      ? " Stopped."
      : why === "dry"
        ? " Stopped early: the last searches found nothing new."
        : why === "plan"
          ? " Every search for this niche has run."
          : "";
  return `${head}.${left.length ? ` Left out: ${left.join(", ")}.` : ""}${tail}`;
}
