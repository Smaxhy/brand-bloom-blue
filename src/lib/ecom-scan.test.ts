import { describe, expect, it, vi } from "vitest";
import type { FreeEnrichResult } from "./providers/free-enrich";
import type { SearchResult } from "./instagram";
import { ecomQueryPlan, resolveNiche } from "./ecom-brands";
import { type EcomScanDeps, type SeenBrand, ecomScanStep } from "./ecom-scan";

const SHOP = `<html><head><title>Kaiju Clothing</title>
<meta property="og:site_name" content="Kaiju Clothing"><meta name="description" content="Anime streetwear drops.">
<script>Shopify.shop = "kaiju.myshopify.com";</script></head><body class="shopify-section"><a href="/cart">Cart</a></body></html>`;
const BLOG = `<html><head><title>10 best anime brands</title></head><body><link href="/wp-content/x.css"><p>Our picks.</p></body></html>`;

/** What the website reader hands back for a site. */
function site(
  domain: string,
  html: string,
  more: Partial<FreeEnrichResult> = {},
): FreeEnrichResult {
  return {
    ok: true,
    website: domain,
    text: "",
    emails: [],
    phones: [],
    socials: { linkedin: "", facebook: "", instagram: "", tiktok: "", youtube: "" },
    ig: null,
    names: [],
    mx: true,
    pages: ["/"],
    signals: {
      https: true,
      pageCount: 1,
      metaPixel: false,
      googleAds: false,
      gtm: false,
      booking: "",
      chat: false,
      builder: "",
      copyrightYear: null,
      reviewsWidget: false,
      socialCount: 0,
    },
    pagesHtml: [{ path: "/", html }],
    ...more,
  };
}
const unreachable = (domain: string): FreeEnrichResult => ({
  ...site(domain, ""),
  ok: false,
  error: "site unreachable",
  pagesHtml: undefined,
});

function deps(
  results: SearchResult[],
  sites: Record<string, FreeEnrichResult>,
  more: Partial<EcomScanDeps> = {},
) {
  const search = vi.fn(async (_q: string, _opts: { page: number; gl: string }) => ({
    results,
    answered: true,
  }));
  const readSite = vi.fn(
    async ({ website }: { website: string; companyName: string }) =>
      sites[website] ?? unreachable(website),
  );
  // A test may bring its own search (a provider that is out, busy or slow); the reader is always this one.
  return {
    now: () => 5_000,
    ...more,
    search: (more.search ?? search) as typeof search,
    readSite,
  } satisfies EcomScanDeps;
}

const STORE_RESULTS: SearchResult[] = [
  {
    link: "https://kaijuclothing.com/collections/hoodies",
    title: "Anime Hoodies – Kaiju Clothing",
    snippet: "Free shipping over $80.",
  },
  { link: "https://www.amazon.com/s?k=anime+hoodie", title: "Amazon.com: anime hoodie" },
  { link: "https://animecollective.com/best-anime-clothing/", title: "Best anime clothing" },
  {
    link: "https://otakusupply.co.uk/products/pin",
    title: "Enamel pin – Otaku Supply",
    snippet: "Anime pins.",
  },
  { link: "https://slowshop.com/about", title: "Slow Shop" },
];

describe("a scan step that looks for shops", () => {
  it("runs one search, reads the shops it found and leaves the rest out", async () => {
    const d = deps(STORE_RESULTS, {
      "kaijuclothing.com": site("kaijuclothing.com", SHOP, {
        emails: [
          { email: "hello@kaijuclothing.com", source: "site", page: "/pages/contact", mx: true },
          { email: "info@kaijuclothing.com", source: "guess", page: "", mx: true },
        ],
        ig: {
          url: "https://www.instagram.com/kaijuclothing",
          handle: "kaijuclothing",
          confidence: "sure",
          via: "site",
          followers: null,
          why: "linked on their website, and the handle matches the business name",
        },
        socials: {
          linkedin: "",
          facebook: "",
          instagram: "https://www.instagram.com/kaijuclothing",
          tiktok: "https://www.tiktok.com/@kaiju",
          youtube: "",
        },
      }),
      "animecollective.com": site("animecollective.com", BLOG),
    });
    const out = await ecomScanStep({ niche: "anime", source: "stores", step: 0 }, d);

    expect(d.search).toHaveBeenCalledTimes(1);
    expect(d.search).toHaveBeenCalledWith('anime streetwear "powered by shopify"', {
      page: 1,
      gl: "",
    });
    // Amazon is never opened; the magazine is opened once and found not to sell.
    expect(d.readSite.mock.calls.map((c) => c[0].website).sort()).toEqual([
      "animecollective.com",
      "kaijuclothing.com",
      "otakusupply.co.uk",
      "slowshop.com",
    ]);
    expect(out).toMatchObject({
      searches: 1,
      done: false,
      stopped: false,
      retry: false,
      query: 'anime streetwear "powered by shopify"',
    });
    expect(out.skipped).toEqual({ notBrands: 1, seen: 0, notShops: 2 });
    expect(out.brands.map((b) => b.key)).toEqual(["kaijuclothing.com", "otakusupply.co.uk"]);
    expect(out.brands[0]).toMatchObject({
      name: "Kaiju Clothing",
      website: "kaijuclothing.com",
      about: "Anime streetwear drops.",
      kind: "shop",
      platform: "Shopify",
      email: "hello@kaijuclothing.com",
      instagram: "https://www.instagram.com/kaijuclothing",
      instagramSure: true,
      instagramVia: "site",
      tiktok: "https://www.tiktok.com/@kaiju",
      niche: "Anime",
      industry: "online anime brands",
      source: "stores",
      foundAt: 5_000,
      score: 80,
    });
    // Could not be opened, but the result was one of its product pages: listed as unconfirmed.
    expect(out.brands[1]).toMatchObject({
      kind: "unread",
      name: "Otaku Supply",
      about: "Anime pins.",
      email: "",
      instagram: "",
      score: 20,
    });
  });

  it("never uses a guessed address", async () => {
    const d = deps([STORE_RESULTS[0]], {
      "kaijuclothing.com": site("kaijuclothing.com", SHOP, {
        emails: [{ email: "info@kaijuclothing.com", source: "guess", page: "", mx: true }],
      }),
    });
    expect((await ecomScanStep({ niche: "anime", step: 0 }, d)).brands[0].email).toBe("");
  });

  it("does not read again what the scan already holds, or what an earlier scan returned", async () => {
    const remembered: SeenBrand[] = [];
    const d = deps(
      STORE_RESULTS,
      { "slowshop.com": site("slowshop.com", SHOP) },
      {
        hideSeen: async (list) => list.filter((b) => b.website !== "animecollective.com"),
        remember: async (list) => void remembered.push(...list),
      },
    );
    const out = await ecomScanStep(
      { niche: "anime", step: 0, have: ["KaijuClothing.com", "otakusupply.co.uk"] },
      d,
    );
    expect(d.readSite.mock.calls.map((c) => c[0].website)).toEqual(["slowshop.com"]);
    expect(out.skipped).toEqual({ notBrands: 1, seen: 1, notShops: 0 });
    expect(out.brands.map((b) => b.key)).toEqual(["slowshop.com"]);
    expect(remembered).toEqual([
      { company: "Slow Shop", website: "slowshop.com", industry: "online anime brands" },
    ]);
  });

  it("follows a shop to the address it now lives at, and drops one that leads to a marketplace", async () => {
    const d = deps(
      [
        { link: "https://kaiju.myshopify.com/", title: "Kaiju" },
        { link: "https://oldbrand.com/shop", title: "Old Brand" },
      ],
      {
        "kaiju.myshopify.com": site("kaijuclothing.com", SHOP),
        "oldbrand.com": site("etsy.com", SHOP),
      },
    );
    const out = await ecomScanStep({ niche: "anime", step: 0 }, d);
    expect(out.brands.map((b) => b.website)).toEqual(["kaijuclothing.com"]);
    expect(out.skipped.notBrands).toBe(1);
  });

  it("lists one shop once when two results lead to it", async () => {
    const d = deps(
      [
        { link: "https://kaiju.myshopify.com/", title: "Kaiju" },
        { link: "https://kaijuclothing.com/", title: "Kaiju Clothing" },
      ],
      {
        "kaiju.myshopify.com": site("kaijuclothing.com", SHOP),
        "kaijuclothing.com": site("kaijuclothing.com", SHOP),
      },
    );
    expect((await ecomScanStep({ niche: "anime", step: 0 }, d)).brands).toHaveLength(1);
  });

  it("asks for the chosen country and the right page of results", async () => {
    const d = deps([], {});
    await ecomScanStep({ niche: "handmade soap", market: "gb", step: 6 }, d);
    const plan = ecomQueryPlan(resolveNiche("handmade soap")!, "stores", {
      id: "gb",
      label: "",
      gl: "gb",
      cart: ["add to basket", "add to cart"],
      store: "official online store",
      ships: [],
    });
    expect(d.search).toHaveBeenCalledWith(plan[6].q, { page: 2, gl: "gb" });
  });
});

describe("a scan step for a provider without Google's operators", () => {
  it("asks the search that provider understands", async () => {
    const d = { ...deps([], {}), operators: false };
    await ecomScanStep({ niche: "anime", source: "stores", step: 2 }, d);
    expect(d.search).toHaveBeenCalledWith('anime merch "shop all" "new arrivals"', {
      page: 1,
      gl: "",
    });
  });
});

describe("a scan step that looks for brand pages on Instagram", () => {
  const profile = (handle: string, name: string, followers: string, bio: string): SearchResult => ({
    link: `https://www.instagram.com/${handle}/`,
    title: `${name} (@${handle}) • Instagram photos and videos`,
    snippet: `${followers} Followers, 310 Following, 245 Posts - ${name} (@${handle}) on Instagram: "${bio}"`,
  });
  const RESULTS = [
    profile(
      "kaijuclothing",
      "Kaiju Clothing",
      "12.4K",
      "Anime streetwear 🔥 Worldwide shipping 📦 kaijuclothing.com",
    ),
    profile("otaku.supply", "Otaku Supply", "950", "Small business · handmade pins · DM to order"),
    profile("animedaily", "Anime Daily", "880K", "Daily anime memes. DM for credit"),
  ];

  it("keeps the brand pages and reads the shop a page names, for its email", async () => {
    const remembered: SeenBrand[] = [];
    const d = deps(
      RESULTS,
      {
        "kaijuclothing.com": site("kaijuclothing.com", SHOP, {
          emails: [{ email: "hello@kaijuclothing.com", source: "site", page: "/", mx: true }],
          ig: {
            url: "https://www.instagram.com/kaijuclothing",
            handle: "kaijuclothing",
            confidence: "sure",
            via: "site",
            followers: null,
            why: "x",
          },
        }),
      },
      { remember: async (list) => void remembered.push(...list) },
    );
    const out = await ecomScanStep({ niche: "anime", source: "instagram", step: 0 }, d);

    expect(d.search).toHaveBeenCalledWith(
      'site:instagram.com anime streetwear brand shop "followers"',
      { page: 1, gl: "" },
    );
    expect(d.readSite).toHaveBeenCalledTimes(1);
    expect(out.skipped).toEqual({ notBrands: 1, seen: 0, notShops: 0 });
    expect(out.brands.map((b) => b.key)).toEqual(["kaijuclothing.com", "ig:otaku.supply"]);
    expect(out.brands[0]).toMatchObject({
      name: "Kaiju Clothing",
      kind: "shop",
      platform: "Shopify",
      website: "kaijuclothing.com",
      email: "hello@kaijuclothing.com",
      instagram: "https://www.instagram.com/kaijuclothing",
      instagramSure: true,
      instagramVia: "search",
      instagramWhy: "found on Instagram, and their shop links to it",
      followers: 12_400,
      source: "instagram",
      score: 95,
    });
    expect(out.brands[1]).toMatchObject({
      name: "Otaku Supply",
      kind: "page",
      website: "",
      email: "",
      instagram: "https://www.instagram.com/otaku.supply",
      instagramWhy: "found by searching Instagram for anime brands",
      followers: 950,
    });
    // The account is what is remembered, and the shop it led to.
    expect(remembered).toEqual(
      expect.arrayContaining([
        { company: "@kaijuclothing", industry: "online anime brands" },
        { company: "@otaku.supply", industry: "online anime brands" },
        {
          company: "Kaiju Clothing",
          website: "kaijuclothing.com",
          industry: "online anime brands",
        },
      ]),
    );
  });

  it("keeps the page when the shop it names cannot be opened", async () => {
    const d = deps([RESULTS[0]], {});
    const [b] = (await ecomScanStep({ niche: "anime", source: "instagram", step: 0 }, d)).brands;
    expect(b).toMatchObject({
      key: "kaijuclothing.com",
      kind: "page",
      website: "kaijuclothing.com",
      email: "",
      followers: 12_400,
    });
  });

  it("skips accounts the scan already holds", async () => {
    const d = deps(RESULTS, {});
    const out = await ecomScanStep(
      {
        niche: "anime",
        source: "instagram",
        step: 0,
        have: ["ig:kaijuclothing", "ig:otaku.supply"],
      },
      d,
    );
    expect(out.brands).toEqual([]);
    expect(d.readSite).not.toHaveBeenCalled();
  });
});

describe("a scan step and its searches", () => {
  it("spends nothing without a niche or past the end of the plan", async () => {
    const d = deps(STORE_RESULTS, {});
    expect(await ecomScanStep({ niche: "  ", step: 0 }, d)).toMatchObject({
      done: true,
      searches: 0,
      error: "Type what the brands sell.",
    });
    expect(await ecomScanStep({ niche: "anime", step: 999 }, d)).toMatchObject({
      done: true,
      searches: 0,
      brands: [],
    });
    expect(d.search).not.toHaveBeenCalled();
  });

  it("says when the plan has no further search", async () => {
    const plan = ecomQueryPlan(resolveNiche("handmade soap")!, "stores");
    const d = deps([], {});
    expect((await ecomScanStep({ niche: "handmade soap", step: plan.length - 2 }, d)).done).toBe(
      false,
    );
    expect((await ecomScanStep({ niche: "handmade soap", step: plan.length - 1 }, d)).done).toBe(
      true,
    );
  });

  it("stops when no provider can answer, and reads no site", async () => {
    const d = deps([], {}, { search: vi.fn(async () => ({ results: [], answered: false })) });
    const out = await ecomScanStep({ niche: "anime", step: 0 }, d);
    expect(out).toMatchObject({ stopped: true, retry: false, searches: 0, brands: [] });
    expect(d.readSite).not.toHaveBeenCalled();
  });

  it("asks for the same step again when the provider was only busy or slow", async () => {
    const busy = deps(
      [],
      {},
      {
        search: vi.fn(async () => ({
          results: [],
          answered: false,
          error: "Brave: busy for a moment",
        })),
      },
    );
    expect(await ecomScanStep({ niche: "anime", step: 0 }, busy)).toMatchObject({
      retry: true,
      stopped: false,
      searches: 0,
    });
    const slow = deps(
      [],
      {},
      {
        search: vi.fn(async () => {
          throw new Error("search took longer than 11 s");
        }),
      },
    );
    expect(await ecomScanStep({ niche: "anime", step: 0 }, slow)).toMatchObject({
      retry: true,
      stopped: false,
      searches: 0,
    });
  });

  it("carries on when remembering fails", async () => {
    const d = deps(
      [STORE_RESULTS[0]],
      { "kaijuclothing.com": site("kaijuclothing.com", SHOP) },
      {
        remember: async () => {
          throw new Error("db down");
        },
      },
    );
    expect((await ecomScanStep({ niche: "anime", step: 0 }, d)).brands).toHaveLength(1);
  });
});
