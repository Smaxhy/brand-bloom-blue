import { describe, expect, it } from "vitest";
import {
  AD_PIXELS,
  ECOM_MARKETS,
  ECOM_MAX_STEPS,
  ECOM_NICHES,
  type EcomBrand,
  bioWebsite,
  ecomAbandoned,
  ecomFit,
  ecomCursorKey,
  ecomIndustry,
  ecomKind,
  ecomMarket,
  ecomQueryPlan,
  igBrandPages,
  looksLikeBrandPage,
  mergeEcomBrand,
  mergeEcomBrands,
  notABrandShop,
  readStore,
  resolveNiche,
  storeCandidates,
  storeContactPaths,
  titleBrand,
} from "./ecom-brands";
import { igProfileResult } from "./instagram";

const brand = (over: Partial<EcomBrand>): EcomBrand => {
  const b = {
    key: "kaijuclothing.com",
    name: "Kaiju Clothing",
    website: "kaijuclothing.com",
    about: "",
    kind: "shop" as const,
    platform: "Shopify",
    email: "",
    instagram: "",
    instagramSure: false,
    instagramVia: "" as const,
    instagramWhy: "",
    followers: null,
    tiktok: "",
    tools: [],
    currency: "",
    niche: "Anime",
    industry: "online anime brands",
    source: "stores" as const,
    query: "anime streetwear",
    foundAt: 1_000,
    ...over,
  };
  return { ...b, ...ecomFit(b) };
};

describe("the niche to scan for", () => {
  it("knows the presets by name, whatever the capitals", () => {
    expect(resolveNiche("Anime")?.id).toBe("anime");
    expect(resolveNiche("  household ")?.noun).toBe("home goods");
    expect(resolveNiche("Kids & baby")?.id).toBe("kids");
  });

  it("takes anything typed, and several things with commas", () => {
    const one = resolveNiche("Handmade Soap");
    expect(one).toMatchObject({ id: "custom", label: "Handmade soap", terms: ["handmade soap"] });
    expect(resolveNiche("cat furniture, cat trees; cat furniture")?.terms).toEqual([
      "cat furniture",
      "cat trees",
    ]);
  });

  it("never lets typed text become a search operator", () => {
    const terms = resolveNiche('site:evil.com "k-pop merch" (free)')?.terms ?? [];
    expect(terms).toEqual(["site evil.com k-pop merch free"]);
  });

  it("has nothing to scan for when nothing was typed", () => {
    expect(resolveNiche("")).toBeNull();
    expect(resolveNiche(" , ; ")).toBeNull();
    expect(resolveNiche(undefined)).toBeNull();
  });

  it("gives every preset eight different things to search for", () => {
    for (const n of ECOM_NICHES) {
      expect(n.terms.length).toBe(8);
      expect(new Set(n.terms).size).toBe(8);
    }
  });
});

describe("the trade a brand is saved under", () => {
  it("reads right in a sentence", () => {
    expect(ecomIndustry((resolveNiche("anime") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toBe("online anime brands");
    expect(ecomIndustry((resolveNiche("household") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toBe("online home goods brands");
    expect(ecomIndustry((resolveNiche("scented candles") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toBe("online scented candle brands");
    expect(ecomIndustry((resolveNiche("cat toys") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toBe("online cat toy brands");
    expect(ecomIndustry((resolveNiche("watches") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toBe("online watch brands");
    expect(ecomIndustry((resolveNiche("phone accessories") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toBe("online phone accessory brands");
  });

  it("leaves words alone that it cannot safely make singular", () => {
    expect(ecomIndustry((resolveNiche("hoodies") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toBe("online hoodies brands");
    expect(ecomIndustry((resolveNiche("vintage jeans") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toBe("online vintage jeans brands");
    expect(ecomIndustry((resolveNiche("streetwear") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toBe("online streetwear brands");
  });

  it("is recognised again, and a local trade is not", () => {
    expect(ecomKind("online anime brands")).toBe("anime");
    expect(ecomKind("Online Home Goods Brands")).toBe("home goods");
    expect(ecomKind("roofers")).toBe("");
    expect(ecomKind("online marketing")).toBe("");
    expect(ecomKind("")).toBe("");
  });
});

describe("the searches of a scan", () => {
  const anime = (resolveNiche("anime") ?? { id: "missing", label: "missing", noun: "missing", terms: [] });

  it("covers every term with a different kind of search in the first round", () => {
    const plan = ecomQueryPlan(anime, "stores");
    const first = plan.slice(0, 8).map((s) => s.q);
    for (const term of anime.terms) expect(first.some((q) => q.startsWith(term))).toBe(true);
    expect(first[0]).toBe('anime streetwear "powered by shopify"');
    expect(first[1]).toContain('"add to cart"');
    expect(first[2]).toBe("anime merch inurl:collections");
    expect(plan.every((s) => s.page >= 1 && s.page <= 3)).toBe(true);
  });

  it("never plans the same search twice, and stops at the limit, in every country", () => {
    for (const market of ECOM_MARKETS)
      for (const source of ["stores", "instagram"] as const)
        for (const niche of [
          anime,
          (resolveNiche("handmade soap") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }),
          (resolveNiche("cat trees, cat beds, cat toys") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }),
        ])
          for (const operators of [true, false]) {
            const plan = ecomQueryPlan(niche, source, market, { operators });
            const label = `${niche.label} ${market.id} ${source}`;
            expect(new Set(plan.map((s) => `${s.q}#${s.page}`)).size, label).toBe(plan.length);
            expect(plan.length, label).toBeLessThanOrEqual(ECOM_MAX_STEPS);
            expect(plan.length, label).toBeGreaterThanOrEqual(20);
            expect(
              plan.every((s) => s.page >= 1 && s.page <= 5 && s.q.length < 300),
              label,
            ).toBe(true);
          }
    expect(ECOM_MAX_STEPS).toBe(120);
  });

  it("gives one typed term every kind of search, then the next pages", () => {
    const plan = ecomQueryPlan((resolveNiche("handmade soap") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }), "stores");
    // One term is searched five pages deep, so a later scan still has new searches to ask.
    expect(plan.length).toBe(25);
    expect(plan[24].page).toBe(5);
    expect(
      ecomQueryPlan((resolveNiche("cat furniture, cat trees, cat beds") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }), "stores").at(-1)?.page,
    ).toBe(4);
    expect(plan.slice(0, 5).every((s) => s.page === 1)).toBe(true);
    expect(new Set(plan.slice(0, 5).map((s) => s.q)).size).toBe(5);
    expect(plan[5]).toEqual({ q: plan[0].q, page: 2 });
  });

  it("asks a provider without Google's inurl: for the words a shop's menu carries instead", () => {
    const google = ecomQueryPlan(anime, "stores");
    const brave = ecomQueryPlan(anime, "stores", ECOM_MARKETS[0], { operators: false });
    expect(google.some((s) => s.q.includes("inurl:"))).toBe(true);
    expect(brave.some((s) => s.q.includes("inurl:"))).toBe(false);
    expect(brave.length).toBe(google.length);
    expect(brave[2].q).toBe('anime merch "shop all" "new arrivals"');
    expect(brave[4].q).toBe('anime figures "best sellers" "shipping policy"');
    // The searches every provider understands are the same.
    expect(brave[0]).toEqual(google[0]);
    expect(brave[1]).toEqual(google[1]);
  });

  it("names a scan by its niche, country and source, however the niche was typed", () => {
    // The "2" is the version of the search plan: positions kept for the older plan must not be reused.
    expect(ecomCursorKey("Anime", "", "stores")).toBe("anime||stores|2");
    expect(ecomCursorKey(" anime ", "BE", "instagram")).toBe("anime|be|instagram|2");
    expect(ecomCursorKey("Cat Trees, cat furniture", "zz", "stores")).toBe(
      "cat trees,cat furniture||stores|2",
    );
    expect(ecomCursorKey("", "", "stores")).toBe("");
    // A country scan that also keeps unconfirmed brands runs its own list of searches from the top.
    expect(ecomCursorKey("anime", "us", "stores")).toBe("anime|us|stores|2");
    expect(ecomCursorKey("anime", "us", "stores", true)).toBe("anime|us|stores|2");
    expect(ecomCursorKey("anime", "us", "stores", false)).toBe("anime|us|stores|2|all");
    // Anywhere there is no country to confirm, so there is only one list.
    expect(ecomCursorKey("anime", "", "stores", false)).toBe("anime||stores|2");
  });

  it("asks Instagram for profile pages only", () => {
    const plan = ecomQueryPlan(anime, "instagram");
    expect(plan.every((s) => s.q.startsWith("site:instagram.com "))).toBe(true);
    expect(plan[0].q).toBe('site:instagram.com anime streetwear brand shop "followers"');
  });

  it("uses the words shops use in the chosen country", () => {
    const be = ecomMarket("be");
    expect(be.gl).toBe("be");
    const plan = ecomQueryPlan((resolveNiche("kaarsen") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }), "stores", be);
    expect(plan[3].q).toBe(
      'kaarsen ("in winkelwagen" OR "ajouter au panier") -amazon -etsy -ebay -aliexpress -temu -walmart',
    );
    expect(plan[6].q).toContain("webshop");
    expect(ecomMarket("zz")).toBe(ECOM_MARKETS[0]);
    expect(ecomMarket(undefined).gl).toBe("");
  });

  it("searches a country in its own words: what its brands say, how they deliver, where they are", () => {
    const us = ecomMarket("us");
    const plan = ecomQueryPlan((resolveNiche("handmade soap") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }), "stores", us);
    const no = "-amazon -etsy -ebay -aliexpress -temu -walmart";
    expect(plan.slice(0, 8)).toEqual([
      {
        q: `handmade soap brand ("made in usa" OR "made in the usa" OR "american made") ${no}`,
        page: 1,
      },
      { q: 'handmade soap "powered by shopify"', page: 1 },
      {
        q: `handmade soap brand shop (California OR Texas OR "New York" OR Florida) ${no}`,
        page: 1,
      },
      { q: `handmade soap "add to cart" ${no}`, page: 1 },
      {
        q: `handmade soap shop ("ships from the usa" OR "free us shipping" OR "continental us") ${no}`,
        page: 1,
      },
      { q: "handmade soap inurl:collections", page: 1 },
      { q: `handmade soap brand official online store ${no}`, page: 1 },
      { q: "handmade soap inurl:product-category", page: 1 },
    ]);
    // Anywhere: the plan a scan without a country always had.
    expect(ecomQueryPlan((resolveNiche("handmade soap") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }), "stores").slice(0, 2)).toEqual([
      { q: 'handmade soap "powered by shopify"', page: 1 },
      { q: `handmade soap "add to cart" ${no}`, page: 1 },
    ]);
  });

  it("moves on to other places of the country instead of asking the same place for page two", () => {
    const us = ecomMarket("us");
    const placed = ecomQueryPlan((resolveNiche("handmade soap") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }), "stores", us).filter((s) =>
      / brand shop \(/.test(s.q),
    );
    expect(placed).toHaveLength(5);
    expect(placed.map((s) => /\((.+?)\)/.exec(s.q)?.[1])).toEqual(
      us.regions.map((group) => group.map((p) => (p.includes(" ") ? `"${p}"` : p)).join(" OR ")),
    );
    expect(placed.every((s) => s.page === 1)).toBe(true);
    // A country with fewer place groups than rounds comes back to the first group, on the next page.
    const be = ecomMarket("be");
    const belgian = ecomQueryPlan((resolveNiche("kaarsen") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }), "stores", be).filter((s) =>
      / brand shop \(/.test(s.q),
    );
    expect(belgian.map((s) => s.page)).toEqual([1, 1, 2, 2, 3]);
    expect(belgian[0].q).toContain("(Antwerpen OR Gent OR Brussel OR Leuven)");
    expect(belgian[2].q).toBe(belgian[0].q);
  });

  it("keeps the country searches for a provider without Google's inurl:", () => {
    const us = ecomMarket("us");
    const brave = ecomQueryPlan(anime, "stores", us, { operators: false });
    expect(brave.some((s) => s.q.includes("inurl:"))).toBe(false);
    expect(brave[0].q).toContain('"made in usa"');
    expect(brave[2].q).toContain("(California OR Texas");
    expect(brave.length).toBe(ecomQueryPlan(anime, "stores", us).length);
  });

  it("asks Instagram for pages that name the country or one of its places", () => {
    const plan = ecomQueryPlan(anime, "instagram", ecomMarket("us"));
    expect(plan.every((s) => s.q.startsWith("site:instagram.com "))).toBe(true);
    expect(plan[0].q).toBe(
      'site:instagram.com anime streetwear brand "followers" ("USA" OR "made in usa" OR "US based")',
    );
    expect(plan[2].q).toBe(
      'site:instagram.com anime merch shop "followers" (California OR Texas OR "New York" OR Florida)',
    );
    // The searches that find brand pages anywhere stay in the plan.
    expect(plan[1].q).toBe('site:instagram.com anime clothing brand shop "followers"');
  });

  it("knows every country's own words, and asks in its language", () => {
    for (const m of ECOM_MARKETS.filter((m) => m.id)) {
      expect(m.gl, m.id).toBe(m.id);
      expect(m.home.length, m.id).toBeGreaterThanOrEqual(2);
      expect(m.local.length, m.id).toBeGreaterThanOrEqual(2);
      expect(m.tags.length, m.id).toBeGreaterThanOrEqual(2);
      expect(m.regions.length, m.id).toBeGreaterThanOrEqual(2);
      expect(
        m.regions.every((group) => group.length >= 3 && group.length <= 5),
        m.id,
      ).toBe(true);
      expect(new Set(m.regions.flat()).size, m.id).toBe(m.regions.flat().length);
    }
    expect(ecomMarket("us").hl).toBe("en");
    expect(ecomMarket("de").hl).toBe("de");
    // Belgium searches in Dutch and in French: no one language is asked for.
    expect(ecomMarket("be").hl).toBe("");
    expect(ECOM_MARKETS[0]).toMatchObject({
      id: "",
      gl: "",
      hl: "",
      home: [],
      local: [],
      tags: [],
      regions: [],
    });
  });
});

describe("who is not a brand to contact", () => {
  it("leaves out marketplaces, giants, builders, link pages and social sites in every country", () => {
    for (const d of [
      "amazon.com",
      "www.amazon.co.uk",
      "etsy.com",
      "ebay.de",
      "store.crunchyroll.com",
      "hottopic.com",
      "shopify.com",
      "myshopify.com",
      "redbubble.com",
      "linktr.ee",
      "instagram.com",
      "reddit.com",
      "x.com",
      "bol.com",
      "next.co.uk",
      "target.com.au",
      "gmail.com",
      "forbes.com",
      "usa.gov",
      "1.2.3.4",
      "localhost",
      "",
    ])
      expect(notABrandShop(d), d).toBe(true);
  });

  it("keeps a brand's own shop, also on its shop software's address", () => {
    for (const d of [
      "kaijuclothing.com",
      "us.super-groupies.com",
      "kaiju.myshopify.com",
      "kaiju.bigcartel.com",
      "targetarchery.co.uk",
      "amazonia-candles.com",
      "soraclothing.ca",
    ])
      expect(notABrandShop(d), d).toBe(false);
  });
});

describe("a brand's name in a page title", () => {
  it("is the part that is the domain", () => {
    expect(titleBrand("Anime Hoodies & Streetwear – Kaiju Clothing", "kaijuclothing.com")).toBe(
      "Kaiju Clothing",
    );
    expect(titleBrand("KAIJU CO | Anime Streetwear", "kaijuco.shop")).toBe("KAIJU CO");
    expect(titleBrand("Sora World: anime apparel made in Canada", "soraworld.ca")).toBe(
      "Sora World",
    );
  });

  it("is never one generic word of the domain", () => {
    expect(titleBrand("Anime | Hoodies", "animeshop.com")).toBe("Animeshop");
  });

  it("falls back to the domain, written as a name", () => {
    expect(titleBrand("Home", "kaiju-clothing.com")).toBe("Kaiju Clothing");
    expect(titleBrand(undefined, "www.otaku-supply.co.uk")).toBe("Otaku Supply");
  });
});

describe("shops in a page of search results", () => {
  it("keeps one line per site and counts what it left out", () => {
    const { candidates, skipped } = storeCandidates([
      {
        link: "https://kaijuclothing.com/collections/hoodies",
        title: "Anime Hoodies – Kaiju Clothing",
        snippet: "Free shipping over $80.",
      },
      { link: "https://kaijuclothing.com/products/akira-tee", title: "Akira Tee – Kaiju Clothing" },
      { link: "https://www.etsy.com/shop/DOTIC", title: "DOTIC - Etsy" },
      {
        link: "https://www.amazon.com/anime-hoodie/s?k=anime+hoodie",
        title: "Amazon.com: anime hoodie",
      },
      {
        link: "https://animecollective.com/best-quality-anime-clothing/",
        title: "Best quality anime clothing for the price",
      },
      { link: "https://www.instagram.com/kaijuclothing/", title: "Kaiju (@kaijuclothing)" },
      { link: "ftp://weird.example/file", title: "x" },
      { link: "https://otaku.myshopify.com/", title: "Otaku Supply" },
    ]);
    expect(candidates.map((c) => c.domain)).toEqual([
      "kaijuclothing.com",
      "animecollective.com",
      "otaku.myshopify.com",
    ]);
    expect(skipped).toBe(3);
    expect(candidates[0]).toMatchObject({
      name: "Kaiju Clothing",
      shopLink: true,
      snippet: "Free shipping over $80.",
    });
    // A magazine page is not a shop page: whether the site sells is settled by reading it.
    expect(candidates[1].shopLink).toBe(false);
    expect(candidates[2].shopLink).toBe(true);
  });
});

const SHOPIFY_HOME = `<!doctype html><html><head>
<title>Kaiju Clothing &ndash; Anime Streetwear</title>
<meta name="description" content="Limited anime streetwear drops, designed in Brussels &amp; shipped worldwide.">
<meta property="og:site_name" content="Kaiju Clothing®">
<script>window.Shopify = window.Shopify || {}; Shopify.shop = "kaiju-clothing.myshopify.com"; Shopify.currency = {"active":"EUR","rate":"1.0"}; Shopify.theme = {"name":"Dawn"};</script>
<script id="web-pixels-manager-setup">{"pixel_type":"facebook_pixel"}</script>
<script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>
</head><body>
<div id="shopify-section-header" class="shopify-section"><a href="/collections/all">Shop</a><a href="/cart">Cart</a></div>
<footer>
<a href="/pages/about-us">Our story</a>
<a href="/pages/contact">Contact</a>
<a href="/pages/contact-wholesale">Wholesale contact</a>
<a href="/policies/refund-policy">Refund policy</a>
<a href="/policies/privacy-policy">Privacy policy</a>
<a href="/collections/hoodies">Hoodies</a>
<a href="/products/akira-tee">Akira tee</a>
<a href="https://www.instagram.com/kaijuclothing">Instagram</a>
<a href="mailto:hello@kaijuclothing.com">Email us</a>
</footer></body></html>`;

describe("what a shop's pages say about it", () => {
  it("reads a Shopify shop: software, name, what it sells, tools and currency", () => {
    expect(readStore([{ path: "/", html: SHOPIFY_HOME }], "kaijuclothing.com")).toEqual({
      platform: "Shopify",
      sells: true,
      name: "Kaiju Clothing",
      about: "Limited anime streetwear drops, designed in Brussels & shipped worldwide.",
      tools: ["Meta pixel", "Klaviyo"],
      currency: "EUR",
    });
  });

  it("recognises the tools a shop advertises, mails and collects reviews with", () => {
    const html = `<html><body><a href="/cart">Cart</a><a href="/collections/all">Shop</a>
      <script>pintrk('load', '2612345678901');</script>
      <script src="https://sc-static.net/scevent.min.js"></script>
      <script>ttq.load('C4ABCDEF');</script>
      <script src="https://omnisnippet1.com/inshop/launcher-v2.js" data-omnisend></script>
      <script src="https://chimpstatic.com/mcjs-connected/js/users/abc.js"></script>
      <script src="https://sdk.postscript.io/sdk.bundle.js"></script>
      <script src="https://cdn.attn.tv/kaiju/dtag.js"></script>
      <div class="jdgm-widget"></div><script src="https://loox.io/widget/loox.js"></script>
      <div class="yotpo-widget-instance"></div><script src="https://cdn-static.okendo.io/reviews-widget-plus/js/okendo-reviews.js"></script>
      <script src="https://cdn1.stamped.io/files/widget.min.js"></script>
      <script src="https://static.rechargecdn.com/assets/js/widget.min.js"></script>
      <script>window.Shopify = {}; Shopify.shop = "kaiju.myshopify.com";</script></body></html>`;
    const { tools } = readStore([{ path: "/", html }], "kaijuclothing.com");
    expect(tools).toEqual([
      "TikTok pixel",
      "Pinterest tag",
      "Snap pixel",
      "Omnisend",
      "Mailchimp",
      "Postscript",
      "Attentive",
      "Judge.me",
      "Loox",
      "Yotpo",
      "Okendo",
      "Stamped",
      "Recharge",
    ]);
    // The ones that mean the brand pays for ads.
    expect(tools.filter((t) => AD_PIXELS.includes(t))).toEqual([
      "TikTok pixel",
      "Pinterest tag",
      "Snap pixel",
    ]);
    expect(AD_PIXELS).toEqual([
      "Meta pixel",
      "TikTok pixel",
      "Google Ads",
      "Pinterest tag",
      "Snap pixel",
    ]);
  });

  it("reads a WooCommerce shop and takes the name from the title when the site gives none", () => {
    const html = `<html><head><title>Shop anime figures - Otaku Supply</title>
      <meta content="Figures and merch." name="description"></head>
      <body class="home woocommerce-no-js"><a class="button" href="?add-to-cart=12">Add to basket</a>
      <script>gtag('config', 'AW-123456789');</script></body></html>`;
    expect(readStore([{ path: "/", html }], "otakusupply.co.uk")).toMatchObject({
      platform: "WooCommerce",
      sells: true,
      name: "Otaku Supply",
      about: "Figures and merch.",
      tools: ["Google Ads"],
    });
  });

  it("does not take a magazine for a shop because it shows product photos from Shopify's image host", () => {
    const html = `<html><head><title>10 best anime clothing brands</title></head>
      <body class="wp"><link href="/wp-content/themes/x/style.css">
      <img src="https://cdn.shopify.com/s/files/1/0001/hoodie.jpg"><p>Free shipping on some of these!</p></body></html>`;
    expect(readStore([{ path: "/", html }], "animecollective.com")).toMatchObject({
      platform: "WordPress",
      sells: false,
    });
  });

  it("recognises a shop built by hand from its cart and its prices", () => {
    const html = `<html><head><title>Sora World</title></head><body>
      <a href="/cart">Cart (0)</a><button>Add to cart</button>
      <script type="application/ld+json">{"@type":"Product","offers":{"priceCurrency":"CAD"}}</script></body></html>`;
    expect(readStore([{ path: "/", html }], "soraworld.ca")).toMatchObject({
      platform: "",
      sells: true,
      name: "Sora World",
      currency: "CAD",
    });
  });

  it("ignores the name a shop template leaves behind", () => {
    const html = `<html><head><title>My Store</title><meta property="og:site_name" content="My Store">
      <script>Shopify.shop = "x.myshopify.com";</script></head><body></body></html>`;
    expect(readStore([{ path: "/", html }], "kaiju-clothing.com").name).toBe("Kaiju Clothing");
  });

  it("is not a shop when there is nothing to read", () => {
    expect(readStore([], "kaijuclothing.com")).toMatchObject({
      platform: "",
      sells: false,
      tools: [],
    });
  });
});

describe("where a shop keeps its email address", () => {
  it("reads the contact page first, then a policy page and the about page: never products", () => {
    expect(storeContactPaths(SHOPIFY_HOME, "kaijuclothing.com")).toEqual([
      "/pages/contact",
      "/policies/refund-policy",
      "/pages/about-us",
      "/pages/contact-wholesale",
    ]);
  });

  it("stays on the shop's own site", () => {
    const html = `<a href="https://other.com/contact">Contact</a><a href="//kaijuclothing.com/contact/">Contact</a>
      <a href="/about">About</a>`;
    expect(storeContactPaths(html, "kaijuclothing.com")).toEqual(["/contact", "/about"]);
  });

  it("tries the usual addresses when the homepage links none", () => {
    expect(storeContactPaths("<script>Shopify.theme = {}</script>", "kaijuclothing.com")).toEqual([
      "/pages/contact",
      "/policies/refund-policy",
      "/policies/privacy-policy",
    ]);
    expect(storeContactPaths("<p>hello</p>", "kaijuclothing.com")).toEqual([
      "/contact",
      "/contact-us",
      "/about",
    ]);
  });
});

describe("the shop named in an Instagram description", () => {
  it("is a real site of their own", () => {
    expect(bioWebsite("Anime streetwear 🔥 shop: www.kaijuclothing.com")).toBe("kaijuclothing.com");
    expect(bioWebsite("Worldwide shipping 📦 KAIJU.CO")).toBe("kaiju.co");
    expect(bioWebsite("orders via otaku-supply.co.uk/new")).toBe("otaku-supply.co.uk");
  });

  it("is never a link page, a marketplace, an email address or two sentences run together", () => {
    expect(bioWebsite("all links: linktr.ee/kaiju")).toBe("");
    expect(bioWebsite("find us on etsy.com/shop/kaiju")).toBe("");
    expect(bioWebsite("mail hello@kaijuclothing.com")).toBe("");
    expect(bioWebsite("Anime streetwear.Worldwide shipping")).toBe("");
    expect(bioWebsite("est.2020 · dm.us")).toBe("");
    expect(bioWebsite("")).toBe("");
  });
});

describe("brand pages on Instagram", () => {
  const profile = (handle: string, name: string, followers: string, bio: string) => ({
    link: `https://www.instagram.com/${handle}/`,
    title: `${name} (@${handle}) • Instagram photos and videos`,
    snippet: `${followers} Followers, 310 Following, 245 Posts - ${name} (@${handle}) on Instagram: "${bio}"`,
  });

  it("keeps the pages that read like a shop, with what the result says about them", () => {
    const { pages, skipped } = igBrandPages([
      profile(
        "kaijuclothing",
        "Kaiju Clothing",
        "12.4K",
        "Anime streetwear 🔥 Worldwide shipping 📦 kaijuclothing.com",
      ),
      profile("animedaily", "Anime Daily", "880K", "Daily anime memes and edits. DM for credit"),
      profile(
        "crunchyroll",
        "Crunchyroll",
        "6M",
        "Shop the official store. Worldwide shipping. crunchyroll.com",
      ),
      {
        link: "https://www.instagram.com/p/Cxyz123/",
        title: "Kaiju Clothing on Instagram: new drop",
        snippet: "120 likes",
      },
      {
        link: "https://www.instagram.com/explore/tags/animestreetwear/",
        title: "#animestreetwear",
      },
      profile(
        "otaku.supply",
        "OTAKU SUPPLY | anime goods",
        "950",
        "Small business · handmade pins · DM to order",
      ),
      profile("kaijuclothing", "Kaiju Clothing", "12.4K", "again"),
    ]);
    expect(pages.map((p) => p.handle)).toEqual(["kaijuclothing", "otaku.supply"]);
    expect(skipped).toBe(2);
    expect(pages[0]).toEqual({
      handle: "kaijuclothing",
      name: "Kaiju Clothing",
      followers: 12_400,
      bio: "Anime streetwear 🔥 Worldwide shipping 📦 kaijuclothing.com",
      website: "kaijuclothing.com",
    });
    expect(pages[1]).toMatchObject({
      name: "OTAKU SUPPLY | anime goods",
      followers: 950,
      website: "",
    });
  });

  it("tells a brand from a fan page, a creator and an artist", () => {
    const page = (handle: string, name: string, bio: string, followers: number | null = 5_000) =>
      looksLikeBrandPage({ handle, name, bio, followers });
    expect(page("kaijuclothing", "Kaiju Clothing", "")).toBe(true);
    expect(page("kaiju", "KAIJU", "Shop now 👉 kaiju.co")).toBe(true);
    expect(page("animememes", "Anime Memes", "Fan page. Shop link in bio")).toBe(false);
    expect(page("miku_art", "Miku", "Artist · prints in my shop mikuart.com")).toBe(false);
    expect(page("someguy", "Some Guy", "I like anime")).toBe(false);
    expect(page("kaijuclothing", "Kaiju Clothing", "shop", 2_400_000)).toBe(false);
    // An artist page that is plainly a shop too, with everything a shop says.
    expect(page("mikuartshop", "Miku Art Shop", "Artist. Worldwide shipping. mikuart.com")).toBe(
      true,
    );
  });
});

describe("how ready a brand is to contact", () => {
  it("ranks a confirmed shop with an Instagram and an email first", () => {
    const full = brand({
      instagram: "https://www.instagram.com/kaijuclothing",
      instagramSure: true,
      email: "hello@kaijuclothing.com",
      followers: 12_400,
    });
    const noEmail = brand({
      instagram: "https://www.instagram.com/kaijuclothing",
      instagramSure: true,
    });
    const likely = brand({
      instagram: "https://www.instagram.com/kaijuclothing",
      instagramSure: false,
    });
    const bare = brand({});
    const unread = brand({ kind: "unread", platform: "" });
    expect(full.score).toBe(95);
    expect(full.why).toEqual([
      "Shopify shop",
      "Instagram found",
      "email on their site",
      "12k followers",
    ]);
    expect([full, noEmail, likely, bare, unread].map((b) => b.score)).toEqual([95, 60, 50, 35, 20]);
    expect(unread.why).toEqual(["site could not be opened"]);
  });

  it("prefers an audience that is neither empty nor a household name", () => {
    const at = (followers: number) => brand({ kind: "page", platform: "", followers }).score;
    expect(at(12_000)).toBeGreaterThan(at(300_000));
    expect(at(300_000)).toBeGreaterThan(at(500));
    expect(at(500)).toBeGreaterThan(at(50));
    expect(at(900_000)).toBe(at(50));
  });

  const NOW = Date.parse("2026-11-16T12:00:00Z");
  const fit = (over: Partial<EcomBrand>) => ecomFit({ ...brand({}), ...over }, NOW);

  it("counts whether a brand is based in the country that was asked for", () => {
    const base = fit({}).score;
    // Being where the scan asked is what is expected: it adds a reason, not points.
    const confirmed = fit({
      market: "us",
      country: "US",
      countrySure: true,
      place: "Austin, Texas",
    });
    expect(confirmed.score).toBe(base);
    expect(confirmed.why).toContain("based in Austin, Texas");
    expect(fit({ market: "us", country: "US", countrySure: true }).why).toContain(
      "based in the United States",
    );
    const ownWord = fit({ market: "us", country: "US", countrySure: false });
    expect(ownWord.score).toBe(base - 3);
    expect(ownWord.why).toContain("probably in the United States");
    const unknown = fit({ market: "us", country: "" });
    expect(unknown.score).toBe(base - 10);
    expect(unknown.why).toContain("country not confirmed");
    const hint = fit({ market: "us", country: "GB", countrySure: false });
    expect(hint.score).toBe(base - 10);
    expect(hint.why).toContain("may be in the United Kingdom");
    // A scan without a country has no opinion about where a brand is.
    expect(fit({ country: "GB", countrySure: true }).score).toBe(base);
  });

  it("counts whether the shop sells the niche, and how much it sells", () => {
    const base = fit({}).score;
    expect(fit({ match: "strong" })).toMatchObject({ score: base });
    expect(fit({ match: "strong" }).why).toContain("sells anime");
    expect(fit({ match: "some" }).score).toBe(base);
    expect(fit({ match: "none" }).score).toBe(base - 20);
    expect(fit({ match: "none" }).why).toContain("the niche is not mentioned on the shop");
    expect(fit({ products: 3 }).score).toBe(base - 10);
    expect(fit({ products: 3 }).why).toContain("only 3 products");
    expect(fit({ products: 1 }).why).toContain("only 1 product");
    expect(fit({ products: 5 }).score).toBe(base);
    expect(fit({ products: null }).score).toBe(base);
  });

  it("counts whether the shop is alive", () => {
    const base = fit({}).score;
    expect(fit({ newest: "2026-10-01", updated: "2026-11-10" })).toMatchObject({ score: base + 5 });
    expect(fit({ newest: "2026-10-01" }).why).toContain("new products in the last 3 months");
    // An old newest product is no fault while the shop still changes: it sells what it has.
    expect(fit({ newest: "2024-01-01", updated: "2026-11-10" }).score).toBe(base);
    const dead = fit({ newest: "2024-01-01", updated: "2025-03-01" });
    expect(dead.score).toBe(base - 10);
    expect(dead.why).toContain("nothing in the shop has changed in over a year");
    expect(fit({ slow: true }).score).toBe(base - 5);
    expect(fit({ slow: true }).why).toContain("speaks of deliveries of 2 weeks or more");
  });

  it("calls a shop abandoned only when it knows", () => {
    expect(ecomAbandoned({ updated: "2025-11-01" }, NOW)).toBe(true);
    expect(ecomAbandoned({ updated: "2025-11-20" }, NOW)).toBe(false);
    expect(ecomAbandoned({ updated: "" }, NOW)).toBe(false);
    expect(ecomAbandoned({}, NOW)).toBe(false);
    expect(ecomAbandoned({ updated: "last year" }, NOW)).toBe(false);
  });

  it("stays between 0 and 100, and only a brand with everything reaches the top", () => {
    expect(
      fit({
        kind: "unread",
        platform: "",
        market: "us",
        country: "",
        match: "none",
        products: 1,
        updated: "2020-01-01",
        slow: true,
      }).score,
    ).toBe(0);
    const best = {
      instagram: "https://www.instagram.com/kaijuclothing",
      instagramSure: true,
      email: "hello@kaijuclothing.com",
      followers: 12_400,
      market: "us",
      country: "US",
      countrySure: true,
      match: "strong" as const,
    };
    // What a brand scored before any of this was read, when nothing is wrong with it.
    expect(fit(best).score).toBe(95);
    expect(fit({ ...best, newest: "2026-11-01" }).score).toBe(100);
    expect(fit({ ...best, newest: "2026-11-01" }).why).toEqual([
      "Shopify shop",
      "Instagram found",
      "email on their site",
      "12k followers",
      "based in the United States",
      "sells anime",
      "new products in the last 3 months",
    ]);
  });
});

describe("one brand found twice", () => {
  const shop = brand({
    email: "hello@kaijuclothing.com",
    instagram: "https://www.instagram.com/kaijuclothing",
    instagramSure: false,
    instagramVia: "site",
    instagramWhy: "linked on one page of their website, under a different name (check it's theirs)",
    tools: ["Meta pixel"],
    foundAt: 2_000,
  });
  const page = brand({
    key: "ig:kaijuclothing",
    website: "",
    kind: "page",
    platform: "",
    about: "Anime streetwear 🔥",
    instagram: "https://www.instagram.com/kaijuclothing/",
    instagramSure: true,
    instagramVia: "search",
    instagramWhy: "found by searching Instagram for anime brands",
    followers: 12_400,
    source: "instagram",
    foundAt: 1_000,
  });

  it("becomes one line with everything known, whichever was found first", () => {
    for (const merged of [mergeEcomBrand(shop, page), mergeEcomBrand(page, shop)]) {
      expect(merged).toMatchObject({
        key: "kaijuclothing.com",
        kind: "shop",
        platform: "Shopify",
        email: "hello@kaijuclothing.com",
        instagram: "https://www.instagram.com/kaijuclothing",
        instagramSure: true,
        instagramWhy: "linked on their shop, and found on Instagram",
        followers: 12_400,
        about: "Anime streetwear 🔥",
        tools: ["Meta pixel"],
        foundAt: 1_000,
        score: 95,
      });
    }
  });

  it("keeps where the brand is and what its shop sells", () => {
    const read = brand({
      market: "us",
      country: "US",
      countrySure: true,
      place: "Austin, Texas",
      countryWhy: "their shop is registered in Austin, Texas",
      match: "strong",
      products: 148,
      priceFrom: 28,
      priceTo: 85,
      newest: "2026-10-20",
      updated: "2026-11-10",
      phone: "+1 512 555 0100",
    });
    const fromBio = {
      ...page,
      market: "us",
      country: "US",
      countrySure: false,
      place: "",
      countryWhy: "the flag on their Instagram page",
    };
    for (const merged of [mergeEcomBrand(read, fromBio), mergeEcomBrand(fromBio, read)])
      expect(merged).toMatchObject({
        market: "us",
        country: "US",
        countrySure: true,
        place: "Austin, Texas",
        countryWhy: "their shop is registered in Austin, Texas",
        match: "strong",
        products: 148,
        priceFrom: 28,
        priceTo: 85,
        newest: "2026-10-20",
        updated: "2026-11-10",
        phone: "+1 512 555 0100",
      });
    // A shop that says nothing takes what the page says, as one piece.
    expect(mergeEcomBrand(brand({ market: "us" }), fromBio)).toMatchObject({
      country: "US",
      countrySure: false,
      place: "",
      countryWhy: "the flag on their Instagram page",
    });
    // A hint on the shop gives way to what the other find's own site confirms.
    const hinted = brand({
      market: "us",
      country: "GB",
      countrySure: false,
      countryWhy: "prices in GBP",
    });
    expect(mergeEcomBrand(hinted, { ...read, key: "kaijuclothing.com" })).toMatchObject({
      country: "US",
      countrySure: true,
      place: "Austin, Texas",
    });
  });

  it("is added once to a list, and a new brand is added", () => {
    const other = brand({
      key: "otakusupply.co.uk",
      website: "otakusupply.co.uk",
      name: "Otaku Supply",
    });
    const first = mergeEcomBrands([], [shop, other]);
    expect(first.added).toBe(2);
    const second = mergeEcomBrands(first.brands, [page, other, brand({ key: "", website: "" })]);
    expect(second.added).toBe(0);
    expect(second.brands.map((b) => b.key)).toEqual(["kaijuclothing.com", "otakusupply.co.uk"]);
    expect(second.brands[0].followers).toBe(12_400);
  });

  it("keeps the account the shop itself links to over another one found by search", () => {
    const sureShop = { ...shop, instagramSure: true };
    const stranger = {
      ...page,
      website: "kaijuclothing.com",
      key: "kaijuclothing.com",
      instagram: "https://www.instagram.com/kaiju_fans",
      followers: 40_000,
    };
    const merged = mergeEcomBrand(sureShop, stranger);
    expect(merged.instagram).toBe("https://www.instagram.com/kaijuclothing");
    expect(merged.followers).toBeNull();
  });
});

describe("an Instagram profile in a search result", () => {
  it("gives the account, its name, its followers and what it says about itself", () => {
    expect(
      igProfileResult({
        link: "https://www.instagram.com/kaijuclothing/?hl=en",
        title: "Kaiju Clothing (@kaijuclothing) • Instagram photos and videos",
        snippet:
          '12.4K Followers, 310 Following, 245 Posts - Kaiju Clothing (@kaijuclothing) on Instagram: "Anime streetwear 🔥 Worldwide shipping"',
      }),
    ).toEqual({
      handle: "kaijuclothing",
      name: "Kaiju Clothing",
      followers: 12_400,
      bio: "Anime streetwear 🔥 Worldwide shipping",
    });
  });

  it("reads the description in the other way results are written, and a result without numbers", () => {
    expect(
      igProfileResult({
        link: "https://www.instagram.com/kaijuclothing/",
        title: "Kaiju Clothing (@kaijuclothing) · Instagram photos and videos",
        snippet:
          "12K followers · 310 following · 245 posts · @kaijuclothing: “Anime streetwear 🔥 Worldwide shipping”",
      }),
    ).toEqual({
      handle: "kaijuclothing",
      name: "Kaiju Clothing",
      followers: 12_000,
      bio: "Anime streetwear 🔥 Worldwide shipping",
    });
    expect(
      igProfileResult({
        link: "https://www.instagram.com/kaijuclothing/",
        title: "Kaiju Clothing (@kaijuclothing) • Instagram photos and videos",
        snippet: "Anime streetwear brand. New posts every week. Shop now.",
      })?.bio,
    ).toBe("Anime streetwear brand. New posts every week. Shop now.");
  });

  it("has no description when the result only repeats who it is", () => {
    expect(
      igProfileResult({
        link: "https://instagram.com/otaku.supply",
        title: "@otaku.supply • Instagram photos and videos",
        snippet:
          "950 Followers, 12 Following, 80 Posts - See Instagram photos and videos from Otaku Supply (@otaku.supply)",
      }),
    ).toEqual({ handle: "otaku.supply", name: "", followers: 950, bio: "" });
  });

  it("is never a post, a reel, a hashtag, one of Instagram's own pages or another site", () => {
    for (const link of [
      "https://www.instagram.com/p/Cxyz123/",
      "https://www.instagram.com/kaijuclothing/p/Cxyz123/",
      "https://www.instagram.com/reel/Cabc/",
      "https://www.instagram.com/explore/tags/anime/",
      "https://www.instagram.com/popular/anime-streetwear/",
      "https://about.instagram.com/blog",
      "https://kaijuclothing.com/",
    ])
      expect(
        igProfileResult({
          link,
          title: "Kaiju (@kaijuclothing) • Instagram photos and videos",
          snippet: "12K Followers",
        }),
        link,
      ).toBeNull();
  });

  it("is not taken from a result that shows neither the handle nor any numbers", () => {
    expect(
      igProfileResult({
        link: "https://www.instagram.com/kaijuclothing/",
        title: "Log in • Instagram",
        snippet: "",
      }),
    ).toBeNull();
  });
});
