import { fetchPublicSite } from '../public-site-fetch';
/**
 * Free enrichment — everything we can learn about a business without paying
 * anyone, from its own website:
 *
 *  1. Fetch the homepage + the usual contact/about/team pages.
 *  2. Pull emails (text + mailto:), phones (tel: + text), social profiles
 *     (LinkedIn / Facebook / Instagram), and owner/founder names from JSON-LD,
 *     meta tags and "Owner / Founder / Dr." patterns in the copy.
 *  3. Check the domain's MX record over DNS-over-HTTPS (works from a Worker;
 *     no port 25 needed) so we never queue mail to a dead domain.
 *  4. If no email was published, propose standard patterns (first@, first.last@,
 *     info@) flagged as GUESSED so the UI can show them honestly.
 *
 * Nothing here costs money. Claude (a fraction of a cent per site) only runs
 * afterwards, on the text we already fetched, to pick the decision-maker.
 */

export interface FreeEnrichResult {
  ok: boolean;
  website: string; // final domain after redirects
  text: string; // plain text of the pages we read (for Claude)
  emails: { email: string; source: "site" | "guess"; page: string; mx: boolean | null }[];
  phones: string[];
  socials: { linkedin: string; facebook: string; instagram: string };
  names: { name: string; title: string; source: string }[];
  mx: boolean | null; // null = unknown (lookup failed)
  pages: string[];
  signals: SiteSignals;
  error?: string;
}

/** Cheap "is this a good prospect" signals read off the website itself. */
export interface SiteSignals {
  https: boolean;
  pageCount: number;
  metaPixel: boolean; // runs Facebook/Instagram ads (or at least tracks)
  googleAds: boolean; // AW- conversion tag
  gtm: boolean; // Google Tag Manager / gtag
  booking: string; // calendly | housecallpro | jobber | servicetitan | acuity | square | ''
  chat: boolean; // live chat widget
  builder: string; // wix | squarespace | godaddy | weebly | wordpress | ''
  copyrightYear: number | null;
  reviewsWidget: boolean;
  socialCount: number;
}

export function readSignals(
  pages: { path: string; html: string }[],
  finalUrl: string,
): SiteSignals {
  const all = pages.map((p) => p.html).join("\n");
  const has = (re: RegExp) => re.test(all);
  const years = Array.from(
    all.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi),
  ).map((m) => Number(m[1]));
  const booking = /calendly\.com/i.test(all)
    ? "calendly"
    : /housecallpro|housecall-pro/i.test(all)
      ? "housecallpro"
      : /getjobber|clienthub\.app/i.test(all)
        ? "jobber"
        : /servicetitan/i.test(all)
          ? "servicetitan"
          : /acuityscheduling/i.test(all)
            ? "acuity"
            : /squareup\.com\/appointments|square\.site/i.test(all)
              ? "square"
              : "";
  const builder = /wixstatic|wix\.com|_wix/i.test(all)
    ? "wix"
    : /squarespace/i.test(all)
      ? "squarespace"
      : /godaddy|secureserver/i.test(all)
        ? "godaddy"
        : /weebly/i.test(all)
          ? "weebly"
          : /wp-content|wp-includes/i.test(all)
            ? "wordpress"
            : "";
  return {
    https: /^https:/i.test(finalUrl),
    pageCount: pages.length,
    metaPixel: has(/fbq\s*\(|connect\.facebook\.net\/[a-z_]+\/fbevents/i),
    googleAds: has(/\bAW-\d{6,}/),
    gtm: has(/googletagmanager\.com|gtag\s*\(/i),
    booking,
    chat: has(/tawk\.to|intercom|drift\.com|crisp\.chat|tidio|livechat|podium\.com|birdeye/i),
    builder,
    copyrightYear: years.length ? Math.max(...years) : null,
    reviewsWidget: has(/elfsight|trustindex|birdeye|podium|nicejob|reviewsio|google-reviews/i),
    socialCount: 0,
  };
}

/* ------------------------------------------------------------------ score */
export interface ScoreInput {
  rating?: number;
  reviews?: number;
  website: string;
  name: string; // decision-maker name if found
  email: string;
  emailGuessed: boolean;
  mx: boolean | null;
  phone: string;
  signals?: Partial<SiteSignals> | null;
  /** AI marketing-need rating 0–100; when present it replaces the heuristic "room to improve". */
  aiNeed?: number | null;
}

/**
 * 0–100. Higher = more worth emailing. The scale is tuned for a marketing
 * agency selling websites / ads / automation to local service businesses:
 * reachable + real business + visible room to improve.
 */
export function scoreLead(i: ScoreInput): { score: number; reasons: string[] } {
  let s = 0;
  const why: string[] = [];
  const add = (n: number, r: string) => {
    s += n;
    why.push(`${n > 0 ? "+" : ""}${n} ${r}`);
  };

  // Reachability (max 45)
  if (i.email && !i.emailGuessed) add(25, "published email");
  else if (i.email && i.emailGuessed && i.mx) add(12, "guessed email, mail server OK");
  else if (!i.email) add(-10, "no email");
  if (i.email && !/^(info|office|contact|hello|admin|sales|support|team|mail)@/i.test(i.email))
    add(10, "personal address");
  if (i.name) add(10, "decision-maker named");
  if (i.phone) add(5, "phone on file");
  if (i.mx === false) add(-30, "domain has no mail server");

  // Real, active business (max 25)
  const rv = i.reviews ?? 0;
  if (rv >= 100) add(15, `${rv} reviews`);
  else if (rv >= 25) add(10, `${rv} reviews`);
  else if (rv >= 5) add(5, `${rv} reviews`);
  else if (i.reviews !== undefined) add(-5, "under 5 reviews");
  if ((i.rating ?? 0) >= 4.5) add(5, `rating ${i.rating}`);
  else if (i.rating && i.rating < 3.8) add(-5, `rating ${i.rating}`);
  if (i.website) add(5, "has website");
  else add(-15, "no website");

  // Room to improve = reason to buy (max 30)
  const g = i.signals ?? {};
  if (typeof i.aiNeed === "number") {
    add(Math.round(i.aiNeed * 0.3), `needs marketing help ${i.aiNeed}/100 (AI)`);
    const score0 = Math.max(0, Math.min(100, Math.round(s)));
    return { score: score0, reasons: why };
  }
  if (i.website && !g.metaPixel && !g.googleAds) add(10, "no ad tracking (not running ads)");
  else if (g.metaPixel || g.googleAds) add(4, "already advertising (has budget)");
  if (i.website && !g.booking) add(5, "no online booking");
  if (g.copyrightYear && g.copyrightYear <= new Date().getFullYear() - 3)
    add(8, `site dated ${g.copyrightYear}`);
  if (g.builder && /wix|godaddy|weebly/i.test(g.builder)) add(5, `${g.builder} site`);
  if (i.website && g.https === false) add(4, "no HTTPS");
  if (i.website && !g.reviewsWidget && !g.chat) add(3, "no reviews/chat widget");

  const score = Math.max(0, Math.min(100, Math.round(s)));
  return { score, reasons: why };
}

const PAGES = [
  "",
  "/contact",
  "/about",
  "/contact-us",
  "/about-us",
  "/team",
  "/our-team",
  "/meet-the-team",
  "/staff",
];
// Tiered crawl: these first; the rest only if they didn't surface an owner + email.
const TIER1 = ["/contact", "/about"];
const TIER2 = ["/contact-us", "/about-us", "/team", "/our-team", "/meet-the-team", "/staff"];
const OWNER_HINT_RE =
  /\b(owner|founder|ceo|president|principal|proprietor|managing director|zaakvoerder|eigenaar|oprichter|g[ée]rant|fondateur|inhaber|geschäftsführer)\b/i;
const UA = "Mozilla/5.0 (compatible; Inspirova-Research/2.0; +https://inspirovamarketing.com)";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JUNK_EMAIL =
  /\.(png|jpg|jpeg|gif|webp|svg|css|js)$|(example|sentry|wixpress|domain|email|yourdomain|squarespace|wordpress)\.com$|^(noreply|no-reply|donotreply)@/i;
const PHONE_RE =
  /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\+\d{1,3}[\s.-]?\d[\d\s().-]{6,}\d/g;
const OWNER_WORDS =
  /(owner|founder|co-founder|president|ceo|principal|managing (director|partner)|proprietor|dr\.?)/i;

export function cleanDomain(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function fetchPage(
  url: string,
  timeoutMs: number,
): Promise<{ html: string; finalUrl: string } | null> {
  try {
    return await fetchPublicSite(url, timeoutMs, {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en",
    });
  } catch {
    return null;
  }
}

/** MX lookup via Cloudflare DNS-over-HTTPS. true/false, or null if the lookup failed. */
export async function hasMx(domain: string): Promise<boolean | null> {
  if (!domain) return null;
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { Status?: number; Answer?: { type: number }[] };
    if (d.Status === 3) return false; // NXDOMAIN
    if (d.Status !== undefined && d.Status !== 0) return null; // DNS failure, not absence
    if (d.Answer?.some((a) => a.type === 15)) return true;
    // Some small businesses have no MX but an A record that accepts mail; treat as unknown-ish false.
    return false;
  } catch {
    return null;
  }
}

function extractJsonLdPeople(html: string): { name: string; title: string; source: string }[] {
  const out: { name: string; title: string; source: string }[] = [];
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const b of blocks) {
    const inner = b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const data = JSON.parse(inner);
      const walk = (node: unknown, depth = 0) => {
        if (!node || depth > 6) return;
        if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
        if (typeof node !== "object") return;
        const o = node as Record<string, unknown>;
        const type = String(o["@type"] ?? "");
        if (/Person/i.test(type) && typeof o.name === "string") {
          out.push({ name: o.name, title: String(o.jobTitle ?? ""), source: "schema.org/Person" });
        }
        for (const k of ["founder", "founders", "employee", "employees", "member", "author"]) {
          const v = o[k];
          if (typeof v === "string")
            out.push({
              name: v,
              title: k === "founder" || k === "founders" ? "Founder" : "",
              source: `schema.org/${k}`,
            });
          else if (v) walk(v, depth + 1);
        }
        for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, depth + 1);
      };
      walk(data);
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return out;
}

/** "Owner John Smith", "John Smith, Owner", "Dr. Jane Doe" patterns in plain text. */
function extractNamesFromText(text: string): { name: string; title: string; source: string }[] {
  const out: { name: string; title: string; source: string }[] = [];
  const NAME = "([A-Z][a-z]+(?:\\s(?:[A-Z]\\.|[A-Z][a-z]+)){1,2})";
  const TITLE =
    "(Owner|Founder|Co-Founder|President|CEO|Principal|Managing Director|Managing Partner|Proprietor|General Manager)";
  const re1 = new RegExp(`${NAME},?\\s*[-–—|]?\\s*${TITLE}\\b`, "g");
  const re2 = new RegExp(`\\b${TITLE}[:,]?\\s+${NAME}`, "g");
  const re3 = new RegExp(`\\bDr\\.?\\s+${NAME}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re1.exec(text))) out.push({ name: m[1], title: m[2], source: "site text" });
  while ((m = re2.exec(text))) out.push({ name: m[2], title: m[1], source: "site text" });
  while ((m = re3.exec(text)))
    out.push({ name: `Dr. ${m[1]}`, title: "Doctor", source: "site text" });
  // Dedupe + sanity (skip "Contact Us", "Privacy Policy" style false positives)
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = p.name.toLowerCase();
    if (
      seen.has(k) ||
      /contact|privacy|policy|terms|services?|about|home|our|the|free|quote|estimate|call/i.test(
        p.name,
      )
    )
      return false;
    seen.add(k);
    return true;
  });
}

function guessPatterns(first: string, last: string, domain: string): string[] {
  const f = first.toLowerCase().replace(/[^a-z]/g, "");
  const l = last.toLowerCase().replace(/[^a-z]/g, "");
  const list: string[] = [];
  if (f && l)
    list.push(
      `${f}@${domain}`,
      `${f}.${l}@${domain}`,
      `${f[0]}${l}@${domain}`,
      `${f}${l}@${domain}`,
    );
  else if (f) list.push(`${f}@${domain}`);
  list.push(`info@${domain}`, `office@${domain}`, `contact@${domain}`, `hello@${domain}`);
  return Array.from(new Set(list));
}

export async function freeEnrich(input: {
  website: string;
  ownerName?: string;
  maxPages?: number;
  /** Fetch /contact + /about first and the deeper pages only when needed. */
  tiered?: boolean;
}): Promise<FreeEnrichResult> {
  const domain = cleanDomain(input.website);
  const empty: FreeEnrichResult = {
    ok: false,
    website: domain,
    text: "",
    emails: [],
    phones: [],
    socials: { linkedin: "", facebook: "", instagram: "" },
    names: [],
    mx: null,
    pages: [],
    signals: {
      https: false,
      pageCount: 0,
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
  };
  if (!domain) return { ...empty, error: "no website" };

  const base = `https://${domain}`;
  const maxPages = Math.min(input.maxPages ?? PAGES.length, PAGES.length);

  // Homepage first (follows redirects → canonical domain), then the rest in parallel.
  const home = (await fetchPage(base, 8000)) ?? (await fetchPage(`http://${domain}`, 6000));
  if (!home) return { ...empty, error: "site unreachable" };
  const finalDomain = cleanDomain(home.finalUrl) || domain;
  const root = `https://${finalDomain}`;

  const grab = (paths: string[], ms: number) =>
    Promise.all(
      paths.map(async (p) => {
        const r = await fetchPage(root + p, ms);
        return r ? { path: p, html: r.html } : null;
      }),
    );
  const notNull = (x: { path: string; html: string } | null): x is { path: string; html: string } =>
    !!x;

  let extras: { path: string; html: string }[];
  if (input.tiered) {
    extras = (await grab(TIER1, 5000)).filter(notNull);
    const seen = [home.html, ...extras.map((e) => e.html)].join("\n");
    const ownEmailRe = new RegExp(
      `[a-z0-9._%+-]+@(?:www\\.)?${finalDomain.replace(/\./g, "\\.")}`,
      "i",
    );
    const haveEmail = /mailto:/i.test(seen) || ownEmailRe.test(seen);
    const havePerson = OWNER_HINT_RE.test(seen) || /"@type"\s*:\s*"Person"/i.test(seen);
    if (!haveEmail || !havePerson) extras.push(...(await grab(TIER2, 5000)).filter(notNull));
  } else {
    extras = (await grab(PAGES.slice(1, maxPages), 7000)).filter(notNull);
  }
  const pages = [{ path: "/", html: home.html }, ...extras];

  const mxPromise = hasMx(finalDomain);

  const emailMap = new Map<string, { page: string }>();
  const phones = new Set<string>();
  const socials = { linkedin: "", facebook: "", instagram: "" };
  const names: { name: string; title: string; source: string }[] = [];
  const texts: string[] = [];

  for (const pg of pages) {
    const html = pg.html;
    // mailto: and tel: links are the most reliable signals
    for (const m of html.matchAll(/mailto:([^"'?\s<>]+)/gi))
      emailMap.set(decodeURIComponent(m[1]).toLowerCase(), { page: pg.path });
    for (const m of html.matchAll(/tel:([+\d()\s.-]{7,})/gi)) phones.add(m[1].trim());
    // social links
    const li = html.match(
      /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company)\/[A-Za-z0-9_%-]+/i,
    );
    if (li && !socials.linkedin) socials.linkedin = li[0];
    const fb = html.match(
      /https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|plugins|tr\b)[A-Za-z0-9_.%-]+/i,
    );
    if (fb && !socials.facebook) socials.facebook = fb[0];
    const ig = html.match(/https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|share)[A-Za-z0-9_.%-]+/i);
    if (ig && !socials.instagram) socials.instagram = ig[0];
    // structured data people
    names.push(...extractJsonLdPeople(html));
    // obfuscated emails: "name [at] domain [dot] com"
    const deob = html
      .replace(/\s*\[\s*at\s*\]\s*|\s*\(\s*at\s*\)\s*/gi, "@")
      .replace(/\s*\[\s*dot\s*\]\s*|\s*\(\s*dot\s*\)\s*/gi, ".");
    const text = htmlToText(deob);
    texts.push(`=== ${pg.path || "/"} ===\n${text.slice(0, 12000)}`);
    for (const e of text.match(EMAIL_RE) ?? [])
      emailMap.set(e.toLowerCase(), emailMap.get(e.toLowerCase()) ?? { page: pg.path });
    for (const p of text.match(PHONE_RE) ?? []) phones.add(p.trim());
    names.push(...extractNamesFromText(text));
  }

  const mx = await mxPromise;
  const signals = readSignals(pages, home.finalUrl);

  // Rank emails: own-domain first, personal-looking before generic, drop junk.
  const ranked = Array.from(emailMap.entries())
    .filter(([e]) => !JUNK_EMAIL.test(e) && e.length < 80)
    .map(([email, meta]) => {
      const own = email.endsWith("@" + finalDomain) || email.endsWith("@" + domain);
      const generic =
        /^(info|office|contact|hello|admin|sales|support|service|team|mail|enquiries|inquiries)@/i.test(
          email,
        );
      return { email, page: meta.page, score: (own ? 2 : 0) + (generic ? 0 : 1) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((e) => ({ email: e.email, source: "site" as const, page: e.page, mx }));

  // Names: dedupe, prefer owner-ish titles
  const seenNames = new Set<string>();
  const people = names
    .filter((p) => p.name && p.name.split(" ").length >= 2 && p.name.length < 60)
    .filter((p) => {
      const k = p.name.toLowerCase();
      if (seenNames.has(k)) return false;
      seenNames.add(k);
      return true;
    })
    .sort((a, b) => Number(OWNER_WORDS.test(b.title)) - Number(OWNER_WORDS.test(a.title)))
    .slice(0, 6);

  // Pattern guesses when the site publishes nothing usable on its own domain.
  const guesses: FreeEnrichResult["emails"] = [];
  const hasOwnDomainEmail = ranked.some((e) => e.email.endsWith("@" + finalDomain));
  if (!hasOwnDomainEmail && mx !== false) {
    const who =
      input.ownerName ||
      people.find((p) => OWNER_WORDS.test(p.title))?.name ||
      people[0]?.name ||
      "";
    const parts = who
      .replace(/^Dr\.?\s+/i, "")
      .trim()
      .split(/\s+/);
    const first = parts[0] || "";
    const last = parts.length > 1 ? parts[parts.length - 1] : "";
    for (const g of guessPatterns(first, last, finalDomain).slice(0, 5))
      guesses.push({ email: g, source: "guess", page: "", mx });
  }

  // Normalise phones (keep first 3 distinct, prefer ones with 10+ digits)
  const phoneList = Array.from(phones)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => {
      const d = p.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 15;
    })
    .filter(
      (p, i, arr) => arr.findIndex((q) => q.replace(/\D/g, "") === p.replace(/\D/g, "")) === i,
    )
    .slice(0, 3);

  signals.socialCount = [socials.linkedin, socials.facebook, socials.instagram].filter(
    Boolean,
  ).length;

  return {
    ok: true,
    website: finalDomain,
    signals,
    text: texts.join("\n\n").slice(0, 30000),
    emails: [...ranked, ...guesses],
    phones: phoneList,
    socials,
    names: people,
    mx,
    pages: pages.map((p) => p.path || "/"),
  };
}
