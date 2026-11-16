/**
 * Finding online brands (web shops) in a niche: which searches to run, which
 * results are a brand's own shop or its Instagram page, and what a shop's
 * pages say about it.
 *
 * Pure functions (no network, no server imports): shared by the Worker and
 * the admin screen, and every rule here is covered by tests.
 */

import { cleanDomain, isCompanyDomain } from "./business-key";
import { followersLabel, igHandle, igProfileResult, igUrl, type SearchResult } from "./instagram";

/* ---------------------------------------------------------------- niches */

export interface EcomNiche {
  id: string;
  /** On the button: "Anime". */
  label: string;
  /** In a sentence: "online anime brands". */
  noun: string;
  /** What shops in this niche sell, the most typical first. Each becomes a search. */
  terms: string[];
}

export const ECOM_NICHES: EcomNiche[] = [
  {
    id: "anime",
    label: "Anime",
    noun: "anime",
    terms: [
      "anime streetwear",
      "anime clothing",
      "anime merch",
      "anime hoodies",
      "anime figures",
      "manga apparel",
      "anime posters",
      "kawaii accessories",
    ],
  },
  {
    id: "clothing",
    label: "Clothing",
    noun: "clothing",
    terms: [
      "streetwear brand",
      "independent clothing brand",
      "graphic tees",
      "sustainable clothing",
      "activewear",
      "loungewear",
      "women's boutique",
      "menswear",
    ],
  },
  {
    id: "household",
    label: "Household",
    noun: "home goods",
    terms: [
      "home decor",
      "kitchenware",
      "scented candles",
      "bedding",
      "home fragrance",
      "handmade ceramics",
      "home organization",
      "eco cleaning products",
    ],
  },
  {
    id: "beauty",
    label: "Beauty",
    noun: "beauty",
    terms: [
      "skincare",
      "clean beauty",
      "haircare",
      "makeup",
      "natural soap",
      "perfume",
      "men's grooming",
      "nail care",
    ],
  },
  {
    id: "jewelry",
    label: "Jewelry",
    noun: "jewelry",
    terms: [
      "handmade jewelry",
      "gold jewelry",
      "silver rings",
      "personalized necklaces",
      "waterproof jewelry",
      "charm bracelets",
      "earrings",
      "men's jewelry",
    ],
  },
  {
    id: "pets",
    label: "Pets",
    noun: "pet",
    terms: [
      "dog accessories",
      "pet supplies",
      "cat toys",
      "dog treats",
      "dog collars",
      "cat furniture",
      "pet apparel",
      "natural pet food",
    ],
  },
  {
    id: "fitness",
    label: "Fitness",
    noun: "fitness",
    terms: [
      "gym wear",
      "fitness equipment",
      "sports supplements",
      "yoga mats",
      "resistance bands",
      "protein powder",
      "running gear",
      "home gym",
    ],
  },
  {
    id: "gaming",
    label: "Gaming",
    noun: "gaming",
    terms: [
      "gaming accessories",
      "custom controllers",
      "gaming merch",
      "mechanical keyboards",
      "desk mats",
      "trading cards",
      "collectibles",
      "retro games",
    ],
  },
  {
    id: "kids",
    label: "Kids & baby",
    noun: "kids and baby",
    terms: [
      "baby clothes",
      "wooden toys",
      "kids clothing",
      "nursery decor",
      "baby essentials",
      "montessori toys",
      "kids shoes",
      "baby gifts",
    ],
  },
  {
    id: "food",
    label: "Food & drink",
    noun: "food and drink",
    terms: [
      "specialty coffee",
      "hot sauce",
      "loose leaf tea",
      "healthy snacks",
      "craft chocolate",
      "spice blends",
      "matcha",
      "protein snacks",
    ],
  },
];

/** Plurals that are not made singular: they are how the thing is called. */
const KEEP_PLURAL = new Set(
  "clothes jeans pants shorts trousers leggings tights boxers briefs goods news series lens glasses sunglasses scissors headphones".split(
    " ",
  ),
);
const IES_TO_Y: Record<string, string> = {
  accessories: "accessory",
  supplies: "supply",
  toiletries: "toiletry",
  groceries: "grocery",
  batteries: "battery",
  pastries: "pastry",
  candies: "candy",
  puppies: "puppy",
  babies: "baby",
};

/** "candles" → "candle", "cat toys" → "cat toy", so "online candle brands" reads right. */
function singular(phrase: string): string {
  const words = phrase.split(" ");
  const last = words[words.length - 1] || "";
  let one = last;
  if (KEEP_PLURAL.has(last)) one = last;
  else if (IES_TO_Y[last]) one = IES_TO_Y[last];
  // "hoodies", "cookies", "beanies" end in -ie: left as they are rather than guessed.
  else if (/ies$/.test(last)) one = last;
  else if (/(?:ss|x|ch|sh)es$/.test(last)) one = last.slice(0, -2);
  else if (/s$/.test(last) && !/(?:ss|us|is|as)$/.test(last) && last.length > 3)
    one = last.slice(0, -1);
  words[words.length - 1] = one;
  return words.join(" ");
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The niche to scan for: one of the presets (by name), or whatever was typed.
 * Several things can be typed with commas ("cat furniture, cat trees"): each is
 * searched for. Null when nothing usable was typed.
 */
export function resolveNiche(input: string | undefined | null): EcomNiche | null {
  // Quotes, brackets and colons would turn the words into search operators.
  const text = String(input || "")
    .replace(/["“”„«»()[\]{}<>:*|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (!text) return null;
  const lower = text.toLowerCase();
  const preset = ECOM_NICHES.find((n) => n.id === lower || n.label.toLowerCase() === lower);
  if (preset) return preset;
  const terms = [
    ...new Set(
      lower
        .split(/\s*[,;\n]\s*/)
        .map((t) =>
          t
            .replace(/^[-+\s]+/, "")
            .trim()
            .slice(0, 60),
        )
        .filter((t) => t.replace(/[^\p{L}\p{N}]/gu, "").length >= 2),
    ),
  ].slice(0, 6);
  if (!terms.length) return null;
  return { id: "custom", label: capital(terms[0]), noun: singular(terms[0]), terms };
}

/** The trade these brands are saved under, written so it reads right in a sentence: "online anime brands". */
export const ecomIndustry = (niche: Pick<EcomNiche, "noun">): string =>
  `online ${niche.noun} brands`;

/** "anime" for "online anime brands"; "" for any other trade. */
export function ecomKind(industry: string | undefined | null): string {
  return /^online\s+(.+)\s+brands$/i.exec((industry || "").trim())?.[1]?.toLowerCase() ?? "";
}

/* --------------------------------------------------------------- markets */

export interface EcomMarket {
  id: string;
  label: string;
  /** The country the search engine answers for ("" = no preference). */
  gl: string;
  /** "Add to cart" as shops there write it. */
  cart: string[];
  /** How a shop there calls itself. */
  store: string;
  /** What a brand's Instagram page there says about delivery. */
  ships: string[];
}

export const ECOM_MARKETS: EcomMarket[] = [
  {
    id: "",
    label: "Anywhere",
    gl: "",
    cart: ["add to cart"],
    store: "official online store",
    ships: ["worldwide shipping"],
  },
  {
    id: "us",
    label: "United States",
    gl: "us",
    cart: ["add to cart"],
    store: "official online store",
    ships: ["free shipping", "worldwide shipping"],
  },
  {
    id: "gb",
    label: "United Kingdom",
    gl: "gb",
    cart: ["add to basket", "add to cart"],
    store: "official online store",
    ships: ["uk shipping", "worldwide shipping"],
  },
  {
    id: "ca",
    label: "Canada",
    gl: "ca",
    cart: ["add to cart"],
    store: "official online store",
    ships: ["ships from canada", "worldwide shipping"],
  },
  {
    id: "au",
    label: "Australia",
    gl: "au",
    cart: ["add to cart"],
    store: "official online store",
    ships: ["australia wide", "worldwide shipping"],
  },
  {
    id: "be",
    label: "Belgium",
    gl: "be",
    cart: ["in winkelwagen", "ajouter au panier"],
    store: "webshop",
    ships: ["gratis verzending", "livraison"],
  },
  {
    id: "nl",
    label: "Netherlands",
    gl: "nl",
    cart: ["in winkelwagen", "in winkelmand"],
    store: "webshop",
    ships: ["gratis verzending", "webshop"],
  },
  {
    id: "de",
    label: "Germany",
    gl: "de",
    cart: ["in den warenkorb"],
    store: "onlineshop",
    ships: ["versand", "onlineshop"],
  },
  {
    id: "fr",
    label: "France",
    gl: "fr",
    cart: ["ajouter au panier"],
    store: "boutique en ligne",
    ships: ["livraison", "boutique en ligne"],
  },
];

export const ecomMarket = (id: string | undefined | null): EcomMarket =>
  ECOM_MARKETS.find((m) => m.id === String(id || "").toLowerCase()) ?? ECOM_MARKETS[0];

/* ---------------------------------------------------------------- searches */

export type EcomSource = "stores" | "instagram";

export interface EcomQuery {
  q: string;
  /** Result page, from 1. */
  page: number;
}

const anyOf = (phrases: string[]) =>
  phrases.length > 1 ? `(${phrases.map((p) => `"${p}"`).join(" OR ")})` : `"${phrases[0]}"`;

/** Marketplaces answer every product search; these words keep the first results for brands' own shops. */
const NO_MARKETPLACES = "-amazon -etsy -ebay -aliexpress -temu -walmart";

/**
 * The ways to ask for shops that sell a thing. Each finds a different set:
 * the line Shopify prints in a shop's footer, the words on any product page,
 * the address Shopify and WooCommerce give their category pages, and a plain
 * question for the brand's own store. `inurl:` is Google's (Serper, SerpApi);
 * Brave does not know it, so there the same two searches ask for the words
 * every shop's menu and footer carry instead.
 */
function storeSearches(market: EcomMarket, operators: boolean): ((term: string) => string)[] {
  return [
    (t) => `${t} "powered by shopify"`,
    (t) => `${t} ${anyOf(market.cart)} ${NO_MARKETPLACES}`,
    operators ? (t) => `${t} inurl:collections` : (t) => `${t} "shop all" "new arrivals"`,
    (t) => `${t} brand ${market.store} ${NO_MARKETPLACES}`,
    operators
      ? (t) => `${t} inurl:product-category`
      : (t) => `${t} "best sellers" "shipping policy"`,
  ];
}

/**
 * The ways to ask Instagram for brand pages. "followers" is on every profile
 * page and on no post, so the first answers with accounts rather than photos.
 */
function instagramSearches(market: EcomMarket): ((term: string) => string)[] {
  return [
    (t) => `site:instagram.com ${t} brand shop "followers"`,
    (t) => `site:instagram.com ${t} ${anyOf(market.ships)}`,
    (t) => `site:instagram.com ${t} "small business" shop`,
    (t) => `site:instagram.com ${t} store "shop now"`,
  ];
}

/** The most searches one scan can plan for one source. */
export const ECOM_MAX_STEPS = 60;

/**
 * Every search a scan may run for one source, best first. Each round gives
 * every term a different kind of search, so a few searches already cover the
 * whole niche; later pages of the same searches come last. A niche of one or
 * two terms is searched deeper (more pages), so a later scan still has
 * something new to ask. `operators: false` plans for a provider without
 * Google's `inurl:` (Brave); the plan has the same length either way.
 */
export function ecomQueryPlan(
  niche: EcomNiche,
  source: EcomSource,
  market: EcomMarket = ECOM_MARKETS[0],
  opts: { operators?: boolean } = {},
): EcomQuery[] {
  const ways =
    source === "instagram"
      ? instagramSearches(market)
      : storeSearches(market, opts.operators !== false);
  const pages = niche.terms.length <= 2 ? 5 : niche.terms.length <= 4 ? 4 : 3;
  const plan: EcomQuery[] = [];
  for (let page = 1; page <= pages; page++)
    for (let round = 0; round < ways.length; round++)
      for (let i = 0; i < niche.terms.length; i++)
        plan.push({ q: ways[(i + round) % ways.length](niche.terms[i]), page });
  return plan.slice(0, ECOM_MAX_STEPS);
}

/**
 * What a scan is remembered by, so the next scan of the same niche, country
 * and source carries on with the searches that have not run yet instead of
 * paying for the same ones again. "" when there is no niche.
 */
export function ecomCursorKey(
  nicheText: string | undefined | null,
  marketId: string | undefined | null,
  source: EcomSource,
): string {
  const niche = resolveNiche(nicheText);
  if (!niche) return "";
  const what = niche.id === "custom" ? niche.terms.join(",") : niche.id;
  return `${what}|${ecomMarket(marketId).id}|${source}`.slice(0, 200);
}

/* ---------------------------------------------------- who is not a brand */

/** The name part of a domain: "amazon" for amazon.co.uk, "crunchyroll" for store.crunchyroll.com. */
function siteLabel(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  const tail = /\.(?:co|com|org|net|ac)\.[a-z]{2}$/.test(domain) ? 2 : 1;
  return parts[parts.length - tail - 1] || "";
}

/** A shop that lives on its platform's address: the sub-domain is the shop. */
const HOSTED_SHOP =
  /^[a-z0-9][a-z0-9-]*\.(?:myshopify\.com|bigcartel\.com|mybigcommerce\.com|square\.site|company\.site|storenvy\.com|myshopline\.com)$/;

/**
 * Sites that answer product searches but are not a brand to contact:
 * marketplaces, the biggest retailers and brands, shop builders, print-on-demand
 * storefronts, link pages, magazines and forums. Matched on the name part of
 * the domain, so every country version is covered.
 */
const NOT_BRANDS = new Set(
  [
    // marketplaces and resale
    "amazon ebay etsy aliexpress alibaba temu shein walmart target wish dhgate rakuten mercari poshmark depop vinted grailed stockx goat vestiaire thredup zalando aboutyou asos boohoo bol coolblue wehkamp otto cdiscount fnac veepee allegro mercadolibre flipkart lazada shopee tokopedia wayfair overstock newegg bestbuy costco kohls macys nordstrom jcpenney argos tesco sainsburys asda boots superdrug johnlewis marksandspencer next hema blokker kruidvat action mediamarkt saturn",
    // the biggest brands and chains
    "nike adidas puma reebok underarmour lululemon gymshark uniqlo zara hm gap oldnavy primark levi levis urbanoutfitters anthropologie hottopic boxlunch zumiez pacsun crunchyroll funko gamestop sephora ulta ikea homedepot lowes crateandbarrel potterybarn westelm williams-sonoma bedbathandbeyond petco petsmart chewy apple samsung sony nintendo microsoft disney",
    // print-on-demand and creator storefronts
    "redbubble teepublic society6 zazzle spreadshirt spreadshop myspreadshop teespring creator-spring threadless printful printify gumroad payhip sellfy ko-fi patreon itch booth bandcamp",
    // shop builders and site builders themselves
    "shopify myshopify shopifycdn woocommerce bigcommerce bigcartel storenvy ecwid wix wixsite squarespace wordpress weebly webflow godaddy shoplazza shopline",
    // link pages
    "carrd linkpop stan komi snipfeed allmylinks withkoji link lnk solo hoo taplink campsite flowcode shorby tinyurl bitly",
    // payments, tips and creator pages
    "paypal venmo cash buymeacoffee kickstarter indiegogo gofundme onlyfans fansly cameo throne spotify soundcloud",
    // social, video, forums, reference
    "reddit quora pinterest youtube tiktok twitter x snapchat threads discord twitch telegram medium substack beehiiv blogspot tumblr wikipedia fandom wikihow trustpilot sitejabber glassdoor indeed crunchbase github google bing yahoo duckduckgo",
    // magazines that list brands
    "forbes businessinsider buzzfeed nytimes theguardian cnn bbc vogue gq esquire elle cosmopolitan hypebeast highsnobiety complex ign kotaku polygon cbr screenrant animenewsnetwork myanimelist",
  ]
    .join(" ")
    .split(" "),
);

/** Is this site something other than a brand's own shop (a marketplace, a giant, a magazine, a link page)? */
export function notABrandShop(domain: string | undefined | null): boolean {
  const d = cleanDomain(domain);
  if (!d || !d.includes(".") || /^[\d.]+$/.test(d)) return true;
  if (HOSTED_SHOP.test(d)) return false;
  if (!isCompanyDomain(d)) return true;
  if (/\.(?:gov|edu|mil)(?:\.[a-z]{2})?$/.test(d)) return true;
  return NOT_BRANDS.has(siteLabel(d));
}

/* ------------------------------------------------------------ small text */

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_m, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z]{2,8};/gi, " ");
}
function codePoint(n: number): string {
  try {
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
  } catch {
    return " ";
  }
}

/** One clean line, no markup, at most `max` characters (cut at a word). */
function oneLine(raw: string, max: number): string {
  const text = decodeEntities(raw.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/**
 * A name as it would be written: no ® or ™ and no "Official Store" tail.
 * `cut` also drops what follows a separator ("Kaiju | Anime Streetwear"): right
 * for a site's own name, wrong for an Instagram name, where that is the name.
 */
function tidyName(raw: string, cut = true): string {
  let name = oneLine(raw, 80).replace(/[®™©]/g, "");
  if (cut) name = name.replace(/\s+[|–—·•]\s+.*$/, "");
  return name
    .replace(
      /\s*[-–—|:,]?\s*(?:official\s+(?:online\s+)?|online\s+)(?:store|shop|site|website)$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Names a shop template leaves behind: they name nobody. */
const NOT_A_NAME =
  /^(?:home|homepage|shop|store|online store|my store|my shop|welcome|index|untitled|products|collections?)$/i;

/** "kaiju-clothing" → "Kaiju Clothing". */
const labelName = (label: string) => label.split(/[-_]+/).filter(Boolean).map(capital).join(" ");

/**
 * The brand in a page title: the part that is the domain ("Anime Hoodies –
 * Kaiju Clothing" on kaijuclothing.com), else the domain's own name.
 */
export function titleBrand(title: string | undefined, domain: string): string {
  const label = siteLabel(cleanDomain(domain));
  const flat = squash(label);
  const parts = decodeEntities(title || "")
    .split(/\s+[|–—·•»]\s+|\s+-\s+|:\s+/)
    .map((p) => p.replace(/[®™©]/g, "").replace(/\s+/g, " ").trim())
    .filter((p) => p && !NOT_A_NAME.test(p));
  if (flat) {
    const exact = parts.find((p) => squash(p) === flat);
    if (exact) return exact.slice(0, 60);
    // Most of the domain ("Kaiju Co" on kaijuco.shop), never one generic word of it.
    const inside = parts
      .filter((p) => {
        const s = squash(p);
        return s.length >= 3 && flat.includes(s) && s.length * 10 >= flat.length * 7;
      })
      .sort((a, b) => b.length - a.length)[0];
    if (inside) return inside.slice(0, 60);
    const around = parts
      .filter((p) => flat.length >= 4 && squash(p).includes(flat) && p.split(" ").length <= 5)
      .sort((a, b) => a.length - b.length)[0];
    if (around) return around.slice(0, 60);
  }
  return labelName(label) || parts[parts.length - 1]?.slice(0, 60) || "";
}

/* ------------------------------------------------- shops in search results */

export interface StoreCandidate {
  domain: string;
  /** Best guess at the brand's name before its site is read. */
  name: string;
  title: string;
  snippet: string;
  /** The result itself is a shop page (a product, a collection): worth listing even if the site can't be opened. */
  shopLink: boolean;
}

/** Addresses only a shop has: its products, its collections, its shop section. */
const SHOP_PATH =
  /\/(?:products?|collections?|product-category|shop|store|winkel|boutique)(?:[/?#]|$)/i;

/**
 * The sites in a page of search results that could be a brand's own shop:
 * one per site, without marketplaces, giants, magazines and social pages.
 * Whether it really sells online is settled by reading the site.
 */
export function storeCandidates(results: SearchResult[]): {
  candidates: StoreCandidate[];
  skipped: number;
} {
  const candidates: StoreCandidate[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of results.slice(0, 20)) {
    const link = (r.link || "").trim();
    if (!/^https?:\/\//i.test(link)) continue;
    const domain = cleanDomain(link);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    if (notABrandShop(domain)) {
      skipped++;
      continue;
    }
    candidates.push({
      domain,
      name: titleBrand(r.title, domain),
      title: oneLine(r.title || "", 120),
      snippet: oneLine(r.snippet || "", 200),
      shopLink: HOSTED_SHOP.test(domain) || SHOP_PATH.test(link.replace(/^https?:\/\/[^/]+/i, "")),
    });
  }
  return { candidates, skipped };
}

/* ------------------------------------------------- what a shop's pages say */

export interface StoreFacts {
  /** The shop software ("Shopify", "WooCommerce", …); "" when it isn't recognisable. */
  platform: string;
  /** The site sells online: it runs shop software, or shows a cart and prices of its own. */
  sells: boolean;
  /** What the shop calls itself. */
  name: string;
  /** What it sells, in its own words. */
  about: string;
  /** Marketing tools seen in the pages ("Meta pixel", "Klaviyo", …). */
  tools: string[];
  /** The currency it sells in ("USD"), when the pages say so. */
  currency: string;
}

/** Software that is a shop by itself, then site builders that only sometimes are. */
const PLATFORMS: { name: string; re: RegExp; shop: boolean }[] = [
  // Storefront markers only: plenty of blogs show product photos from Shopify's image host.
  {
    name: "Shopify",
    re: /\bShopify\.(?:shop|theme|routes)\b|shopify-section|ShopifyAnalytics|\/cdn\/shop\/t\/\d/,
    shop: true,
  },
  {
    name: "WooCommerce",
    re: /woocommerce-no-js|wp-content\/plugins\/woocommerce|wc-ajax=|wc_add_to_cart_params|wc_cart_fragments/i,
    shop: true,
  },
  {
    name: "BigCommerce",
    re: /cdn\d*\.bigcommerce\.com|bigcommerce\.com\/s-|stencil-utils|\bBCData\b/,
    shop: true,
  },
  {
    name: "Magento",
    re: /\bMagento_[A-Z]\w+|mage\/cookies|\/static\/version\d+\/frontend\/|data-mage-init/,
    shop: true,
  },
  {
    name: "PrestaShop",
    re: /var\s+prestashop\s*=|\/modules\/ps_[a-z]+|content=["']PrestaShop/i,
    shop: true,
  },
  { name: "Shopware", re: /\/bundles\/storefront\/|content=["']Shopware/i, shop: true },
  { name: "Lightspeed", re: /webshopapp\.com|cdn\.shoplightspeed\.com|lightspeedhq/i, shop: true },
  { name: "Ecwid", re: /app\.ecwid\.com|\bEcwid\.(?:init|OnAPILoaded)\b/, shop: true },
  { name: "Big Cartel", re: /assets\.bigcartel\.com|\bbigcartel\b/i, shop: true },
  { name: "Shoplazza", re: /shoplazza|myshoplaza/i, shop: true },
  { name: "Shopline", re: /shoplineapp\.com|myshopline\.com/i, shop: true },
  {
    name: "OpenCart",
    re: /index\.php\?route=(?:product|checkout|common)\/|catalog\/view\/theme\//i,
    shop: true,
  },
  { name: "CCV Shop", re: /ccvshop|securearea\.eu/i, shop: true },
  { name: "Mijnwebwinkel", re: /mijnwebwinkel|myonlinestore\.com/i, shop: true },
  { name: "Fourthwall", re: /\bfourthwall\b/i, shop: true },
  { name: "Square Online", re: /square\.site|cdn\d*\.editmysite\.com/i, shop: false },
  { name: "Squarespace", re: /static\d*\.squarespace\.com|squarespace-cdn\.com/i, shop: false },
  { name: "Wix", re: /static\.wixstatic\.com|static\.parastorage\.com/i, shop: false },
  { name: "Webflow", re: /website-files\.com|\bw-commerce-/i, shop: false },
  { name: "WordPress", re: /wp-content\/|wp-includes\//i, shop: false },
];

/** Signs of selling that any shop shows, whatever it is built with. Two of them make a shop. */
const SELLING: RegExp[] = [
  /add[\s_-]?to[\s_-]?(?:cart|bag|basket)/i,
  /\b(?:in winkelwagen|in winkelmand|in den warenkorb|ajouter au panier|añadir al carrito|aggiungi al carrello)\b/i,
  /"@type"\s*:\s*"(?:Product|Offer|OnlineStore)"/i,
  /href\s*=\s*["'][^"']*\/(?:cart|basket|checkout|winkelwagen|warenkorb|panier)(?:[/?#"']|$)/i,
  /["'](?:og:price:amount|product:price:amount)["']|"priceCurrency"/i,
  /\b(?:free shipping|free delivery|gratis verzending|kostenloser versand|livraison gratuite)\b/i,
];

const TOOLS: [string, RegExp][] = [
  ["Meta pixel", /\bfbq\s*\(|connect\.facebook\.net\/[a-z_]+\/fbevents|facebook_pixel/i],
  ["TikTok pixel", /analytics\.tiktok\.com|\bttq\.(?:load|track|page)\b|tiktok_pixel/i],
  ["Google Ads", /\bAW-\d{6,}|googleadservices\.com/],
  ["Klaviyo", /klaviyo/i],
];

/** The <meta> tags of a page by their name or property (lower-case). */
function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.slice(0, 200_000).matchAll(/<meta\b[^>]*>/gi)) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1]?.toLowerCase();
    const content =
      /\bcontent\s*=\s*"([^"]*)"/i.exec(tag[0])?.[1] ??
      /\bcontent\s*=\s*'([^']*)'/i.exec(tag[0])?.[1];
    if (key && content && !out.has(key)) out.set(key, content);
  }
  return out;
}

/**
 * What a shop's pages say about it. `pages` are the pages that were read
 * (HTML), the homepage first; `domain` is where they were read from.
 */
export function readStore(pages: { path: string; html: string }[], domain: string): StoreFacts {
  const home = pages.find((p) => !p.path || p.path === "/") ?? pages[0];
  const homeHtml = home?.html || "";
  const all = pages.map((p) => p.html || "").join("\n");
  const found = PLATFORMS.find((p) => p.re.test(all));
  const signs = SELLING.filter((re) => re.test(all)).length;
  const meta = metaTags(homeHtml);

  let name = tidyName(meta.get("og:site_name") || "");
  if (!name || NOT_A_NAME.test(name)) {
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(homeHtml)?.[1] || "";
    name = titleBrand(title, domain);
  }
  const about = oneLine(meta.get("description") || meta.get("og:description") || "", 200);
  const currency =
    /\bShopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/.exec(all)?.[1] ||
    (meta.get("og:price:currency") || meta.get("product:price:currency") || "")
      .toUpperCase()
      .slice(0, 3) ||
    /"priceCurrency"\s*:\s*"([A-Z]{3})"/.exec(all)?.[1] ||
    "";
  return {
    platform: found?.name ?? "",
    sells: found?.shop === true || signs >= 2,
    name,
    about,
    tools: TOOLS.filter(([, re]) => re.test(all)).map(([label]) => label),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
  };
}

/** Where a shop keeps its email address: the contact page, then its policies and its about page. */
const STORE_PAGE_RANK: [RegExp, number][] = [
  [
    /contact|get[\s-]?in[\s-]?touch|reach[\s-]?us|kontakt|klantenservice|customer[\s-]?(?:service|care|support)|support|help/i,
    0,
  ],
  [/policies\/(?:contact-information|legal-notice)|imprint|impressum|mentions[\s-]?l[ée]gales/i, 1],
  [/policies\/(?:refund|privacy|terms)|refund|returns|privacy/i, 2],
  [/about|our[\s-]?story|who[\s-]?we[\s-]?are|over[\s-]?ons|faq/i, 3],
];

/**
 * The pages of a shop worth reading for its email address, best first: the
 * contact page its homepage links to, then a policy page (shop software prints
 * the shop's address there) and the about page. Same site only.
 */
export function storeContactPaths(homeHtml: string, domain: string, max = 4): string[] {
  const base = cleanDomain(domain);
  const ranked: { path: string; rank: number; at: number }[] = [];
  const seen = new Set<string>(["/"]);
  let at = 0;
  for (const m of homeHtml.matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"'<>\s]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi,
  )) {
    const href = decodeEntities(m[1]);
    if (/^(?:mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let path = "";
    try {
      const u = new URL(href, `https://${base}`);
      if (cleanDomain(u.hostname) !== base) continue;
      path = u.pathname.replace(/\/+$/, "") || "/";
    } catch {
      continue;
    }
    if (seen.has(path) || path.length > 120) continue;
    if (/\.(?:png|jpe?g|gif|webp|svg|pdf|zip|mp4|css|js|xml)$/i.test(path)) continue;
    // Product, category, account and cart pages never carry the shop's address.
    if (
      /\/(?:products?|collections?|product-category|cart|checkout|account|login|search|blogs?|tag)(?:\/|$)/i.test(
        path,
      )
    )
      continue;
    const label = `${path} ${m[2].replace(/<[^>]+>/g, " ")}`;
    const rank = STORE_PAGE_RANK.find(([re]) => re.test(label))?.[1];
    if (rank === undefined) continue;
    seen.add(path);
    ranked.push({ path, rank, at: at++ });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.at - b.at);
  // One page of each kind first, so a policy page is read even when a shop links five contact pages.
  const firstOfEach = [0, 1, 2, 3]
    .map((rank) => ranked.find((r) => r.rank === rank))
    .filter((r): r is (typeof ranked)[number] => !!r);
  const picked = [...new Set([...firstOfEach, ...ranked].map((r) => r.path))].slice(0, max);
  if (picked.length >= 2) return picked;
  // A homepage that links none of them: the usual addresses of the shop software.
  const usual = /\bShopify\.(?:shop|theme|routes)\b|shopify-section/.test(homeHtml)
    ? ["/pages/contact", "/policies/refund-policy", "/policies/privacy-policy"]
    : ["/contact", "/contact-us", "/about"];
  return [...new Set([...picked, ...usual])].slice(0, max);
}

/* --------------------------------------------------- brands on Instagram */

export interface IgBrandPage {
  handle: string;
  name: string;
  followers: number | null;
  bio: string;
  /** The shop its description gives ("" when it only has a link page or nothing). */
  website: string;
}

/** Accounts this size are household names, not a brand a small agency writes to. */
export const IG_TOO_BIG = 1_000_000;

const SELLS_WORDS =
  /\b(?:shop|store|boutique|brand|apparel|clothing|streetwear|merch|merchandise|collection|goods|supply|handmade|hand-?crafted|designed in|made in|est\.?\s?(?:19|20)\d\d|webshop|winkel|tienda|onlineshop)\b/i;
const ORDER_WORDS =
  /\b(?:shipping|ships|delivery|worldwide|orders?|pre-?orders?|restock(?:ed|ing)?|new drops?|new arrivals|% off|discount|use code|shop now|link in bio|dm to order|tap to shop|available now|verzending|livraison|versand|env[ií]os?)\b|[🛒🛍📦🚚]/iu;
const SHOP_HANDLE =
  /(?:shop|store|apparel|clothing|wear|merch|supply|goods|boutique|official|brand|studios?|co)$|^(?:shop|the)[._]?/;
/** Pages about a subject rather than a shop for it. */
const NOT_A_SHOP_PAGE =
  /\b(?:fan ?page|fan ?account|memes?|daily (?:posts?|content|dose)|edits?|amvs?|news|updates|reposts?|not affiliated|credits? to|dm for (?:credit|removal)|personal (?:account|blog)|content creator|cosplayer|streamer|youtuber|vtuber|influencer|artist|illustrator|photographer|tattoo|podcast|community|convention)\b/i;

const SITE_ENDINGS = new Set(
  "com co net org io shop store us uk ca au de fr nl be eu xyz club online site world studio art clothing fashion boutique jp nz ie es it se dk no ch at app life me gg in mx br pl pt".split(
    " ",
  ),
);

/** The brand's own shop named in a profile's description: a real site, not a link page or a marketplace. */
export function bioWebsite(text: string): string {
  for (const m of (text || "")
    .toLowerCase()
    .matchAll(/(?<![@\w.-])((?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,10})(?![\w-]|\.[a-z])/g)) {
    const domain = m[1].replace(/^www\./, "");
    if (!SITE_ENDINGS.has(domain.split(".").pop() || "")) continue;
    if (siteLabel(domain).length < 3 || notABrandShop(domain)) continue;
    return domain;
  }
  return "";
}

/** Does this profile read like a brand that sells, rather than a fan page, a creator or an artist? */
export function looksLikeBrandPage(p: {
  handle: string;
  name: string;
  bio: string;
  followers: number | null;
}): boolean {
  if (p.followers != null && p.followers >= IG_TOO_BIG) return false;
  const text = `${p.name} ${p.bio}`;
  const points =
    (bioWebsite(text) ? 2 : 0) +
    (SELLS_WORDS.test(text) ? 1 : 0) +
    (ORDER_WORDS.test(text) ? 1 : 0) +
    (SHOP_HANDLE.test(p.handle) ? 1 : 0);
  if (points < 2) return false;
  return !(NOT_A_SHOP_PAGE.test(text) && points < 4);
}

/**
 * The brand pages in a page of Instagram search results: profiles only (never
 * a post or a hashtag), one per account, and only those that read like a shop.
 */
export function igBrandPages(results: SearchResult[]): { pages: IgBrandPage[]; skipped: number } {
  const pages: IgBrandPage[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of results.slice(0, 20)) {
    const profile = igProfileResult(r);
    if (!profile || seen.has(profile.handle)) continue;
    seen.add(profile.handle);
    if (!looksLikeBrandPage(profile)) {
      skipped++;
      continue;
    }
    pages.push({
      handle: profile.handle,
      name: tidyName(profile.name, false) || `@${profile.handle}`,
      followers: profile.followers,
      bio: oneLine(profile.bio, 200),
      website: bioWebsite(`${profile.bio} ${profile.name}`),
    });
  }
  return { pages, skipped };
}

/* ---------------------------------------------------------------- brands */

export interface EcomBrand {
  /** The shop's domain, or "ig:<handle>" for a brand known only by its Instagram page. */
  key: string;
  name: string;
  /** The shop's domain ("" when only the Instagram page is known). */
  website: string;
  /** What it sells, in its own words. */
  about: string;
  /** "shop": the site was read and sells online. "unread": the site could not be opened. "page": only the Instagram page is known. */
  kind: "shop" | "unread" | "page";
  platform: string;
  email: string;
  /** https://www.instagram.com/<handle>, or "". */
  instagram: string;
  /** false = found, but worth a look before messaging (see instagramWhy). */
  instagramSure: boolean;
  instagramVia: "site" | "search" | "";
  instagramWhy: string;
  followers: number | null;
  tiktok: string;
  tools: string[];
  currency: string;
  /** The niche it was found for ("Anime") and the trade it is saved under ("online anime brands"). */
  niche: string;
  industry: string;
  source: EcomSource;
  /** The search that found it. */
  query: string;
  /** 0–100: how ready it is to contact. */
  score: number;
  why: string[];
  foundAt: number;
}

export const ecomBrandKey = (b: Pick<EcomBrand, "website" | "instagram">): string =>
  cleanDomain(b.website) || (igHandle(b.instagram) ? `ig:${igHandle(b.instagram)}` : "");

/** Every key a brand can be recognised by: its site and its Instagram account. */
export function ecomBrandKeys(b: Pick<EcomBrand, "website" | "instagram">): string[] {
  const handle = igHandle(b.instagram);
  return [cleanDomain(b.website), handle ? `ig:${handle}` : ""].filter(Boolean);
}

/**
 * How ready a brand is to contact (0–100), with the reasons in plain words:
 * a confirmed shop, an Instagram to message, an email to write to, and an
 * audience that is neither empty nor a household name.
 */
export function ecomFit(
  b: Pick<EcomBrand, "kind" | "platform" | "email" | "instagram" | "instagramSure" | "followers">,
): { score: number; why: string[] } {
  let score = 20;
  const why: string[] = [];
  if (b.kind === "shop") {
    score += 15;
    why.push(b.platform ? `${b.platform} shop` : "sells online");
  } else if (b.kind === "unread") {
    why.push("site could not be opened");
  }
  if (b.instagram) {
    score += b.instagramSure ? 25 : 15;
    why.push(b.instagramSure ? "Instagram found" : "Instagram to check");
  }
  if (b.email) {
    score += 20;
    why.push("email on their site");
  }
  const f = b.followers;
  if (f != null) {
    if (f >= 1_000 && f <= 100_000) score += 15;
    else if (f > 100_000 && f <= 500_000) score += 8;
    else if (f >= 200 && f < 1_000) score += 5;
    why.push(`${followersLabel(f)} followers`);
  }
  return { score: Math.max(0, Math.min(100, score)), why };
}

/** Are these two finds the same brand? Same shop, or the same Instagram account. */
export function sameEcomBrand(a: EcomBrand, b: EcomBrand): boolean {
  const mine = new Set(ecomBrandKeys(a));
  return ecomBrandKeys(b).some((k) => mine.has(k));
}

/**
 * One brand from two finds of it (its shop from a web search, its page from
 * Instagram): what was read on the shop itself wins, and nothing known is lost.
 */
export function mergeEcomBrand(a: EcomBrand, b: EcomBrand): EcomBrand {
  const rank = { shop: 2, unread: 1, page: 0 } as const;
  const [main, other] = rank[b.kind] > rank[a.kind] ? [b, a] : [a, b];
  const sameAccount = !!main.instagram && igHandle(main.instagram) === igHandle(other.instagram);
  // A different account on the other find only replaces one we were unsure of.
  const ig =
    !main.instagram || (!main.instagramSure && other.instagramSure && !sameAccount) ? other : main;
  const merged: EcomBrand = {
    ...main,
    name: main.name || other.name,
    website: main.website || other.website,
    about: main.about || other.about,
    platform: main.platform || other.platform,
    email: main.email || other.email,
    instagram: ig.instagram ? igUrl(igHandle(ig.instagram)) : "",
    instagramSure: ig.instagram ? ig.instagramSure || (sameAccount && other.instagramSure) : false,
    instagramVia: ig.instagram ? ig.instagramVia : "",
    instagramWhy: ig.instagram
      ? sameAccount && main.instagramVia !== other.instagramVia
        ? "linked on their shop, and found on Instagram"
        : ig.instagramWhy
      : "",
    followers: ig.followers ?? (sameAccount ? (main.followers ?? other.followers) : null),
    tiktok: main.tiktok || other.tiktok,
    tools: main.tools.length ? main.tools : other.tools,
    currency: main.currency || other.currency,
    foundAt: Math.min(a.foundAt, b.foundAt),
  };
  merged.key = ecomBrandKey(merged) || main.key;
  return { ...merged, ...ecomFit(merged) };
}

/** Add finds to a list without doubles: a brand already there takes what the new find adds. */
export function mergeEcomBrands(
  list: EcomBrand[],
  incoming: EcomBrand[],
): { brands: EcomBrand[]; added: number } {
  const brands = list.slice();
  let added = 0;
  for (const find of incoming) {
    if (!find.key) continue;
    const at = brands.findIndex((b) => sameEcomBrand(b, find));
    if (at >= 0) brands[at] = mergeEcomBrand(brands[at], find);
    else {
      brands.push(find);
      added++;
    }
  }
  return { brands, added };
}
