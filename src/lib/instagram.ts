/**
 * Finding a business's OWN Instagram profile — on its website, in the listing
 * it came from, on its link-in-bio page and in search results — and telling it
 * apart from everybody else's: the web designer's, a supplier's, the website
 * builder's, or another business with a similar name.
 *
 * Pure functions (no network), so every rule here is covered by tests.
 */

import { cleanDomain, isCompanyDomain } from "./business-key";

export interface IgBusiness {
  name?: string;
  /** The business's website domain, e.g. "joesroofing.com". */
  domain?: string;
  city?: string;
  phone?: string;
}

export type IgVia = "listing" | "site" | "bio" | "search";

export interface IgPick {
  /** https://www.instagram.com/<handle> */
  url: string;
  handle: string;
  /** "sure" = it's theirs (their own site/listing says so, or hard evidence); "likely" = name match only. */
  confidence: "sure" | "likely";
  via: IgVia;
  followers: number | null;
  /** Short plain-language reason, for the admin. */
  why: string;
}

export interface SearchResult {
  link?: string;
  title?: string;
  snippet?: string;
}

/** First path segments on instagram.com that are sections, not profiles. */
const RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "about",
  "developer",
  "developers",
  "directory",
  "legal",
  "privacy",
  "web",
  "share",
  "sharer",
  "direct",
  "challenge",
  "emails",
  "press",
  "api",
  "static",
  "oauth",
  "graphql",
  "embed",
  "invites",
  "ar",
  "tags",
  "locations",
  "session",
  "login",
  "nametag",
  "download",
  "lite",
  "topics",
  "blog",
  "help",
  "terms",
  "ads",
  "business",
  "creators",
  "shop",
  "shopping",
  "guides",
  "audio",
  "maps",
  "data",
  "qr",
  "_u",
  "_n",
  "m",
  "www",
  "accountscenter",
  "branded_content",
  "fb",
  "igtv",
  "live",
  "threads",
  // Instagram's own landing pages for a search phrase ("instagram.com/popular/roofers-denver"):
  // their titles repeat whatever was searched for, so they look like a perfect name match.
  "popular",
  "hashtag",
  "hashtags",
  "search",
  "feed",
  "home",
  "inbox",
  "notifications",
  "saved",
  "settings",
  "signup",
  "register",
  "create",
  "your_activity",
  "places",
  "local",
  "music",
  "product",
  "products",
  "marketplace",
  "sitemap",
  "security",
  "safety",
  "support",
  "community",
  "public",
  "publicapi",
  "ajax",
  "async",
  "logging",
  "consent",
  "linkshim",
  "fragment",
  "rooms",
]);

/** What can follow a profile in its address and still be that profile's own page. */
const PROFILE_TABS = new Set([
  "reels",
  "tagged",
  "guides",
  "channel",
  "followers",
  "following",
  "feed",
  "saved",
]);
/** …and what makes it one of their posts. */
const POST_PARTS = new Set(["p", "reel", "tv"]);

/** Accounts that are never "the business": Instagram itself, site builders, template placeholders. */
const NOT_A_BUSINESS = new Set([
  "instagram",
  "facebook",
  "meta",
  "google",
  "youtube",
  "twitter",
  "tiktok",
  "linkedin",
  "pinterest",
  "yelp",
  "whatsapp",
  "wix",
  "wixstudio",
  "squarespace",
  "shopify",
  "godaddy",
  "weebly",
  "wordpress",
  "wordpressdotcom",
  "webflow",
  "duda",
  "jimdo",
  "strikingly",
  "elementor",
  "envato",
  "themeforest",
  "templatemonster",
  "canva",
  "linktree",
  "linktr.ee",
  "mailchimp",
  "hubspot",
  "gohighlevel",
  "calendly",
  "square",
  "squareup",
  "vagaro",
  "booksy",
  "fresha",
  "mindbody",
  "username",
  "yourusername",
  "yourhandle",
  "your_handle",
  "youraccount",
  "yourinstagram",
  "yourprofile",
  "yourbusiness",
  "yourcompany",
  "handle",
  "example",
  "profile",
  "account",
  "user",
  "name",
  "company",
  "business",
  "brand",
  "test",
  "instagramhandle",
  "insta",
  "ig",
  "null",
  "undefined",
  // Feed widgets, schedulers and link-in-bio tools whose own account sits in their embed code.
  ..."smashballoon elfsight lightwidget snapwidget powr powrful taggbox tagembed juicerio curatorio flockler sociablekit embedsocial instafeed pixlee yotpo latermedia planoly hootsuite buffer sproutsocial linkinbio taplink milkshakeapp stanstore kajabi clickfunnels leadpages unbounce mailerlite constantcontact klaviyo".split(
    " ",
  ),
  // Site builders, hosts, themes and the service platforms small businesses run on.
  ..."vistaprint ionos hostinger bluehost hostgator siteground namecheap zyro site123 carrd tilda framer bigcommerce ecwid woocommerce wpengine elegantthemes themeisle fontawesome bootstrap cloudflare housecallpro jobber getjobber servicetitan thryv hibu yext birdeye podium".split(
    " ",
  ),
  // Directories, review sites, delivery and payment brands: linked from many sites, never the business itself.
  ..."angi angihomeservices homeadvisor thumbtack thumbtackpros houzz nextdoor nextdoorbusiness bbb bbb_us trustpilot tripadvisor opentable doordash ubereats grubhub toasttab resy paypal stripe venmo cashapp snapchat threads reddit discord twitch telegram messenger spotify apple amazon microsoft netflix googlemaps googlebusiness googlemybusiness applemaps yelpforbusiness metaforbusiness instagramforbusiness".split(
    " ",
  ),
  // Words a template leaves behind, or that say what the link is rather than whose it is.
  ..."official follow followus follow_us social socialmedia share link links linkinprofile website web site page admin info contact hello sales office team welcome none tbd sample demo template placeholder lorem design creators yourname yourpage yourbrand yourstore yourshop yoursite companyname company_name businessname business_name brandname brand_name storename shopname mybusiness mycompany mybrand mystore myshop mypage user_name user_handle ig_handle insta_handle instagram_handle instagramusername instagramuser instagram_username".split(
    " ",
  ),
]);

/** "your_username", "yourbusinessname", "your.handle.here", "xxxx", "test12": a template's blank, never a real account. */
const PLACEHOLDER =
  /^your[._]?(?:(?:instagram|insta|ig|business|company|brand|store|shop|user|profile|account|page)[._]?)?(?:user|username|handle|account|profile|page|business|company|brand|name|instagram|insta|ig|store|shop|site|website|link)s?(?:[._]?here)?$|^(?:x{3,}|test\d{0,4}|demo\d{0,4}|sample\d{0,4}|example\d{0,4}|changeme|replaceme|todo|n_a)$/;

const HANDLE = /^[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?$/;

/** A valid profile handle (lower-case) or "". */
function cleanHandle(raw: string): string {
  let h = (raw || "").trim().replace(/^@/, "").toLowerCase();
  h = h.replace(/[.]+$/, ""); // "…/joesroofing." at the end of a sentence
  if (!HANDLE.test(h) || /\.\./.test(h)) return "";
  if (/\.(js|css|php|html?|png|jpe?g|gif|svg|webp|json|xml|ico)$/.test(h)) return "";
  if (RESERVED.has(h) || NOT_A_BUSINESS.has(h) || PLACEHOLDER.test(h)) return "";
  if (/^\d+$/.test(h)) return ""; // numeric ids, not names
  // One or two characters are Instagram's short-link paths ("/a/r/…", "/s/…"), not a business.
  if (h.length < 3) return "";
  return h;
}

/** Escaped forms found in script/JSON blobs → plain text. */
function unescapeSlashes(s: string): string {
  return s
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&#x2f;|&#47;|&sol;/gi, "/")
    .replace(/%2f/gi, "/")
    .replace(/\\u0040/gi, "@");
}

/**
 * instagram.com/<handle> — with an optional sub-domain captured so that only
 * the main site counts: help./about./business.instagram.com are Instagram's own
 * pages, and "cdninstagram.com" (every embedded feed image) isn't Instagram's
 * profile host at all.
 */
const LINK_SRC =
  "(?<![A-Za-z0-9_-])((?:[A-Za-z0-9-]+\\.)*)(?:instagram\\.com|instagr\\.am)\\/(?:_u\\/)?@?([A-Za-z0-9_.]{1,30})(?![A-Za-z0-9_])";
const IGME_SRC = "(?<![A-Za-z0-9_.-])ig\\.me\\/m\\/@?([A-Za-z0-9_.]{1,30})(?![A-Za-z0-9_])";
// A new matcher per use: a shared global regex remembers where it stopped.
const linkRe = () => new RegExp(LINK_SRC, "gi");
const igmeRe = () => new RegExp(IGME_SRC, "gi");
const MAIN_HOST = /^(?:www\.|m\.)?$/i;

/** Every profile handle a text links to, in order of appearance (repeats included). */
function linkedHandles(text: string): string[] {
  const s = unescapeSlashes(text || "");
  const hits: { at: number; handle: string }[] = [];
  for (const m of s.matchAll(linkRe())) {
    if (!MAIN_HOST.test(m[1] || "")) continue;
    const h = cleanHandle(m[2]);
    if (h) hits.push({ at: m.index ?? 0, handle: h });
  }
  for (const m of s.matchAll(igmeRe())) {
    const h = cleanHandle(m[1]);
    if (h) hits.push({ at: m.index ?? 0, handle: h });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.handle);
}

/** The profile handle of an Instagram URL (any form), "@handle" or a bare handle; "" when it isn't a profile. */
export function igHandle(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";
  if (/instagram\.com|instagr\.am|ig\.me/i.test(s)) {
    // The first Instagram address in it decides: a post, a section or a help page is not a profile.
    const flat = unescapeSlashes(s);
    const m = linkRe().exec(flat);
    if (m) return MAIN_HOST.test(m[1] || "") ? cleanHandle(m[2]) : "";
    const d = igmeRe().exec(flat);
    return d ? cleanHandle(d[1]) : "";
  }
  if (/[\s/]/.test(s)) return "";
  return cleanHandle(s);
}

export const igUrl = (handle: string) => (handle ? `https://www.instagram.com/${handle}` : "");
/** Opens a chat with the account in Instagram (app or web). */
export const igDmUrl = (handle: string) => (handle ? `https://ig.me/m/${handle}` : "");

/** Every profile handle linked in a piece of HTML / JSON / text, with how often (in order of first appearance). */
export function igHandlesIn(text: string): Map<string, number> {
  const found = new Map<string, number>();
  for (const h of linkedHandles(text)) found.set(h, (found.get(h) ?? 0) + 1);
  return found;
}

/** "Follow us on Instagram @joes.roofing" — handles written out next to the word Instagram (visible text only). */
export function igMentionsIn(text: string): string[] {
  const out: string[] = [];
  const re =
    /\b(?:instagram|insta|ig)\b[^@\n]{0,40}(?<![A-Za-z0-9._%+-])@([A-Za-z0-9_.]{3,30})(?![A-Za-z0-9_@])/gi;
  for (const m of (text || "").matchAll(re)) {
    // "…@joesroofing.com" is an email domain or a website, not a handle.
    if (/\.(com|net|org|co|io|us|uk|be|nl|de|fr|ca|au|biz|info)$/i.test(m[1])) continue;
    const h = cleanHandle(m[1]);
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

/* ------------------------------------------------------------ similarity */

const LEGAL = new Set([
  "the",
  "and",
  "of",
  "for",
  "by",
  "at",
  "in",
  "llc",
  "inc",
  "ltd",
  "co",
  "corp",
  "company",
  "plc",
  "pllc",
  "pc",
  "bv",
  "bvba",
  "nv",
  "gmbh",
  "srl",
  "sarl",
  "sa",
  "llp",
  "lp",
  "vzw",
  "cv",
  "vof",
]);

/**
 * Words that describe a trade or a kind of business rather than naming one.
 * Thousands of accounts contain "roofing"; sharing only such a word with a
 * business says nothing about whose account it is.
 */
const TRADE = new Set(
  (
    "roofing roof roofer roofers plumbing plumber plumbers electric electrical electrician electricians hvac heating cooling air " +
    "landscaping landscape landscapes lawn lawncare tree trees service services construction contracting contractor contractors " +
    "cleaning cleaners painting painters painter dental dentist dentistry orthodontics salon spa fitness gym auto automotive car cars " +
    "repair repairs law legal lawyers attorney attorneys realty real estate homes home house restaurant cafe coffee bar grill pizza " +
    "pizzeria bakery kitchen clinic medical care design designs studio studios photography photo marketing group solutions pros pro " +
    "experts expert team shop store boutique beauty hair nails barber barbershop pet pets vet veterinary dog dogs grooming flooring " +
    "floors windows window doors door garage concrete paving fence fencing pools pool pest control moving movers storage towing " +
    "tires tire glass remodeling remodel renovation renovations builders builder building bath baths cabinets solar energy insurance " +
    "agency financial finance accounting tax consulting consultants tech digital media events event catering wedding weddings florist " +
    "flowers jewelry jewelers tattoo yoga massage chiropractic chiropractor therapy wellness health pharmacy optical eye family kids " +
    "academy school hotel inn motel travel tours rentals rental supply supplies equipment parts sales enterprises industries " +
    "international national american usa official online local best quality premier elite custom general handyman exteriors exterior " +
    "interiors interior siding gutters gutter drywall masonry carpentry welding excavating demolition insulation waterproofing " +
    "restoration mechanical cleaning detailing wash carwash laundry tailor clothing fashion apparel shoes furniture decor florals " +
    "bikes cycles motors motorsports marine boats outdoors sports golf dance music art gallery books toys games bbq burgers tacos sushi " +
    "thai mexican italian chinese indian deli diner bistro brewery brewing winery wine wines spirits lounge club tavern pub"
  ).split(" "),
);

function nameTokens(name: string): string[] {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !LEGAL.has(t));
}
const squash = (s: string) => nameTokens(s).join("");
const domainLabel = (domain?: string) =>
  (domain || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .split(".")[0]
    .replace(/[^a-z0-9]/g, "");

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}
/** Dice coefficient on letter pairs, 0..1. */
function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const pool = new Map<string, number>();
  for (const g of A) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of B) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (A.length + B.length);
}

/** Take trade words out of a squashed handle, longest first ("joesroofingdenver" → "joesdenver"). */
function stripTrade(h: string, words: string[]): string {
  let out = h;
  for (const w of [...words].sort((a, b) => b.length - a.length)) out = out.split(w).join("");
  return out;
}

/**
 * How well a handle fits a business, 0..100. 100 = the handle IS the name or
 * the domain; ≥ 75 = contains it; ≥ 55 = clearly related; below that, weak.
 * A shared trade word alone ("roofing") never counts.
 */
export function igNameScore(handle: string, biz: IgBusiness): number {
  const h = (handle || "").toLowerCase().replace(/[._]/g, "");
  if (!h) return 0;
  const d = domainLabel(biz.domain);
  const n = squash(biz.name || "");
  let best = 0;
  const contain = (x: string) => {
    if (!x || x.length < 4 || TRADE.has(x)) return;
    if (h === x) best = Math.max(best, 100);
    else if (h.startsWith(x) || x.startsWith(h))
      best = Math.max(best, Math.min(h.length, x.length) >= 5 ? 88 : 60);
    else if ((h.includes(x) || x.includes(h)) && Math.min(h.length, x.length) >= 5)
      best = Math.max(best, 78);
  };
  contain(d);
  contain(n);

  const toks = nameTokens(biz.name || "").filter((t) => t.length >= 2);
  const trade = toks.filter((t) => TRADE.has(t));
  const own = toks.filter((t) => !TRADE.has(t) && t.length >= 3);
  if (own.length) {
    const hit = own.filter((t) => h.includes(t));
    const ownLetters = own.reduce((a, t) => a + t.length, 0);
    const hitLetters = hit.reduce((a, t) => a + t.length, 0);
    if (hit.length === own.length) {
      // Every distinctive word of the name is in the handle.
      const backed = ownLetters >= 5 || trade.some((t) => h.includes(t));
      best = Math.max(best, backed ? 82 : 62);
    } else if (hitLetters / ownLetters >= 0.5 && hit.some((t) => t.length >= 4))
      best = Math.max(best, 60);
    // Initials + a word: "abc_plumbing" for "Allied Building Contractors Plumbing".
    if (toks.length >= 3) {
      const initials = toks.map((t) => t[0]).join("");
      if (initials.length >= 3 && h.startsWith(initials)) best = Math.max(best, 58);
    }
    // Close spelling of the distinctive part ("joe_roofing" for "Joe's Roofing").
    const core = own.join("");
    const hCore = stripTrade(
      h,
      [...trade, ...TRADE].filter((w) => w.length >= 4 && h.includes(w)),
    );
    if (core.length >= 4 && hCore.length >= 3) {
      const fuzzy = dice(hCore, core);
      if (fuzzy >= 0.72) best = Math.max(best, 70);
      else if (fuzzy >= 0.55) best = Math.max(best, 50);
    }
  } else if (trade.length >= 2 && trade.every((t) => h.includes(t))) {
    // A name made only of trade words ("Roofing Pros"): the whole of it must be there.
    best = Math.max(best, 70);
  }
  if (d.length >= 5 && !TRADE.has(d) && dice(h, d) >= 0.8) best = Math.max(best, 72);
  return best;
}

/** How alike two business names are, 0..100 (word order doesn't matter; a shared trade word alone doesn't count). */
export function nameMatchScore(a: string, b: string): number {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (!A.length || !B.length) return 0;
  if (A.join("") === B.join("")) return 100;
  const ownA = A.filter((t) => !TRADE.has(t));
  const ownB = B.filter((t) => !TRADE.has(t));
  // Names made only of trade words: all of the shorter one must be in the longer.
  if (!ownA.length || !ownB.length) {
    const shorter = A.length <= B.length ? A : B;
    const longer = A.length <= B.length ? B : A;
    return shorter.length >= 2 && shorter.every((t) => longer.includes(t)) ? 80 : 0;
  }
  const shorter = ownA.length <= ownB.length ? ownA : ownB;
  const longer = ownA.length <= ownB.length ? ownB : ownA;
  const hit = shorter.filter((t) => longer.includes(t));
  const lettersAll = shorter.reduce((x, t) => x + t.length, 0);
  const lettersHit = hit.reduce((x, t) => x + t.length, 0);
  // Distinctive words only: "ABC Roofing" and "Joe's Roofing" share nothing.
  let best = Math.round(dice(ownA.join(""), ownB.join("")) * 85);
  if (hit.length === shorter.length && lettersAll >= 3)
    best = Math.max(best, lettersAll >= 5 || shorter.length >= 2 ? 92 : 75);
  else if (lettersHit / lettersAll >= 0.6 && hit.some((t) => t.length >= 4))
    best = Math.max(best, 65);
  return Math.min(100, best);
}

/** An agency-looking handle on a site that isn't an agency: probably the web designer's credit. */
const AGENCY_HINT =
  /(webdesign|web_design|websites?|marketing|media|digital|agency|studios?|creative|seo|branding|design)/;

/* -------------------------------------------------------------- website */

/**
 * The business's own profile among everything its website links to.
 * `pages` are the fetched pages (HTML); designer-credit links should already
 * be stripped by the caller.
 */
export function pickSiteInstagram(
  pages: { path: string; html: string }[],
  biz: IgBusiness,
): IgPick | null {
  interface Cand {
    handle: string;
    links: number;
    pages: Set<string>;
    sameAs: boolean;
    mentioned: boolean;
  }
  const cands = new Map<string, Cand>();
  const get = (h: string) => {
    let c = cands.get(h);
    if (!c)
      cands.set(
        h,
        (c = { handle: h, links: 0, pages: new Set(), sameAs: false, mentioned: false }),
      );
    return c;
  };
  for (const pg of pages) {
    const html = pg.html || "";
    for (const [h, n] of igHandlesIn(html)) {
      const c = get(h);
      c.links += n;
      c.pages.add(pg.path);
    }
    // schema.org "sameAs" and rel="me" are the site saying "this is us".
    const flat = unescapeSlashes(html);
    for (const m of flat.matchAll(/"sameAs"\s*:\s*(\[[^\]]{0,2000}\]|"[^"]{0,300}")/gi))
      for (const h of igHandlesIn(m[1]).keys()) get(h).sameAs = true;
    for (const m of flat.matchAll(/<a\b[^>]*\brel\s*=\s*["'][^"']*\bme\b[^"']*["'][^>]*>/gi))
      for (const h of igHandlesIn(m[0]).keys()) get(h).sameAs = true;
    // "@handle" written out next to the word Instagram (no link at all).
    const visible = flat
      .replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    for (const h of igMentionsIn(visible)) {
      const c = get(h);
      c.mentioned = true;
      c.pages.add(pg.path);
    }
  }
  if (!cands.size) return null;

  const bizIsAgency =
    AGENCY_HINT.test(squash(biz.name || "")) || AGENCY_HINT.test(domainLabel(biz.domain));
  const scored = [...cands.values()].map((c) => {
    const name = igFit(c.handle, biz);
    let score = 40 + name * 0.45;
    if (c.sameAs) score += 14;
    if (c.pages.size >= 2) score += 10; // header/footer icon: on every page
    if (c.pages.has("/")) score += 4;
    if (c.links >= 1) score += 4; // an actual link, not just a mention
    if (!bizIsAgency && name < 55 && AGENCY_HINT.test(c.handle)) score -= 35;
    return { c, name, score };
  });
  scored.sort((a, b) => b.score - a.score || b.c.links - a.c.links);
  const top = scored[0];
  if (top.score < 30) return null; // only an agency-looking credit
  const alone = scored.filter((s) => s.score >= 30).length === 1;
  // A social icon sits in the header or footer — on every page. A lone link on
  // just one of several pages, to an account named nothing like the business,
  // is more often a supplier's or a partner's badge.
  const passing =
    alone && top.c.links >= 1 && top.name < 30 && pages.length >= 2 && top.c.pages.size < 2;
  const sure =
    top.name >= 55 ||
    top.c.sameAs ||
    (alone && top.c.links >= 1 && !passing) ||
    (top.c.pages.size >= 2 && top.c.links >= 2);
  const why =
    top.name >= 75
      ? "linked on their website, and the handle matches the business name"
      : top.c.sameAs
        ? "their website names it as their own profile"
        : top.c.links
          ? passing
            ? "linked on one page of their website, under a different name (check it's theirs)"
            : alone
              ? "the only Instagram profile their website links to"
              : "the Instagram profile their website links to most"
          : "written on their website next to the word Instagram";
  return {
    url: igUrl(top.c.handle),
    handle: top.c.handle,
    confidence: sure ? "sure" : "likely",
    via: "site",
    followers: null,
    why,
  };
}

/* --------------------------------------------------------------- search */

/** "12.4K Followers" / "1,234 followers" / "2M Followers" → a number. */
export function igFollowers(text: string): number | null {
  const m = /(\d[\d.,]*)\s*([KkMm])?\+?\s+Followers/i.exec(text || "");
  if (!m) return null;
  const unit = (m[2] || "").toLowerCase();
  let n: number;
  if (unit) n = parseFloat(m[1].replace(/,/g, ".")) * (unit === "k" ? 1_000 : 1_000_000);
  else n = parseInt(m[1].replace(/[.,]/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** "1.2k", "12k", "1.3M" for a follower count. */
export function followersLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}

const digits = (s?: string) => (s || "").replace(/\D/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How well a handle fits the business (0–100), by its listing name or by that name without the "LLC" / "| Roof Repair" tail. */
export function igFit(handle: string, biz: IgBusiness): number {
  const short = igSearchName(biz.name);
  const full = igNameScore(handle, biz);
  return short && short !== (biz.name || "").trim()
    ? Math.max(full, igNameScore(handle, { ...biz, name: short }))
    : full;
}
function displayFit(display: string, biz: IgBusiness): number {
  const short = igSearchName(biz.name);
  return Math.max(
    nameMatchScore(display, biz.name || ""),
    short ? nameMatchScore(display, short) : 0,
  );
}

const US_STATES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};
const COUNTRIES = new Set(
  "usa|us|u.s.|u.s.a.|united states|united states of america|america|canada|uk|united kingdom|england|scotland|wales|ireland|australia|new zealand|belgium|belgië|belgie|belgique|nederland|netherlands|the netherlands|france|deutschland|germany".split(
    "|",
  ),
);

/**
 * Where the business is, in the words a profile would use. A search is often
 * run for a whole state ("new mexico"), and then that is all we know: the state
 * by name, or written the usual way after the town (", NM").
 */
function placeOf(city?: string): { label: string; town: string; state: string; abbr: string } {
  const label = (city || "").split(",")[0].trim();
  const first = label.toLowerCase();
  if (!first || COUNTRIES.has(first)) return { label: "", town: "", state: "", abbr: "" };
  if (US_STATES[first]) return { label, town: "", state: first, abbr: US_STATES[first] };
  return { label, town: first, state: "", abbr: "" };
}

/** Does this text (or the handle itself) place the account where the business is? */
function mentionsPlace(text: string, handle: string, place: ReturnType<typeof placeOf>): boolean {
  const lower = text.toLowerCase();
  const word = (w: string) =>
    new RegExp(`(^|[^a-z0-9])${escapeRe(w)}([^a-z0-9]|$)`, "i").test(lower);
  const inHandle = (w: string) => {
    const flat = w.replace(/[^a-z0-9]/g, "");
    return flat.length >= 4 && handle.replace(/[._]/g, "").includes(flat);
  };
  // The town as a whole word ("Ely" must not match "safely"), or built into the handle.
  if (place.town && place.town.length >= 3 && (word(place.town) || inHandle(place.town)))
    return true;
  if (place.state) {
    if (word(place.state) || inHandle(place.state)) return true;
    // "Albuquerque, NM" or "NM 87102" — never a bare "ME" or "OK" in the middle of a sentence.
    if (
      new RegExp(`,\\s*${place.abbr}(?![A-Za-z])|(?<![A-Za-z])${place.abbr}\\s+\\d{5}(?!\\d)`).test(
        text,
      )
    )
      return true;
  }
  return false;
}

/** What an address on Instagram points at: a profile, one of somebody's posts, or one of Instagram's own pages. */
function igLinkKind(link: string): {
  kind: "off" | "profile" | "post" | "section";
  handle: string;
} {
  const m =
    /^(?:https?:)?(?:\/\/)?((?:[a-z0-9-]+\.)*)(?:instagram\.com|instagr\.am)\/([^?#]*)/i.exec(
      unescapeSlashes(link || "").trim(),
    );
  if (!m) return { kind: "off", handle: "" };
  if (!MAIN_HOST.test(m[1] || "")) return { kind: "section", handle: "" };
  const parts = m[2]
    .split("/")
    .filter(Boolean)
    .map((x) => x.toLowerCase());
  if (parts[0] === "_u") parts.shift();
  const first = (parts[0] || "").replace(/^@/, "");
  if (POST_PARTS.has(first) || first === "reels") return { kind: "post", handle: "" };
  const handle = cleanHandle(first);
  if (!handle) return { kind: "section", handle: "" };
  if (!parts[1] || PROFILE_TABS.has(parts[1])) return { kind: "profile", handle };
  // instagram.com/<them>/p/<post>: a post, and the handle is whoever posted it.
  return { kind: "post", handle };
}

/** Did this search answer with Instagram profiles at all? When it did and none is theirs, asking again rarely helps. */
export function igResultsHaveProfiles(results: SearchResult[]): boolean {
  return results.slice(0, 10).some((r) => igLinkKind(r.link || "").kind === "profile");
}

/**
 * The business's profile among search results — only when something beyond
 * "it was the first hit" says it is theirs: the name, their website or phone
 * in the bio, the town. A similarly named business elsewhere is not accepted,
 * and neither is somebody else's post that happens to mention them.
 * `not`: handles already turned down for this business by hand.
 */
export function pickSearchInstagram(
  results: SearchResult[],
  biz: IgBusiness,
  opts: { not?: string[] } = {},
): IgPick | null {
  const domain = cleanDomain(biz.domain);
  // Their own domain only: "facebook.com" or "linktr.ee" in a bio proves nothing.
  const domainRe =
    isCompanyDomain(domain) && domain.length >= 5
      ? new RegExp(`(^|[^a-z0-9-])${escapeRe(domain)}(?![a-z0-9-]|\\.[a-z])`)
      : null;
  const phone = digits(biz.phone).slice(-9);
  const place = placeOf(biz.city);
  const turnedDown = new Set((opts.not ?? []).map((h) => igHandle(h)).filter(Boolean));
  let best: (IgPick & { score: number }) | null = null;

  results.slice(0, 10).forEach((r, rank) => {
    const link = r.link || "";
    const title = r.title || "";
    const snippet = r.snippet || "";
    const text = `${title} ${snippet}`;
    const lower = text.toLowerCase();
    const where = igLinkKind(link);
    if (where.kind === "section") return; // a hashtag, a location, a "popular" page: nobody's profile
    const kind: "profile" | "post" | "page" = where.kind === "off" ? "page" : where.kind;
    let h = where.handle;
    // A post listed without its owner in the address: Instagram puts "(@handle)" in the title.
    if (kind === "post" && !h) h = igHandle(/\(@([A-Za-z0-9_.]{1,30})\)/.exec(text)?.[1] || "");
    // Another site (their own, Facebook, a directory) that names an Instagram: the one that fits the name best.
    if (kind === "page")
      h = [...igHandlesIn(text).keys()].sort((a, b) => igFit(b, biz) - igFit(a, biz))[0] || "";
    if (!h || turnedDown.has(h)) return;

    // Whose name is on it: the profile's display name, or the poster's (never the caption).
    const display =
      kind === "profile"
        ? title.split(/\s*\(@|\s+[•·|-]\s+Instagram|\s+on Instagram/i)[0].trim()
        : kind === "post"
          ? title.split(/\s*\(@|\s+on Instagram|\s+[•·|]\s+/i)[0].trim()
          : "";
    const byHandle = igFit(h, biz);
    const byDisplay = display ? displayFit(display, biz) : 0;
    const nameFit = Math.max(byHandle, byDisplay);
    const followers = kind === "profile" ? igFollowers(text) : null;
    const hasDomain = !!domainRe && domainRe.test(lower);
    const hasPhone =
      phone.length >= 7 &&
      (text.match(/\+?\d[\d\s().-]{5,}\d/g) ?? []).some((t) => digits(t).endsWith(phone));
    const hasPlace = mentionsPlace(text, h, place);
    const hard = hasDomain || hasPhone;

    if (kind === "profile") {
      // A real profile result names its handle or shows its numbers. Anything else under
      // instagram.com/<word> is one of Instagram's own pages unless the word IS the business.
      const shown =
        new RegExp(`\\(@${escapeRe(h)}\\)`, "i").test(text) ||
        followers != null ||
        /instagram photos and videos/i.test(title);
      if (!shown && byHandle < 75) return;
      // Something must tie it to THIS business.
      if (!hard && byHandle < 55 && byDisplay < 65) return;
    } else if (kind === "post") {
      // A caption can quote anyone's phone number or website: the poster must carry the name.
      if (byHandle < 55 && byDisplay < 65) return;
    } else {
      // A general page: the handle itself must fit, backed by the town or by hard evidence.
      if (byHandle < 55) return;
      if (!hard && !(byHandle >= 75 && hasPlace)) return;
    }
    // A name-only match that doesn't mention the place must at least be near the top.
    if (!hard && !hasPlace && (rank > 2 || nameFit < 75)) return;
    // Hundreds of thousands of followers and nothing but a similar name: a national brand, not this business.
    if (!hard && followers != null && followers >= 300_000) return;

    let score = nameFit * 0.5 + Math.min(byHandle, byDisplay) * 0.15;
    // Their own website or phone in the bio beats any name match, however good.
    if (hasDomain) score += 100;
    if (hasPhone) score += 100;
    if (hasPlace) score += 12;
    if (kind === "profile") score += 8;
    if (rank === 0) score += 4;
    if (score < 45) return;

    // Their website or phone in the bio settles it; a matching name does only
    // together with the place (same-named businesses exist everywhere).
    const sure = (hard && (kind === "profile" || nameFit >= 75)) || (nameFit >= 75 && hasPlace);
    const why = hasDomain
      ? "the profile mentions their website"
      : hasPhone
        ? "the profile shows their phone number"
        : hasPlace
          ? `the name matches and it mentions ${place.label}`
          : "the name matches (check it's the right business)";
    if (!best || score > best.score)
      best = {
        url: igUrl(h),
        handle: h,
        confidence: sure ? "sure" : "likely",
        via: "search",
        followers,
        why,
        score,
      };
  });
  if (!best) return null;
  const { score: _score, ...pick } = best as IgPick & { score: number };
  return pick;
}

const LEGAL_TAIL =
  /[\s,]+(?:l\.?l\.?c|inc|incorporated|ltd|limited|corp|corporation|pllc|plc|llp|bvba|gmbh|sarl|srl|vzw)\.?$/i;
/** Two-letter forms only when written as such ("Dakwerken Peeters BV"), never the end of an ordinary word. */
const LEGAL_TAIL_SHORT = /[\s,]+(?:BV|NV|SA|LP|PC|CV)\.?$/;

/**
 * The business's name as people — and its Instagram — write it: without "LLC",
 * and without the keywords a listing adds after it ("Joe's Roofing | Roof
 * Repair Denver"). Searching and matching on this finds far more than the raw
 * listing name does.
 */
export function igSearchName(raw?: string): string {
  let name = (raw || "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  const head = name.split(/\s+[|•·–—]\s+|\s+-\s+|\s*:\s+|\s*\(/)[0].trim();
  // Only when what's left still names someone ("Tree Service | Maven" keeps everything).
  if (head && head !== name && nameTokens(head).some((t) => !TRADE.has(t) && t.length >= 2))
    name = head;
  for (let i = 0; i < 3 && (LEGAL_TAIL.test(name) || LEGAL_TAIL_SHORT.test(name)); i++)
    name = name.replace(LEGAL_TAIL, "").replace(LEGAL_TAIL_SHORT, "").trim();
  return name.replace(/[\s,.&-]+$/, "");
}

/**
 * Is a search worth a credit? With a name made only of trade words ("Tree
 * Service") and neither a website nor a phone number to recognise the profile
 * by, no result could ever be told apart from the next business.
 */
export function igSearchWorthIt(biz: IgBusiness): boolean {
  const name = igSearchName(biz.name);
  if (!name) return false;
  if (nameTokens(name).some((t) => !TRADE.has(t) && t.length >= 3)) return true;
  return isCompanyDomain(cleanDomain(biz.domain)) || digits(biz.phone).length >= 7;
}

/**
 * The searches for a business, best first. The first is restricted to
 * Instagram, so every result is a candidate; the second is only for when
 * Instagram answered with no profile at all.
 */
export function igSearchQueries(biz: IgBusiness): string[] {
  const name = igSearchName(biz.name);
  if (!name) return [];
  const { label } = placeOf(biz.city);
  // "Joe's Roofing Denver" already says where.
  const place = label && !name.toLowerCase().includes(label.toLowerCase()) ? label : "";
  return [
    `site:instagram.com ${name} ${place}`.trim(),
    `${name} ${place} instagram`.replace(/\s+/g, " ").trim(),
  ];
}

/* -------------------------------------------------------------- listing */

/** A listing whose "website" is really an Instagram profile → that profile URL. */
export function igFromListingUrl(rawUrl: string): string {
  const s = String(rawUrl || "");
  if (!/instagram\.com|instagr\.am|ig\.me/i.test(s)) return "";
  return igUrl(igHandle(s));
}

const BIO_HOSTS =
  /^(?:https?:\/\/)?(?:www\.)?(linktr\.ee|beacons\.ai|lnk\.bio|linkin\.bio|bio\.link|bio\.site|campsite\.bio|tap\.bio|taplink\.cc|msha\.ke|solo\.to|flow\.page|linkpop\.com|hoo\.be|komi\.io|stan\.store|direct\.me|allmylinks\.com|biolinky\.co|znap\.link|withkoji\.com|milkshake\.app|linkr\.bio|instabio\.cc|heylink\.me|many\.link|snipfeed\.co)\/([A-Za-z0-9_.@-]{1,60})/i;

/** A link-in-bio page (Linktree and friends) given as the "website" → its full https URL, else "". */
export function bioLinkUrl(rawUrl: string): string {
  const m = BIO_HOSTS.exec(String(rawUrl || "").trim());
  return m ? `https://${m[1].toLowerCase()}/${m[2]}` : "";
}

/** The Instagram profile a link-in-bio page points to (the page owner's own). */
export function pickBioInstagram(html: string, bioUrl: string, biz: IgBusiness): IgPick | null {
  const pick = pickSiteInstagram([{ path: "/", html }], {
    ...biz,
    // The bio page's own name is usually the Instagram handle too.
    domain: biz.domain || bioUrl.split("/").pop() || "",
  });
  return pick
    ? { ...pick, via: "bio", why: "linked on the link-in-bio page their listing points to" }
    : null;
}

/**
 * What a listing's "website" really is when it isn't a website: many small
 * businesses put their Instagram or a link-in-bio page there. Kept instead of
 * being thrown away with the other non-websites.
 */
export function listingSocials(rawWebsite?: string | null): {
  instagram?: string;
  bioLink?: string;
} {
  const instagram = igFromListingUrl(rawWebsite || "");
  if (instagram) return { instagram };
  const bioLink = bioLinkUrl(rawWebsite || "");
  return bioLink ? { bioLink } : {};
}
