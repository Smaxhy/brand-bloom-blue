import { describe, expect, it, vi } from "vitest";
import type { FreeEnrichResult } from "./providers/free-enrich";
import type { SearchResult } from "./instagram";
import { ecomMarket, ecomQueryPlan, resolveNiche } from "./ecom-brands";
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
  const search = vi.fn(async (_q: string, _opts: { page: number; gl: string; hl: string }) => ({
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
      hl: "",
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
    expect(out.skipped).toEqual({ notBrands: 1, seen: 0, notShops: 2, elsewhere: 0, unplaced: 0 });
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
      match: "strong",
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
    expect(out.skipped).toEqual({ notBrands: 1, seen: 1, notShops: 0, elsewhere: 0, unplaced: 0 });
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
    await ecomScanStep({ niche: "handmade soap", market: "gb", step: 9 }, d);
    const plan = ecomQueryPlan((resolveNiche("handmade soap") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }), "stores", ecomMarket("gb"));
    expect(plan[9]).toEqual({ q: 'handmade soap "powered by shopify"', page: 2 });
    expect(d.search).toHaveBeenCalledWith(plan[9].q, { page: 2, gl: "gb", hl: "en" });
  });
});

describe("a scan step for a provider without Google's operators", () => {
  it("asks the search that provider understands", async () => {
    const d = { ...deps([], {}), operators: false };
    await ecomScanStep({ niche: "anime", source: "stores", step: 2 }, d);
    expect(d.search).toHaveBeenCalledWith('anime merch "shop all" "new arrivals"', {
      page: 1,
      gl: "",
      hl: "",
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
      { page: 1, gl: "", hl: "" },
    );
    expect(d.readSite).toHaveBeenCalledTimes(1);
    expect(out.skipped).toEqual({ notBrands: 1, seen: 0, notShops: 0, elsewhere: 0, unplaced: 0 });
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
      match: "strong",
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
    const plan = ecomQueryPlan((resolveNiche("handmade soap") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }), "stores");
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

/* ------------------------------------------------------------------ a country */

const WOO = (title: string, body: string) => `<html><head><title>${title}</title>
<meta name="description" content="Anime tees and hoodies."></head>
<body class="home woocommerce-no-js"><a class="button" href="?add-to-cart=12">Add to cart</a>${body}</body></html>`;
const shopify = (name: string, more = "") => `<html><head><title>${name}</title>
<meta property="og:site_name" content="${name}"><meta name="description" content="Anime streetwear drops.">
<script>Shopify.shop = "x.myshopify.com";${more}</script></head><body class="shopify-section"><a href="/cart">Cart</a></body></html>`;

const product = (n: number) => ({
  title: `Kaiju anime hoodie ${n}`,
  product_type: "Hoodies",
  tags: ["anime"],
  published_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
  variants: [{ price: String(40 + n) }],
});
/** What the shops publish about themselves: only Kaiju and Nordic Threads answer. */
const FILES: Record<string, { meta?: unknown; products?: unknown }> = {
  "kaijuclothing.com": {
    meta: {
      name: "Kaiju Clothing",
      country: "US",
      province: "Texas",
      city: "Austin",
      currency: "USD",
      published_products_count: 148,
    },
    products: { products: Array.from({ length: 12 }, (_, i) => product(i)) },
  },
  "nordicthreads.com": {
    meta: { country: "SE", city: "Malmö", currency: "SEK" },
    products: { products: [product(1)] },
  },
};
const shopFiles = () =>
  vi.fn(async (domain: string, file: "meta" | "products") => FILES[domain]?.[file] ?? null);
/** The day these scans run: the products above are a few weeks old. */
const TODAY = { now: () => Date.parse("2026-11-16T12:00:00Z") };

const COUNTRY_RESULTS: SearchResult[] = [
  {
    link: "https://kaijuclothing.com/collections/hoodies",
    title: "Anime Hoodies – Kaiju Clothing",
  },
  { link: "https://teaandtoast.co.uk/collections/anime", title: "Anime tees – Tea and Toast" },
  { link: "https://nordicthreads.com/collections/all", title: "Nordic Threads" },
  { link: "https://quietshop.com/shop/", title: "Quiet Shop" },
  { link: "https://mapleanime.com/shop/", title: "Maple Anime" },
  { link: "https://liberty-anime.com/shop/", title: "Liberty Anime" },
  { link: "https://poundshop.com/collections/all", title: "Pound Shop" },
  { link: "https://www.amazon.com/s?k=anime+hoodie", title: "Amazon.com: anime hoodie" },
];
const COUNTRY_SITES = () => ({
  "kaijuclothing.com": site("kaijuclothing.com", shopify("Kaiju Clothing"), {
    phones: ["+1 512 555 0100"],
  }),
  "nordicthreads.com": site("nordicthreads.com", shopify("Nordic Threads")),
  "quietshop.com": site("quietshop.com", WOO("Quiet Shop", "<p>Anime tees for everyone.</p>")),
  "mapleanime.com": site(
    "mapleanime.com",
    WOO("Maple Anime", "<footer>44 Queen St, Ottawa, ON K1P 5C5</footer>"),
  ),
  "liberty-anime.com": site(
    "liberty-anime.com",
    WOO(
      "Liberty Anime",
      `${"<p>New anime drop every Friday.</p>".repeat(1500)}<footer>Liberty Anime LLC, 12 Wall St, New York, NY 10005</footer>`,
    ),
  ),
  "poundshop.com": site(
    "poundshop.com",
    shopify("Pound Shop", ' Shopify.currency = {"active":"GBP","rate":"1.0"};'),
  ),
});

describe("a scan step for one country", () => {
  it("lists only shops whose own site confirms they are based there", async () => {
    const readShopFile = shopFiles();
    const d = deps(COUNTRY_RESULTS, COUNTRY_SITES(), { readShopFile, ...TODAY });
    const out = await ecomScanStep({ niche: "anime", market: "us", step: 1 }, d);

    expect(d.search).toHaveBeenCalledWith('anime clothing "powered by shopify"', {
      page: 1,
      gl: "us",
      hl: "en",
    });
    expect(out.brands.map((b) => b.key)).toEqual(["kaijuclothing.com", "liberty-anime.com"]);
    // Sweden by its shop file, Canada by its address, Britain by its web address; two shops say nothing.
    expect(out.skipped).toEqual({ notBrands: 1, seen: 0, notShops: 0, elsewhere: 3, unplaced: 2 });
    // A British web address is not even opened.
    expect(d.readSite.mock.calls.map((c) => c[0].website).sort()).toEqual([
      "kaijuclothing.com",
      "liberty-anime.com",
      "mapleanime.com",
      "nordicthreads.com",
      "poundshop.com",
      "quietshop.com",
    ]);
    // The catalogue is only asked of a shop that is going to be listed.
    expect(readShopFile.mock.calls.map((c) => c.join(" ")).sort()).toEqual([
      "kaijuclothing.com meta",
      "kaijuclothing.com products",
      "nordicthreads.com meta",
      "poundshop.com meta",
    ]);
    expect(out.brands[0]).toMatchObject({
      name: "Kaiju Clothing",
      market: "us",
      country: "US",
      countrySure: true,
      place: "Austin, Texas",
      countryWhy: "their shop is registered in Austin, Texas",
      currency: "USD",
      match: "strong",
      products: 148,
      priceFrom: 41,
      priceTo: 50,
      newest: "2026-10-20",
      updated: "2026-11-10",
      phone: "+1 512 555 0100",
      slow: false,
    });
    expect(out.brands[0].why).toEqual([
      "Shopify shop",
      "based in Austin, Texas",
      "sells anime",
      "new products in the last 3 months",
    ]);
    expect(out.brands[0].score).toBe(40);
    // No shop file to go by: the address in the footer of a long homepage.
    expect(out.brands[1]).toMatchObject({
      country: "US",
      countrySure: true,
      place: "New York, New York",
      countryWhy: "a US address on their site",
      products: null,
      priceFrom: null,
      newest: "",
    });
  });

  it("does not remember the shops it left out for where they are, so another scan can still list them", async () => {
    const remembered: SeenBrand[] = [];
    const remember = async (list: SeenBrand[]) => void remembered.push(...list);
    const d = deps(COUNTRY_RESULTS, COUNTRY_SITES(), { readShopFile: shopFiles(), remember });
    await ecomScanStep({ niche: "anime", market: "us", step: 1 }, d);
    expect(remembered.map((r) => r.website).sort()).toEqual([
      "kaijuclothing.com",
      "liberty-anime.com",
    ]);
    // The scan that keeps unconfirmed brands too remembers the two it lists on top.
    remembered.length = 0;
    const loose = deps(COUNTRY_RESULTS, COUNTRY_SITES(), { readShopFile: shopFiles(), remember });
    await ecomScanStep({ niche: "anime", market: "us", step: 1, strict: false }, loose);
    expect(remembered.map((r) => r.website).sort()).toEqual([
      "kaijuclothing.com",
      "liberty-anime.com",
      "poundshop.com",
      "quietshop.com",
    ]);
    // A site that sells nothing is remembered wherever it is: no scan needs to open it again.
    remembered.length = 0;
    const blog = deps(
      [{ link: "https://animecollective.com/best/", title: "Best anime brands" }],
      { "animecollective.com": site("animecollective.com", BLOG) },
      { remember },
    );
    await ecomScanStep({ niche: "anime", market: "us", step: 1 }, blog);
    expect(remembered.map((r) => r.website)).toEqual(["animecollective.com"]);
  });

  it("also lists shops that do not say where they are when asked to, marked as not confirmed", async () => {
    const d = deps(COUNTRY_RESULTS, COUNTRY_SITES(), { readShopFile: shopFiles() });
    const out = await ecomScanStep({ niche: "anime", market: "us", step: 1, strict: false }, d);
    expect(out.brands.map((b) => b.key).sort()).toEqual([
      "kaijuclothing.com",
      "liberty-anime.com",
      "poundshop.com",
      "quietshop.com",
    ]);
    // Brands that say another country stay out either way.
    expect(out.skipped).toEqual({ notBrands: 1, seen: 0, notShops: 0, elsewhere: 3, unplaced: 0 });
    const quiet = out.brands.find((b) => b.key === "quietshop.com");
    expect(quiet).toMatchObject({ market: "us", country: "", countrySure: false, place: "" });
    expect(quiet?.why).toContain("country not confirmed");
    // Prices in pounds are a hint, not an answer: listed, and said so.
    const pound = out.brands.find((b) => b.key === "poundshop.com");
    expect(pound).toMatchObject({ country: "GB", countrySure: false, countryWhy: "prices in GBP" });
    expect(pound?.why).toContain("may be in the United Kingdom");
    // Confirmed brands come first.
    expect(out.brands.slice(0, 2).map((b) => b.key)).toEqual([
      "kaijuclothing.com",
      "liberty-anime.com",
    ]);
  });

  it("opens a shop whose web address only might be another country's, and goes by what it says", async () => {
    // ".it" spells a word as often as it means Italy: this shop is registered in Texas.
    const results = [{ link: "https://wear.it/collections/all", title: "Wear It" }];
    const files = vi.fn(async (_d: string, file: "meta" | "products") =>
      file === "meta" ? { country: "US", city: "Dallas", province: "Texas" } : null,
    );
    const d = deps(
      results,
      { "wear.it": site("wear.it", shopify("Wear It")) },
      { readShopFile: files },
    );
    const out = await ecomScanStep({ niche: "anime", market: "us", step: 0 }, d);
    expect(d.readSite).toHaveBeenCalledTimes(1);
    expect(out.brands).toHaveLength(1);
    expect(out.brands[0]).toMatchObject({
      country: "US",
      countrySure: true,
      place: "Dallas, Texas",
    });
    // Without anything stronger, the ending stands.
    const bare = deps(
      results,
      { "wear.it": site("wear.it", shopify("Wear It")) },
      { readShopFile: vi.fn(async () => null) },
    );
    const left = await ecomScanStep({ niche: "anime", market: "us", step: 0 }, bare);
    expect(left.brands).toEqual([]);
    expect(left.skipped.elsewhere).toBe(1);
  });

  it("does not list a shop it could not open: nothing says where it is", async () => {
    const results = [{ link: "https://closedshop.com/products/tee", title: "Tee – Closed Shop" }];
    const strict = await ecomScanStep({ niche: "anime", market: "us", step: 0 }, deps(results, {}));
    expect(strict.brands).toEqual([]);
    expect(strict.skipped.unplaced).toBe(1);
    const loose = await ecomScanStep(
      { niche: "anime", market: "us", step: 0, strict: false },
      deps(results, {}),
    );
    expect(loose.brands).toHaveLength(1);
    expect(loose.brands[0]).toMatchObject({ kind: "unread", market: "us" });
    expect(loose.brands[0].why).toContain("country not confirmed");
  });

  it("filters nothing without a country, and still says where a shop is", async () => {
    const d = deps(COUNTRY_RESULTS, COUNTRY_SITES(), { readShopFile: shopFiles(), ...TODAY });
    const out = await ecomScanStep({ niche: "anime", step: 0, strict: true }, d);
    expect(out.skipped).toMatchObject({ elsewhere: 0, unplaced: 0 });
    // The British shop is opened this time (and cannot be read in this test, so it is listed unconfirmed).
    expect(out.brands.map((b) => b.key).sort()).toEqual([
      "kaijuclothing.com",
      "liberty-anime.com",
      "mapleanime.com",
      "nordicthreads.com",
      "poundshop.com",
      "quietshop.com",
      "teaandtoast.co.uk",
    ]);
    expect(out.brands.find((b) => b.key === "nordicthreads.com")).toMatchObject({
      market: "",
      country: "SE",
      countrySure: true,
    });
    expect(out.brands.find((b) => b.key === "mapleanime.com")).toMatchObject({
      country: "CA",
      place: "Ottawa, Ontario",
    });
    // No country was asked for, so where a brand is does not count for or against it.
    expect(out.brands.find((b) => b.key === "kaijuclothing.com")?.why).toEqual([
      "Shopify shop",
      "sells anime",
      "new products in the last 3 months",
    ]);
  });

  it("judges a shop by its pages when its shop files cannot be read", async () => {
    const results = [COUNTRY_RESULTS[0]];
    const sites = {
      "kaijuclothing.com": site(
        "kaijuclothing.com",
        shopify("Kaiju Clothing").replace("</body>", "<p>Proudly made in the USA.</p></body>"),
      ),
    };
    for (const readShopFile of [
      vi.fn(async () => null),
      vi.fn(async () => {
        throw new Error("blocked");
      }),
      vi.fn(async () => "<html>Not found</html>"),
      undefined,
    ]) {
      const out = await ecomScanStep(
        { niche: "anime", market: "us", step: 0 },
        deps(results, sites, { readShopFile }),
      );
      expect(out.brands).toHaveLength(1);
      expect(out.brands[0]).toMatchObject({
        country: "US",
        countrySure: true,
        countryWhy: "“made in the USA” on their site",
        products: null,
        priceFrom: null,
        match: "strong",
      });
    }
  });

  it("stops opening shop files when a step has run long, so its answer still arrives", async () => {
    const readShopFile = shopFiles();
    const d = deps([COUNTRY_RESULTS[0]], COUNTRY_SITES(), { readShopFile });
    let clock = 1_000_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      d.readSite.mockImplementationOnce(async ({ website }) => {
        clock += 50_000; // a slow site
        return COUNTRY_SITES()[website as "kaijuclothing.com"];
      });
      const out = await ecomScanStep({ niche: "anime", market: "us", step: 0, strict: false }, d);
      expect(readShopFile).not.toHaveBeenCalled();
      expect(out.brands).toHaveLength(1);
      expect(out.brands[0]).toMatchObject({ country: "", products: null });
    } finally {
      spy.mockRestore();
    }
  });

  it("reads what the catalogue says: does it sell the niche, how much, how lately", async () => {
    const candles = {
      products: Array.from({ length: 3 }, (_, i) => ({
        title: `Soy candle ${i}`,
        variants: [{ price: "18.00" }],
        published_at: "2024-01-05T00:00:00Z",
        updated_at: "2025-02-01T00:00:00Z",
      })),
    };
    const readShopFile = vi.fn(async (_d: string, file: "meta" | "products") =>
      file === "meta" ? { country: "US", city: "Boise", province: "ID", currency: "USD" } : candles,
    );
    const html = shopify("Glow Studio")
      .replace("Anime streetwear drops.", "Candles poured by hand.")
      .replace("</body>", "<p>Please allow 2-4 weeks for delivery.</p></body>");
    const d = deps(
      [{ link: "https://glowstudio.com/collections/all", title: "Glow Studio" }],
      { "glowstudio.com": site("glowstudio.com", html) },
      { readShopFile, now: () => Date.parse("2026-11-16T12:00:00Z") },
    );
    const [b] = (await ecomScanStep({ niche: "anime", market: "us", step: 0 }, d)).brands;
    expect(b).toMatchObject({
      place: "Boise, Idaho",
      match: "none",
      products: 3,
      priceFrom: 18,
      priceTo: 18,
      newest: "2024-01-05",
      updated: "2025-02-01",
      slow: true,
    });
    expect(b.why).toEqual([
      "Shopify shop",
      "based in Boise, Idaho",
      "the niche is not mentioned on the shop",
      "only 3 products",
      "nothing in the shop has changed in over a year",
      "speaks of deliveries of 2 weeks or more",
    ]);
    expect(b.score).toBe(0);
  });
});

describe("a scan step for brand pages of one country", () => {
  const profile = (handle: string, name: string, bio: string): SearchResult => ({
    link: `https://www.instagram.com/${handle}/`,
    title: `${name} (@${handle}) • Instagram photos and videos`,
    snippet: `4,210 Followers, 310 Following, 245 Posts - ${name} (@${handle}) on Instagram: "${bio}"`,
  });
  const PAGES = [
    profile(
      "kaijuclothing",
      "Kaiju Clothing",
      "Anime streetwear 🔥 Free shipping 📦 kaijuclothing.com",
    ),
    profile(
      "otaku.supply",
      "Otaku Supply",
      "Small business · anime pins · made in USA · DM to order",
    ),
    profile("brit.anime", "Brit Anime", "Anime tees 🇬🇧 small business · shop now"),
    profile("mystery.anime", "Mystery Anime", "Anime streetwear brand. Shop the new drop"),
    profile("toast.anime", "Toast Anime", "Anime streetwear brand · shop teaandtoast.co.uk"),
  ];
  const sites = () => ({
    "kaijuclothing.com": site("kaijuclothing.com", shopify("Kaiju Clothing")),
  });

  it("keeps pages that say they are there, and takes the shop's word over the page's", async () => {
    const readShopFile = shopFiles();
    const d = deps(PAGES, sites(), { readShopFile });
    const out = await ecomScanStep(
      { niche: "anime", market: "us", source: "instagram", step: 1 },
      d,
    );

    expect(out.brands.map((b) => b.key)).toEqual(["kaijuclothing.com", "ig:otaku.supply"]);
    // A British flag and a British shop address; one page names no place at all.
    expect(out.skipped).toEqual({ notBrands: 0, seen: 0, notShops: 0, elsewhere: 2, unplaced: 1 });
    // Only the shop of a page that may be listed is opened.
    expect(d.readSite.mock.calls.map((c) => c[0].website)).toEqual(["kaijuclothing.com"]);
    expect(out.brands[0]).toMatchObject({
      kind: "shop",
      country: "US",
      countrySure: true,
      place: "Austin, Texas",
      products: 148,
      match: "strong",
    });
    // As much as a page can say: listed, and marked as its own word.
    expect(out.brands[1]).toMatchObject({
      kind: "page",
      country: "US",
      countrySure: false,
      place: "",
      countryWhy: "“made in USA” on their Instagram page",
      match: "strong",
    });
    expect(out.brands[1].why).toContain("probably in the United States");
  });

  it("does not remember the pages it left out for where they are", async () => {
    const remembered: SeenBrand[] = [];
    const d = deps(PAGES, sites(), {
      readShopFile: shopFiles(),
      remember: async (list) => void remembered.push(...list),
    });
    await ecomScanStep({ niche: "anime", market: "us", source: "instagram", step: 1 }, d);
    expect(remembered.map((r) => r.website || r.company).sort()).toEqual([
      "@kaijuclothing",
      "@otaku.supply",
      "kaijuclothing.com",
    ]);
  });

  it("also keeps pages that name no place when asked to", async () => {
    const d = deps(PAGES, sites(), { readShopFile: shopFiles() });
    const out = await ecomScanStep(
      { niche: "anime", market: "us", source: "instagram", step: 1, strict: false },
      d,
    );
    expect(out.brands.map((b) => b.key).sort()).toEqual([
      "ig:mystery.anime",
      "ig:otaku.supply",
      "kaijuclothing.com",
    ]);
    expect(out.skipped).toMatchObject({ elsewhere: 2, unplaced: 0 });
    expect(out.brands.find((b) => b.key === "ig:mystery.anime")?.why).toContain(
      "country not confirmed",
    );
  });

  it("drops a page whose shop turns out to be registered somewhere else", async () => {
    const page = profile(
      "nordic.threads",
      "Nordic Threads",
      "Anime streetwear brand 🇺🇸 shop nordicthreads.com",
    );
    const d = deps(
      [page],
      { "nordicthreads.com": site("nordicthreads.com", shopify("Nordic Threads")) },
      { readShopFile: shopFiles() },
    );
    const out = await ecomScanStep(
      { niche: "anime", market: "us", source: "instagram", step: 1 },
      d,
    );
    expect(out.brands).toEqual([]);
    expect(out.skipped.elsewhere).toBe(1);
  });

  it("lets a hint from the shop count only when the page says nothing", async () => {
    const pound = site(
      "poundshop.com",
      shopify("Pound Shop", ' Shopify.currency = {"active":"GBP","rate":"1.0"};'),
    );
    const says = profile(
      "pound.shop",
      "Pound Shop",
      "Anime streetwear brand 🇺🇸 shop poundshop.com",
    );
    const silent = profile(
      "pound.shop",
      "Pound Shop",
      "Anime streetwear brand · shop poundshop.com",
    );
    const run = (page: SearchResult, strict: boolean) =>
      ecomScanStep(
        { niche: "anime", market: "us", source: "instagram", step: 1, strict },
        deps([page], { "poundshop.com": pound }),
      );
    // The page says America, the shop only shows pounds: the page's word stands.
    expect((await run(says, true)).brands[0]).toMatchObject({
      country: "US",
      countrySure: false,
      kind: "shop",
    });
    // The page says nothing: prices in pounds are no answer either way.
    expect((await run(silent, true)).skipped).toMatchObject({ unplaced: 1, elsewhere: 0 });
    expect((await run(silent, false)).brands[0]).toMatchObject({
      country: "GB",
      countrySure: false,
    });
  });

  it("has no opinion on the niche of a page whose few words do not name it", async () => {
    const page = profile(
      "kaiju.threads",
      "Kaiju Threads",
      "Streetwear brand from Texas. Shop the new drop",
    );
    const out = await ecomScanStep(
      { niche: "anime", market: "us", source: "instagram", step: 1 },
      deps([page], {}),
    );
    expect(out.brands).toHaveLength(1);
    expect(out.brands[0].match).toBeUndefined();
    expect(out.brands[0]).toMatchObject({ country: "US", place: "Texas" });
  });
});
