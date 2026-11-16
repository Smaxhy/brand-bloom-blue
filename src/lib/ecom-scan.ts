/**
 * One step of an ecom brand scan: ONE search, then the shops it found are read
 * (free) for their shop software, email and Instagram. The admin screen asks
 * for steps one at a time, so every search is counted, a scan can be stopped
 * between any two, and no request runs long.
 *
 * The search and the site reader are handed in: the route passes the scraper's
 * serialized provider waterfall and the guarded website reader, and tests run
 * without a network. Nothing here contacts a brand.
 */

import { cleanDomain } from "./business-key";
import { enrichMany } from "./enrich-site";
import { withTimeout } from "./send-errors";
import type { FreeEnrichResult } from "./providers/free-enrich";
import { igUrl, type SearchResult } from "./instagram";
import {
  type EcomBrand,
  type EcomSource,
  ecomFit,
  ecomIndustry,
  ecomMarket,
  ecomQueryPlan,
  igBrandPages,
  mergeEcomBrands,
  notABrandShop,
  readStore,
  resolveNiche,
  storeCandidates,
} from "./ecom-brands";

export interface EcomStepInput {
  /** A preset's name ("anime") or anything typed. */
  niche?: string;
  /** Country id from ECOM_MARKETS ("" = anywhere). */
  market?: string;
  source?: EcomSource;
  /** Which search of the plan to run (0 = the first). */
  step?: number;
  /** What the scan already holds (shop domains and "ig:<handle>"): never read again. */
  have?: string[];
}

export interface EcomStepResult {
  brands: EcomBrand[];
  /** The search that ran ("" when none did). */
  query: string;
  /** Searches a provider answered in this step (0 or 1): what a scan counts and pays for. */
  searches: number;
  /** The plan has no further search for this source. */
  done: boolean;
  /** No provider can answer (no searches left, no key): asking again will not help. */
  stopped: boolean;
  /** The provider was busy for a moment: the same step is worth asking again. */
  retry: boolean;
  /** What was left out, for the progress line. */
  skipped: { notBrands: number; seen: number; notShops: number };
  error?: string;
}

/** What "seen before" is judged on. */
export interface SeenBrand {
  company: string;
  website?: string;
  industry?: string;
}

export interface EcomScanDeps {
  search: (
    q: string,
    opts: { page: number; gl: string },
  ) => Promise<{ results?: SearchResult[]; answered?: boolean; error?: string }>;
  /** Reads a site's homepage and contact pages. Must hand back the HTML (`pagesHtml`). */
  readSite: (input: { website: string; companyName: string }) => Promise<FreeEnrichResult>;
  /** "Only new": drop what an earlier scan returned (and blacklisted companies). */
  hideSeen?: <T extends SeenBrand>(list: T[]) => Promise<T[]>;
  /** Remember what this step looked at, so a later scan skips it. */
  remember?: (list: SeenBrand[]) => Promise<void>;
  /** false when the search provider does not know Google's `inurl:` (Brave). */
  operators?: boolean;
  now?: () => number;
}

/** Sites read per step: one page of results at most. */
export const ECOM_SITES_PER_STEP = 10;
/** Shops named in Instagram descriptions that are read per step. */
const BIO_SITES_PER_STEP = 6;
const SITE_TIMEOUT_MS = 20_000;

const NOTHING_SKIPPED = { notBrands: 0, seen: 0, notShops: 0 };

export async function ecomScanStep(
  input: EcomStepInput,
  deps: EcomScanDeps,
): Promise<EcomStepResult> {
  const blank: EcomStepResult = {
    brands: [],
    query: "",
    searches: 0,
    done: false,
    stopped: false,
    retry: false,
    skipped: { ...NOTHING_SKIPPED },
  };
  const niche = resolveNiche(input.niche);
  if (!niche) return { ...blank, done: true, error: "Type what the brands sell." };
  const source: EcomSource = input.source === "instagram" ? "instagram" : "stores";
  const market = ecomMarket(input.market);
  const plan = ecomQueryPlan(niche, source, market, { operators: deps.operators });
  const step = Number.isFinite(Number(input.step))
    ? Math.max(0, Math.floor(Number(input.step)))
    : 0;
  const at = plan[step];
  if (!at) return { ...blank, done: true };
  const done = step >= plan.length - 1;

  let res: Awaited<ReturnType<EcomScanDeps["search"]>>;
  try {
    res = await deps.search(at.q, { page: at.page, gl: market.gl });
  } catch {
    // A search that timed out is not an empty account: the same step can be asked again.
    return { ...blank, query: at.q, retry: true };
  }
  if (!res.answered)
    return res.error
      ? { ...blank, query: at.q, retry: true }
      : { ...blank, query: at.q, stopped: true };

  const have = new Set(
    (Array.isArray(input.have) ? input.have : []).slice(0, 800).map((k) => String(k).toLowerCase()),
  );
  const foundAt = (deps.now ?? Date.now)();
  const base = {
    niche: niche.label,
    industry: ecomIndustry(niche),
    source,
    query: at.q,
    foundAt,
  };
  const finish = (b: Omit<EcomBrand, "score" | "why">): EcomBrand => ({ ...b, ...ecomFit(b) });
  const read = async (website: string, companyName: string): Promise<FreeEnrichResult | null> => {
    try {
      const fe = await withTimeout(
        deps.readSite({ website, companyName }),
        SITE_TIMEOUT_MS,
        "website",
      );
      return fe.ok ? fe : null;
    } catch {
      return null;
    }
  };
  const siteEmail = (fe: FreeEnrichResult) =>
    fe.emails.find((e) => e.source === "site")?.email ?? "";

  const brands: EcomBrand[] = [];
  const skipped = { ...NOTHING_SKIPPED };
  const looked: SeenBrand[] = [];

  if (source === "stores") {
    const found = storeCandidates(res.results ?? []);
    skipped.notBrands = found.skipped;
    const fresh = found.candidates
      .filter((c) => !have.has(c.domain))
      .map((c) => ({ ...c, company: c.name, website: c.domain }));
    const unseen = (deps.hideSeen ? await deps.hideSeen(fresh) : fresh).slice(
      0,
      ECOM_SITES_PER_STEP,
    );
    skipped.seen = fresh.length - unseen.length;

    await enrichMany(unseen, 5, async (c) => {
      looked.push({ company: c.name, website: c.domain, industry: base.industry });
      const fe = await read(c.domain, c.name);
      if (!fe) {
        // Could not be opened. Listed only when the result itself was a shop page.
        if (!c.shopLink) {
          skipped.notShops++;
          return;
        }
        brands.push(
          finish({
            ...base,
            key: c.domain,
            name: c.name,
            website: c.domain,
            about: c.snippet,
            kind: "unread",
            platform: "",
            email: "",
            instagram: "",
            instagramSure: false,
            instagramVia: "",
            instagramWhy: "",
            followers: null,
            tiktok: "",
            tools: [],
            currency: "",
          }),
        );
        return;
      }
      // Where the address really leads: a shop's old domain, or a marketplace page.
      const domain = cleanDomain(fe.website) || c.domain;
      if (domain !== c.domain) {
        if (notABrandShop(domain)) {
          skipped.notBrands++;
          return;
        }
        if (have.has(domain)) return;
        looked.push({ company: c.name, website: domain, industry: base.industry });
      }
      const facts = readStore(fe.pagesHtml ?? [], domain);
      if (!facts.sells) {
        skipped.notShops++;
        return;
      }
      brands.push(
        finish({
          ...base,
          key: domain,
          name: facts.name || c.name,
          website: domain,
          about: facts.about || c.snippet,
          kind: "shop",
          platform: facts.platform,
          email: siteEmail(fe),
          instagram: fe.ig?.url ?? "",
          instagramSure: fe.ig ? fe.ig.confidence === "sure" : false,
          instagramVia: fe.ig ? "site" : "",
          instagramWhy: fe.ig?.why ?? "",
          followers: null,
          tiktok: fe.socials.tiktok || "",
          tools: facts.tools,
          currency: facts.currency,
        }),
      );
    });
  } else {
    const found = igBrandPages(res.results ?? []);
    skipped.notBrands = found.skipped;
    const fresh = found.pages
      .filter((p) => !have.has(`ig:${p.handle}`))
      // The account is the identity: a display name changes, a handle rarely does.
      .map((p) => ({ ...p, company: `@${p.handle}`, website: "", site: p.website }));
    const unseen = deps.hideSeen ? await deps.hideSeen(fresh) : fresh;
    skipped.seen = fresh.length - unseen.length;

    let sitesLeft = BIO_SITES_PER_STEP;
    await enrichMany(unseen, 4, async (p) => {
      looked.push({ company: p.company, industry: base.industry });
      const brand: Omit<EcomBrand, "score" | "why"> = {
        ...base,
        key: `ig:${p.handle}`,
        name: p.name,
        website: p.site,
        about: p.bio,
        kind: "page",
        platform: "",
        email: "",
        instagram: igUrl(p.handle),
        instagramSure: true,
        instagramVia: "search",
        instagramWhy: `found by searching Instagram for ${niche.noun} brands`,
        followers: p.followers,
        tiktok: "",
        tools: [],
        currency: "",
      };
      // Its description names a shop: read it (free) for the email and to confirm it sells.
      if (p.site && sitesLeft > 0) {
        sitesLeft--;
        const fe = await read(p.site, p.name);
        if (fe) {
          const domain = cleanDomain(fe.website) || p.site;
          // The address in the description leads to a marketplace or a link page: not their shop.
          if (notABrandShop(domain)) brand.website = "";
          else {
            const facts = readStore(fe.pagesHtml ?? [], domain);
            brand.website = domain;
            brand.email = siteEmail(fe);
            brand.tiktok = fe.socials.tiktok || "";
            if (facts.sells) {
              brand.kind = "shop";
              brand.platform = facts.platform;
              brand.tools = facts.tools;
              brand.currency = facts.currency;
              if (!brand.about) brand.about = facts.about;
              if (p.name.startsWith("@") && facts.name) brand.name = facts.name;
            }
            // The shop links back to this very account: nothing confirms a page better.
            if (fe.ig?.handle === p.handle)
              brand.instagramWhy = "found on Instagram, and their shop links to it";
            looked.push({ company: brand.name, website: domain, industry: base.industry });
          }
        }
      }
      if (brand.website) brand.key = brand.website;
      brands.push(finish(brand));
    });
  }

  if (deps.remember && looked.length) await deps.remember(looked).catch(() => undefined);
  // Two results can lead to one shop (an old domain, a second country site).
  const unique = mergeEcomBrands([], brands).brands;
  unique.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { brands: unique, query: at.q, searches: 1, done, stopped: false, retry: false, skipped };
}
