import { fetchPublicSite } from '../public-site-fetch';
import { pickSiteInstagram, type IgPick } from "../instagram";
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
  socials: { linkedin: string; facebook: string; instagram: string; tiktok: string; youtube: string };
  /** The business's own Instagram, with how sure we are and why (null = none on the site). */
  ig: IgPick | null;
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
/** Consumer mailboxes commonly published by small businesses. */
const FREE_MAIL = new Set("gmail.com googlemail.com yahoo.com yahoo.co.uk yahoo.fr ymail.com hotmail.com hotmail.be hotmail.fr outlook.com outlook.be live.com live.be live.nl msn.com icloud.com me.com mac.com aol.com comcast.net att.net verizon.net sbcglobal.net bellsouth.net cox.net charter.net protonmail.com proton.me mail.com gmx.com gmx.de gmx.net zoho.com telenet.be skynet.be proximus.be scarlet.be btinternet.com sky.com orange.fr free.fr wanadoo.fr laposte.net web.de t-online.de".split(" "));
/** Third-party services whose addresses show up on small-business sites (forms, builders, trackers). */
const THIRD_PARTY_DOMAIN =
  /(^|\.)(sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|wix\.com|squarespace\.com|shopify\.com|godaddy\.com|secureserver\.net|mailchimp\.com|hubspot\.com|jotform\.com|typeform\.com|google\.com|facebook\.com|cloudflare\.com|wordpress\.(com|org)|wpengine\.com|yelp\.com|angi\.com|homeadvisor\.com|thumbtack\.com|bbb\.org)$/i;
/** Role addresses that never reach the owner. */
const DEAD_END_LOCAL = /^(privacy|abuse|dmca|postmaster|hostmaster|security|unsubscribe|bounce|mailer-daemon|example|test|your|yourname|name|user|email|someone)([._-]|$)/i;
const GENERIC_WORDS = new Set("the and inc llc ltd co corp company services service group home homes design designs marketing media solutions construction contracting contractors contractor roofing plumbing electric electrical hvac heating cooling landscaping landscape lawn cleaning painting dental dentistry clinic law legal auto center centre studio shop store team office mail email info contact holiday lights lighting christmas pros pro experts expert bvba gmbh".split(" "));

/** "smith-plumbing" from "www.smith-plumbing.co.uk", "smithplumbing" from "mail.smithplumbing.com". */
export function mainLabel(domain: string): string {
  const parts = cleanDomain(domain).split(".").filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  parts.pop();
  if (parts.length >= 2 && /^(co|com|org|net|ac|gov|edu)$/.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] || "";
}
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Distinctive words of a business or owner name ("Smith Plumbing & Heating" → ["smith"]). */
export function brandTokens(...names: (string | undefined)[]): string[] {
  return names
    .flatMap((name) => (name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length >= 4 && !GENERIC_WORDS.has(token));
}

/** Domains of other organisations that often appear on a business's pages. */
const OTHER_ORG_WORDS = /web|design|media|digital|seo|marketing|studio|agency|creative|hosting|sites?$|chamber|county|cityof|township|school|library|police|sheriff|permit|realtor|supply|supplies|wholesale|distribut|directory|listing|review/;

export function emailPlausible(email: string, ctx: { domains: string[]; company?: string; owner?: string; city?: string; fromOwnSite?: boolean }): boolean {
  const e = email.toLowerCase().trim();
  if (!/^[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(e) || /\.\./.test(e) || JUNK_EMAIL.test(e)) return false;
  const [local, domain] = e.split("@");
  if (DEAD_END_LOCAL.test(local) || THIRD_PARTY_DOMAIN.test(domain)) return false;
  const own = ctx.domains.map(cleanDomain).filter(Boolean);
  if (own.some((d) => domain === d || domain.endsWith("." + d))) return true;
  const tokens = brandTokens(ctx.company, ctx.owner);
  if (FREE_MAIL.has(domain)) {
    // A Gmail/Outlook address published on the business's own pages is theirs;
    // from anywhere else it must carry the business or owner name.
    if (ctx.fromOwnSite) return true;
    return [...tokens, ...own.map((d) => squash(mainLabel(d)))].some((token) => token.length >= 4 && squash(local).includes(token));
  }
  // A different business domain only when it is clearly the same brand
  // ("smithplumbing.com" site, "office@smithplumbingaz.com"), never a web
  // designer, directory, chamber, city office or supplier mentioned on the page.
  if (!ctx.fromOwnSite) return false;
  if (/\.(gov|edu|mil)(\.[a-z]{2})?$/.test(domain)) return false;
  const theirs = squash(mainLabel(domain));
  if (theirs.length < 4 || OTHER_ORG_WORDS.test(theirs)) return false;
  for (const d of own) {
    const mine = squash(mainLabel(d));
    // their domain contains our whole brand name …
    if (mine.length >= 5 && theirs.includes(mine)) return true;
    // … or our domain starts with theirs and theirs is a real name, not a trade word
    if (theirs.length >= 8 && mine.startsWith(theirs) && !GENERIC_WORDS.has(theirs)) return true;
  }
  // The business's own first word (not the town) starting their domain: "Smith Plumbing" → smithph.com.
  const first = brandTokens((ctx.company || "").split(/\s+/)[0]).find((t) => t.length >= 5);
  const town = squash(ctx.city || "");
  return !!first && first !== town && !town.startsWith(first) && theirs.startsWith(first) && theirs.length <= first.length + 4;
}

/** Search snippets must not fall back to a directory or competitor's email. */
export function pickBusinessEmail(text: string, domain?: string, ctx: { company?: string; owner?: string } = {}): string {
  const found = (text.match(EMAIL_RE) ?? []).map((email) => email.toLowerCase()).filter((email) => emailPlausible(email, { domains: domain ? [domain] : [], ...ctx }));
  return found.find((email) => domain && email.endsWith("@" + cleanDomain(domain))) || found[0] || "";
}
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

/** Decode addresses protected by Cloudflare's public email-obfuscation markup. */
export function decodeCfEmail(hex: string): string {
  if (!/^[0-9a-f]{4,320}$/i.test(hex) || hex.length % 2) return "";
  const key = parseInt(hex.slice(0, 2), 16);
  const bytes = new Uint8Array(hex.length / 2 - 1);
  for (let i = 2; i < hex.length; i += 2)
    bytes[i / 2 - 1] = parseInt(hex.slice(i, i + 2), 16) ^ key;
  const email = new TextDecoder().decode(bytes);
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email) ? email : "";
}

/** Published addresses hidden with Cloudflare, HTML entities or deliberate at/dot text. */
export function hiddenEmails(html: string): string[] {
  const found = new Set<string>();
  const content = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const match of content.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']|email-protection#([0-9a-f]+)/gi)) {
    const email = decodeCfEmail(match[1] || match[2] || "");
    if (email) found.add(email.toLowerCase());
  }
  const entities = content
    // JS/JSON unicode escapes that hide the @ and . in script/JSON blobs (Wix, Squarespace).
    .replace(/\\u0*40|\\x40/gi, "@")
    .replace(/\\u0*2e|\\x2e/gi, ".")
    .replace(/&#0*64;|&#x0*40;|&commat;/gi, "@")
    .replace(/&#0*46;|&#x0*2e;|&period;/gi, ".");
  // Use visible text rather than script/style content to avoid tracking addresses.
  const spelled = htmlToText(entities).replace(
    /\b([a-z0-9._%+-]{1,})\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\s+at\s+|@)\s*([a-z0-9-]+(?:\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+|\.)\s*[a-z0-9-]+)+)\b/gi,
    (_match, user: string, domain: string) => `${user}@${domain.replace(/\[\s*dot\s*\]|\(\s*dot\s*\)|\bdot\b/gi, ".").replace(/\s+/g, "")}`,
  );
  for (const email of spelled.match(EMAIL_RE) ?? []) found.add(email.toLowerCase());
  return Array.from(found);
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

/** Pull any `email` field out of JSON-LD (LocalBusiness, Organization, ContactPoint, Person). */
export function extractJsonLdEmails(html: string): string[] {
  const out = new Set<string>();
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const take = (v: unknown) => {
    if (typeof v !== "string") return;
    const e = v.replace(/^mailto:/i, "").trim().toLowerCase();
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) out.add(e);
  };
  for (const b of blocks) {
    const inner = b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const walk = (node: unknown, depth = 0) => {
        if (!node || depth > 6) return;
        if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
        if (typeof node !== "object") return;
        const o = node as Record<string, unknown>;
        if ("email" in o) Array.isArray(o.email) ? o.email.forEach(take) : take(o.email);
        for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, depth + 1);
      };
      walk(JSON.parse(inner));
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return [...out];
}

/** Match full address tokens before comparing domains; never truncate suffixes. */
export function ownScriptEmails(html: string, domains: string[]): string[] {
  const decoded = html.replace(/\\u0*40|\\x40/gi, "@").replace(/\\u0*2e|\\x2e/gi, ".");
  return (decoded.match(EMAIL_RE) ?? []).map((email) => email.toLowerCase())
    .filter((email) => domains.includes(cleanDomain(email.split("@")[1])) && !JUNK_EMAIL.test(email));
}

/** Paths that look like a contact/about/quote page, for crawling non-standard URLs. */
const CONTACT_LINK_RE =
  /contact|about|our[\s-]?team|meet[\s-]?the[\s-]?team|meet[\s-]?us|staff|reach[\s-]?us|get[\s-]?in[\s-]?touch|quote|estimate|appointment|book|schedule|connect|enquir|inquir/i;

/**
 * Contact-ish links the homepage/nav/footer points to, so a business whose
 * contact page is at a non-standard path (/pages/contact, /get-a-quote,
 * /contact-us-today) still gets read. Same-site only, images/files skipped.
 */
export function discoverContactLinks(html: string, baseDomain: string, already: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set(already);
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'<>]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].trim();
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    if (!CONTACT_LINK_RE.test(href) && !CONTACT_LINK_RE.test(htmlToText(m[2] || ""))) continue;
    let path = "";
    try {
      const u = new URL(href, `https://${baseDomain}`);
      if (cleanDomain(u.hostname) !== baseDomain) continue; // same-site only
      path = u.pathname + (u.search || "");
    } catch {
      continue;
    }
    if (!path || path === "/" || seen.has(path) || /\.(png|jpe?g|gif|webp|svg|pdf|zip|mp4|css|js)$/i.test(path))
      continue;
    seen.add(path);
    out.push(path);
    if (out.length >= 6) break;
  }
  return out;
}

/** Contact-ish URLs listed in sitemap.xml — the last resort for finding a contact page. */
export function sitemapContactPaths(xml: string, baseDomain: string, already: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set(already);
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    if (!CONTACT_LINK_RE.test(m[1])) continue;
    try {
      const u = new URL(m[1]);
      if (cleanDomain(u.hostname) !== baseDomain) continue;
      const path = u.pathname;
      if (path && path !== "/" && !seen.has(path) && !/\.(png|jpe?g|gif|webp|svg|pdf|zip|xml)$/i.test(path)) {
        seen.add(path);
        out.push(path);
      }
    } catch {
      /* skip */
    }
    if (out.length >= 3) break;
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
  companyName?: string;
  /** The business's town — never mistaken for its brand when judging other domains. */
  city?: string;
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
    socials: { linkedin: "", facebook: "", instagram: "", tiktok: "", youtube: "" },
    ig: null,
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
  const maxPages = Math.max(1, Math.min(input.maxPages ?? (input.tiered ? 12 : PAGES.length), 12));
  const crawlDeadline = Date.now() + 23_000;
  let remainingPages = maxPages - 1;

  // Homepage first (follows redirects → canonical domain), then the rest in parallel.
  const home = (await fetchPage(base, 8000)) ?? (await fetchPage(`http://${domain}`, 6000));
  if (!home) return { ...empty, error: "site unreachable" };
  const finalDomain = cleanDomain(home.finalUrl) || domain;
  const root = `https://${finalDomain}`;

  const grab = (paths: string[], ms: number) =>
    Promise.all(
      paths.slice(0, remainingPages).map(async (p) => {
        remainingPages--;
        const timeLeft = crawlDeadline - Date.now();
        if (timeLeft <= 0) return null;
        const r = await fetchPage(root + p, Math.min(ms, timeLeft));
        return r ? { path: p, html: r.html } : null;
      }),
    );
  const notNull = (x: { path: string; html: string } | null): x is { path: string; html: string } =>
    !!x;

  let extras: { path: string; html: string }[];
  if (input.tiered) {
    extras = (await grab(TIER1, 5000)).filter(notNull);
    const queued = new Set<string>(["/", ...TIER1, ...TIER2]);
    const everything = () => [home.html, ...extras.map((e) => e.html)].join("\n");
    const haveEmail = () => {
      const seen = everything();
      return [...hiddenEmails(seen), ...extractJsonLdEmails(seen), ...ownScriptEmails(seen, [finalDomain, domain])]
        .some((email) => emailPlausible(email, { domains: [finalDomain, domain], company: input.companyName, owner: input.ownerName, city: input.city, fromOwnSite: true }));
    };
    const havePerson = () => OWNER_HINT_RE.test(everything()) || /"@type"\s*:\s*"Person"/i.test(everything());
    if (!haveEmail() || !havePerson()) {
      // The deeper standard pages PLUS whatever contact-ish links the pages point to.
      const discovered = discoverContactLinks(everything(), finalDomain, queued);
      discovered.forEach((p) => queued.add(p));
      extras.push(...(await grab([...TIER2, ...discovered], 5000)).filter(notNull));
    }
    // Still nothing usable: consult the sitemap for a contact page we haven't tried.
    if (!haveEmail() && remainingPages > 0 && Date.now() < crawlDeadline) {
      remainingPages--;
      const sm = await fetchPage(`${root}/sitemap.xml`, Math.min(5000, crawlDeadline - Date.now()));
      const smPaths = sm ? sitemapContactPaths(sm.html, finalDomain, queued) : [];
      if (smPaths.length) extras.push(...(await grab(smPaths, 5000)).filter(notNull));
    }
  } else {
    extras = (await grab(PAGES.slice(1, maxPages), 7000)).filter(notNull);
  }
  const pages = [{ path: "/", html: home.html }, ...extras];

  const mxPromise = hasMx(finalDomain);

  const emailMap = new Map<string, { page: string }>();
  const phones = new Set<string>();
  const socials = { linkedin: "", facebook: "", instagram: "", tiktok: "", youtube: "" };
  // Pages with web-designer credits removed — what the Instagram finder reads.
  const ownPages: { path: string; html: string }[] = [];
  const names: { name: string; title: string; source: string }[] = [];
  const texts: string[] = [];

  for (const pg of pages) {
    // Explicit designer-credit links are not business contact details. Keep
    // other published off-domain addresses: businesses may use a separate domain.
    const html = pg.html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (anchor) => /\b(?:site designer|website (?:design|designed|built|developed)(?: by)?|web design by|designed by|developed by)\b/i.test(htmlToText(anchor)) ? " " : anchor);
    ownPages.push({ path: pg.path || "/", html });
    // mailto: and tel: links are the most reliable signals
    for (const m of html.matchAll(/mailto:([^"'?\s<>]+)/gi)) {
      // Malformed percent encoding in one link must not discard the whole site.
      try {
        const raw = decodeURIComponent(m[1]).toLowerCase();
        for (const email of hiddenEmails(raw)) emailMap.set(email, { page: pg.path });
      } catch { /* continue extracting other published addresses */ }
    }
    for (const email of hiddenEmails(html))
      emailMap.set(email, emailMap.get(email) ?? { page: pg.path });
    // Emails buried in script/JSON blobs (Wix, Squarespace) with the @ and .
    // escaped. Restricted to the site's OWN domain, so trackers on other
    // domains (sentry.io, analytics…) can never slip in from script content.
    for (const email of ownScriptEmails(html, [finalDomain, domain]))
      emailMap.set(email, emailMap.get(email) ?? { page: pg.path });
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
    const tk = html.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+/i);
    if (tk && !socials.tiktok) socials.tiktok = tk[0];
    const yt = html.match(/https?:\/\/(?:www\.)?youtube\.com\/(?:@[A-Za-z0-9_.-]+|c\/[A-Za-z0-9_.-]+|channel\/[A-Za-z0-9_-]+|user\/[A-Za-z0-9_.-]+)/i);
    if (yt && !socials.youtube) socials.youtube = yt[0];
    // structured data people + business email
    names.push(...extractJsonLdPeople(html));
    for (const email of extractJsonLdEmails(html))
      emailMap.set(email, emailMap.get(email) ?? { page: pg.path });
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
    .filter(([e]) => emailPlausible(e, { domains: [finalDomain, domain], company: input.companyName, owner: input.ownerName, city: input.city, fromOwnSite: true }))
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

  // Instagram is the priority: the business's OWN profile among everything the
  // site links to (ranked — not simply the first link, which is often a
  // supplier's, an embedded post or the web designer's).
  const ig = pickSiteInstagram(ownPages, { name: input.companyName, domain: finalDomain, city: input.city });
  if (ig) socials.instagram = ig.url;

  signals.socialCount = [socials.linkedin, socials.facebook, socials.instagram, socials.tiktok, socials.youtube].filter(
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
    ig,
    names: people,
    mx,
    pages: pages.map((p) => p.path || "/"),
  };
}
