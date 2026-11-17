/**
 * One step of an ecom brand scan: ONE search, then the shops it found are read
 * (free) for their shop software, email and Instagram, where they are based,
 * and what their catalogue holds. With a country chosen, brands based
 * elsewhere are left out. The admin screen asks for steps one at a time, so
 * every search is counted, a scan can be stopped between any two, and no
 * request runs long.
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
  type ShopCatalog,
  type ShopMeta,
  type StorePlace,
  bioPlace,
  nicheMatch,
  pageText,
  plainCountryEnding,
  shopifyCatalog,
  shopifyMeta,
  slowDelivery,
  storePlace,
} from "./ecom-detail";
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
  /**
   * With a country chosen: list only brands whose own site confirms they are
   * based there (the default). false also lists brands that do not say where
   * they are; brands that say another country are left out either way.
   */
  strict?: boolean;
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
  skipped: EcomSkipped;
  error?: string;
}

export interface EcomSkipped {
  notBrands: number;
  seen: number;
  notShops: number;
  /** Based in another country than the one asked for. */
  elsewhere: number;
  /** Do not say where they are based (only left out when the scan is strict). */
  unplaced: number;
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
    opts: { page: number; gl: string; hl: string },
  ) => Promise<{ results?: SearchResult[]; answered?: boolean; error?: string }>;
  /** Reads a site's homepage and contact pages. Must hand back the HTML (`pagesHtml`). */
  readSite: (input: { website: string; companyName: string }) => Promise<FreeEnrichResult>;
  /**
   * One of the two public files a Shopify shop publishes about itself, as
   * parsed JSON (null when it could not be read): "meta" is /meta.json (where
   * the shop is registered, how many products it has), "products" is the
   * newest part of /products.json.
   */
  readShopFile?: (domain: string, file: "meta" | "products") => Promise<unknown>;
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
const SHOP_FILE_TIMEOUT_MS = 9_000;
/** A step that has run this long stops opening shop files, so its answer still arrives in time. */
const STEP_BUDGET_MS = 45_000;

const NOTHING_SKIPPED: EcomSkipped = {
  notBrands: 0,
  seen: 0,
  notShops: 0,
  elsewhere: 0,
  unplaced: 0,
};

/** Where a shop is, from its pages and (Shopify) its shop file. */
interface ShopPlace {
  place: StorePlace;
  meta: ShopMeta;
  /** What a visitor reads on the pages that were opened, footers included. */
  text: string;
}
/** What reading a shop adds to a brand beyond its contact details. */
interface ShopDetail extends ShopPlace {
  catalog: ShopCatalog;
}

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
    res = await deps.search(at.q, { page: at.page, gl: market.gl, hl: market.hl });
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
  const started = Date.now();
  const base = {
    niche: niche.label,
    industry: ecomIndustry(niche),
    source,
    query: at.q,
    foundAt,
    market: market.id,
  };
  const home = market.id.toUpperCase();
  const strict = !!home && input.strict !== false;
  const finish = (b: Omit<EcomBrand, "score" | "why">): EcomBrand => ({
    ...b,
    ...ecomFit(b, foundAt),
  });
  /**
   * Is a shop based where the scan asked? "no" = its own site says another
   * country, "unknown" = it does not say (a currency or a phone code alone is
   * a hint, not an answer).
   */
  const based = (place: StorePlace): "yes" | "no" | "unknown" =>
    !home
      ? "yes"
      : place.country === home
        ? place.sure || !strict
          ? "yes"
          : "unknown"
        : place.country && place.sure
          ? "no"
          : "unknown";
  /** A web address that is plainly another country's (.co.uk, .de) says enough: such a shop is not opened at all. */
  const abroad = (domain: string) => {
    const ending = plainCountryEnding(domain);
    return !!home && !!ending && ending !== home;
  };
  const shopFile = async (
    domain: string,
    platform: string,
    file: "meta" | "products",
  ): Promise<unknown> => {
    if (platform !== "Shopify" || !deps.readShopFile || Date.now() - started > STEP_BUDGET_MS)
      return null;
    try {
      return await withTimeout(deps.readShopFile(domain, file), SHOP_FILE_TIMEOUT_MS, "shop file");
    } catch {
      return null;
    }
  };
  /** Where a shop is based, from its pages and (Shopify) the file that says where it is registered. */
  const placeOf = async (
    fe: FreeEnrichResult,
    domain: string,
    platform: string,
    currency: string,
  ): Promise<ShopPlace> => {
    const meta = shopifyMeta(await shopFile(domain, platform, "meta"));
    const pages = fe.pagesHtml ?? [];
    // The reader's own text stops after the first screens of each page; the address is in the footer.
    const text = pages.length ? pages.map((p) => pageText(p.html)).join("\n") : fe.text;
    const place = storePlace({
      domain,
      pages,
      text,
      phones: fe.phones,
      currency: meta.currency || currency,
      meta,
      market,
    });
    return { place, meta, text };
  };
  /** What its catalogue holds: only asked of a shop that is going to be listed. */
  const withCatalog = async (
    at: ShopPlace,
    domain: string,
    platform: string,
  ): Promise<ShopDetail> => ({
    ...at,
    catalog: shopifyCatalog(await shopFile(domain, platform, "products")),
  });
  /** The fields a read shop adds to a brand. */
  const shopFields = (
    fe: FreeEnrichResult,
    d: ShopDetail,
    shop: { name: string; about: string; currency: string },
  ) => ({
    currency: d.meta.currency || shop.currency,
    country: d.place.country,
    countrySure: d.place.sure,
    place: d.place.place,
    countryWhy: d.place.why,
    match: nicheMatch(niche, {
      name: shop.name,
      about: shop.about || d.meta.about,
      text: d.text,
      catalog: d.catalog.sample ? d.catalog : null,
    }),
    products: d.meta.products ?? (d.catalog.whole ? d.catalog.sample : null),
    priceFrom: d.catalog.priceFrom,
    priceTo: d.catalog.priceTo,
    newest: d.catalog.newest,
    updated: d.catalog.updated,
    phone: (fe.phones[0] || "").slice(0, 40),
    slow: slowDelivery(d.text),
  });
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
  /**
   * Left out for where it is (or for not saying): not remembered as seen, so a
   * scan for another country, or one that also keeps unconfirmed brands, can
   * still list it.
   */
  const leftForPlace = new Set<string>();

  if (source === "stores") {
    const found = storeCandidates(res.results ?? []);
    skipped.notBrands = found.skipped;
    const fresh = found.candidates
      .filter((c) => !have.has(c.domain))
      .filter((c) => {
        if (!abroad(c.domain)) return true;
        skipped.elsewhere++;
        return false;
      })
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
        // Nothing was read, so nothing says where it is: a strict scan cannot list it.
        if (strict) {
          skipped.unplaced++;
          leftForPlace.add(c.domain);
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
      const at = await placeOf(fe, domain, facts.platform, facts.currency);
      const where = based(at.place);
      if (where === "no" || (where === "unknown" && strict)) {
        if (where === "no") skipped.elsewhere++;
        else skipped.unplaced++;
        leftForPlace.add(c.domain).add(domain);
        return;
      }
      const d = await withCatalog(at, domain, facts.platform);
      const name = facts.name || d.meta.name || c.name;
      const about = facts.about || d.meta.about || c.snippet;
      brands.push(
        finish({
          ...base,
          key: domain,
          name,
          website: domain,
          about,
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
          ...shopFields(fe, d, { name, about, currency: facts.currency }),
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
      // What the page itself says about where the brand is. A page that names another country is not opened further.
      let place = bioPlace(`${p.name} ${p.bio}`, market);
      let where: "yes" | "no" | "unknown" = !home
        ? "yes"
        : !place.country
          ? "unknown"
          : place.country === home
            ? "yes"
            : "no";
      // A few words of description cannot show that a page does not sell the niche: only that it does.
      if (nicheMatch(niche, { name: p.name, about: p.bio }) === "strong") brand.match = "strong";
      // Its description names a shop: read it (free) for the email and to confirm it sells.
      if (p.site && sitesLeft > 0 && where !== "no" && !abroad(p.site)) {
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
              if (!brand.about) brand.about = facts.about;
              if (p.name.startsWith("@") && facts.name) brand.name = facts.name;
              const at = await placeOf(fe, domain, facts.platform, facts.currency);
              // What the shop's own site confirms settles it; a hint from the shop only counts when the page says nothing.
              if (at.place.sure || (!place.country && at.place.country)) {
                place = at.place;
                where = based(at.place);
              }
              if (where === "yes" || (where === "unknown" && !strict)) {
                const d = await withCatalog(at, domain, facts.platform);
                // The page's own words count as the shop's description, so a page that names the niche is never "none".
                Object.assign(
                  brand,
                  shopFields(fe, d, {
                    name: brand.name,
                    about: brand.about,
                    currency: facts.currency,
                  }),
                );
              }
            }
            // The shop links back to this very account: nothing confirms a page better.
            if (fe.ig?.handle === p.handle)
              brand.instagramWhy = "found on Instagram, and their shop links to it";
            looked.push({ company: brand.name, website: domain, industry: base.industry });
          }
        }
      }
      // A shop address of another country: the page is theirs, the brand is not from here.
      if (p.site && abroad(p.site)) {
        place = storePlace({ domain: p.site });
        where = "no";
      }
      if (brand.website) brand.key = brand.website;
      brand.country = place.country;
      brand.countrySure = place.sure;
      brand.place = place.place;
      brand.countryWhy = place.why;
      // An Instagram page that names the country is as much as a page can say: it is listed, marked as its own word.
      if (where === "no" || (where === "unknown" && strict)) {
        if (where === "no") skipped.elsewhere++;
        else skipped.unplaced++;
        leftForPlace.add(p.company);
        if (brand.website) leftForPlace.add(brand.website);
        return;
      }
      brands.push(finish(brand));
    });
  }

  const toRemember = looked.filter((l) => !leftForPlace.has(l.website || l.company));
  if (deps.remember && toRemember.length) await deps.remember(toRemember).catch(() => undefined);
  // Two results can lead to one shop (an old domain, a second country site).
  const unique = mergeEcomBrands([], brands).brands;
  unique.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { brands: unique, query: at.q, searches: 1, done, stopped: false, retry: false, skipped };
}
