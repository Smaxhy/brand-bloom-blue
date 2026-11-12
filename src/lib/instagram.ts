/**
 * Finding a business's OWN Instagram profile — on its website, in the listing
 * it came from, on its link-in-bio page and in search results — and telling it
 * apart from everybody else's: the web designer's, a supplier's, the website
 * builder's, or another business with a similar name.
 *
 * Pure functions (no network), so every rule here is covered by tests.
 */

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
]);

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
]);

const HANDLE = /^[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?$/;

/** A valid profile handle (lower-case) or "". */
function cleanHandle(raw: string): string {
  let h = (raw || "").trim().replace(/^@/, "").toLowerCase();
  h = h.replace(/[.]+$/, ""); // "…/joesroofing." at the end of a sentence
  if (!HANDLE.test(h) || /\.\./.test(h)) return "";
  if (/\.(js|css|php|html?|png|jpe?g|gif|svg|webp|json|xml|ico)$/.test(h)) return "";
  if (RESERVED.has(h) || NOT_A_BUSINESS.has(h)) return "";
  if (/^\d+$/.test(h)) return ""; // numeric ids, not names
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
    const name = igNameScore(c.handle, biz);
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
  const sure =
    top.name >= 55 ||
    top.c.sameAs ||
    (alone && top.c.links >= 1) ||
    (top.c.pages.size >= 2 && top.c.links >= 2);
  const why =
    top.name >= 75
      ? "linked on their website, and the handle matches the business name"
      : top.c.sameAs
        ? "their website names it as their own profile"
        : top.c.links
          ? alone
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

/**
 * The business's profile among search results — only when something beyond
 * "it was the first hit" says it is theirs: the name, their website or phone
 * in the bio, the town. A similarly named business elsewhere is not accepted.
 */
export function pickSearchInstagram(results: SearchResult[], biz: IgBusiness): IgPick | null {
  const domain = (biz.domain || "").toLowerCase().replace(/^www\./, "");
  const phone = digits(biz.phone).slice(-9);
  const city = (biz.city || "").toLowerCase().split(",")[0].trim();
  let best: (IgPick & { score: number }) | null = null;

  results.slice(0, 10).forEach((r, rank) => {
    const link = r.link || "";
    const title = r.title || "";
    const snippet = r.snippet || "";
    const text = `${title} ${snippet}`;
    const lower = text.toLowerCase();
    const onInstagram = /(^|\/\/)(www\.)?(instagram\.com|instagr\.am)\//i.test(link);
    // The profile this result is about: its own URL, or the "(@handle)" Instagram puts in titles.
    let handle = onInstagram ? igHandle(link) : "";
    const inTitle = /\(@([A-Za-z0-9_.]{1,30})\)/.exec(text);
    if (!handle && onInstagram && inTitle) handle = igHandle(inTitle[1]);
    // Another site (their own, Facebook, a directory) that names their Instagram.
    const elsewhere = !onInstagram && !handle ? [...igHandlesIn(text).keys()][0] || "" : "";
    if (!handle && !elsewhere) return;
    const h = handle || elsewhere;

    const display = onInstagram
      ? title.split(/\s*\(@|\s+[•·|-]\s+Instagram|\s+on Instagram/i)[0].trim()
      : "";
    const byHandle = igNameScore(h, biz);
    const byDisplay = display ? nameMatchScore(display, biz.name || "") : 0;
    const hasDomain = !!domain && domain.length >= 5 && lower.includes(domain);
    const hasPhone = phone.length >= 7 && digits(text).includes(phone);
    // The town as a whole word ("Ely" must not match "safely"), or built into the handle.
    const hasCity =
      !!city &&
      city.length >= 3 &&
      (new RegExp(
        `(^|[^a-z0-9])${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
        "i",
      ).test(lower) ||
        (city.replace(/[^a-z0-9]/g, "").length >= 4 &&
          h.replace(/[._]/g, "").includes(city.replace(/[^a-z0-9]/g, ""))));
    const hard = hasDomain || hasPhone;
    // Something must tie it to THIS business.
    if (!hard && byHandle < 55 && byDisplay < 65) return;
    // A name-only match from a general page needs the town too.
    if (!onInstagram && !hard && !(byHandle >= 75 && hasCity)) return;
    // A name-only match that doesn't mention the town must at least be near the top.
    if (!hard && !hasCity && (rank > 2 || Math.max(byHandle, byDisplay) < 75)) return;

    let score = Math.max(byHandle, byDisplay) * 0.5 + Math.min(byHandle, byDisplay) * 0.15;
    // Their own website or phone in the bio beats any name match, however good.
    if (hasDomain) score += 100;
    if (hasPhone) score += 100;
    if (hasCity) score += 12;
    if (onInstagram) score += 8;
    if (rank === 0) score += 4;
    if (score < 45) return;

    // Their website or phone in the bio settles it; a matching name does only
    // together with the town (same-named businesses exist everywhere).
    const sure = hard || (Math.max(byHandle, byDisplay) >= 75 && hasCity);
    const why = hasDomain
      ? "the profile mentions their website"
      : hasPhone
        ? "the profile shows their phone number"
        : hasCity
          ? `the name matches and it mentions ${biz.city?.split(",")[0].trim()}`
          : "the name matches (check it's the right business)";
    if (!best || score > best.score)
      best = {
        url: igUrl(h),
        handle: h,
        confidence: sure ? "sure" : "likely",
        via: "search",
        followers: onInstagram ? igFollowers(text) : null,
        why,
        score,
      };
  });
  if (!best) return null;
  const { score: _score, ...pick } = best as IgPick & { score: number };
  return pick;
}

/** The searches worth running for a business, most precise first. */
export function igSearchQueries(biz: IgBusiness): string[] {
  const name = (biz.name || "").replace(/["“”]/g, "").trim();
  const city = (biz.city || "").split(",")[0].trim();
  if (!name) return [];
  return [
    `site:instagram.com ${name} ${city}`.trim(),
    `"${name}" ${city} instagram`.replace(/\s+/g, " ").trim(),
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
