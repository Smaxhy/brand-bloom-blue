/**
 * One place that turns "a business with a website" into "owner + email + signals".
 *
 * Used by the Data Scraper's /api/enrich and by saved searches, so both get the
 * same behaviour and share the same cache:
 *
 *   1. site_cache (Supabase) — a domain read in the last 30 days is served from
 *      cache in ~50 ms instead of being re-crawled.
 *   2. freeEnrich — tiered crawl: home + /contact + /about first; the deeper
 *      pages (/team, /about-us, …) only when no owner or no email surfaced.
 *   3. Claude Haiku — only when the pages did NOT already name an owner with an
 *      owner-ish title AND a published own-domain email. That skips the slowest
 *      step for roughly half of small-business sites.
 *   4. Serper (optional) — a single "owner site:linkedin.com/in" search when the
 *      site itself names nobody.
 */

import { anthropicProblem } from "./anthropic-error";
import { findOwnerLinkedin } from "./providers/websearch";
import { freeEnrich, emailPlausible, type SiteSignals } from "./providers/free-enrich";
import type { Db } from "./db";

type Env = Record<string, string | undefined>;
const secret = (e: Env, k: string) => e[k] || process.env?.[k];

const OWNERISH =
  /\b(owner|founder|co-founder|ceo|president|principal|proprietor|managing director|director|zaakvoerder|eigenaar|oprichter|bestuurder|g[ée]rant|fondateur|directeur|inhaber|geschäftsführer)\b/i;
const CACHE_DAYS = 30;
export const EMAIL_EXTRACTION_VERSION = 5;
const BUSINESS_WORDS =
  /\b(roofing|roofers?|plumbing|plumbers?|hvac|heating|cooling|electric(al)?|landscap\w*|lawn|tree|dental|dentistry|clinic|law|legal|realty|real estate|construction|contractors?|services?|solutions|group|company|co\.?|inc\.?|llc|ltd|bv|bvba|nv|gmbh|sarl|srl|studio|salon|spa|shop|store|center|centre|agency|partners|associates|brothers|sons|team|home|house|auto|motors?|cleaning|painting|design|media|marketing|consulting|insurance|bank|church|school|academy)\b/i;

/** "Mike Torres" yes; "Rich Roofing", "Summit Roofing Co", "Our Team" no. */
function looksLikePerson(name: string, company: string): boolean {
  const n = (name || "").trim();
  if (!n) return false;
  const parts = n.split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  if (BUSINESS_WORDS.test(n)) return false;
  if (/\d|@|&|\bthe\b|\bour\b|\byour\b/i.test(n)) return false;
  const c = (company || "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const overlap = parts.filter((w) => c.includes(w.toLowerCase().replace(/[^a-z]/g, ""))).length;
  if (c.length && overlap >= Math.min(2, parts.length)) return false;
  return true;
}

export interface SiteProfile {
  website: string;
  mx: boolean | null;
  signals: SiteSignals | null;
  linkedin: string;
  /** We already searched for the owner's LinkedIn (don't spend another credit). */
  linkedinTried?: boolean;
  /** Business social profiles pulled off the site — Instagram is the priority. Optional so older caches stay valid. */
  instagram?: string;
  /** false = found, but only "likely" theirs (worth a look before messaging). */
  instagramSure?: boolean;
  /** Why we think this profile is theirs, in plain words. */
  instagramWhy?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  phone: string;
  name: string;
  title: string;
  email: string;
  emailGuessed: boolean;
  emailPage: string;
  /** Allows incomplete older caches to recover newly supported published addresses. */
  emailExtractionVersion?: number;
  names: { name: string; title: string }[];
  /** AI marketing-need rating (0–100), reasons, pitch angle. Null when no ANTHROPIC_API_KEY. */
  ai: {
    need: number;
    reasons: string[];
    pitch: string;
    gap: string;
    siteQuality: string;
    teamSize?: string;
    revenueBand?: string;
    locations?: number;
    sizeConfidence?: string;
    title?: string;
  } | null;
  cached: boolean;
  ms: number;
}

export interface EnrichSiteOpts {
  website: string;
  company?: string;
  industry?: string;
  city?: string;
  rating?: number;
  reviews?: number;
  ownerName?: string;
  useClaude?: boolean;
  db?: Db | null;
  /** Called with a one-line reason when the AI call fails (out of credit, bad key…). */
  onWarn?: (w: string) => void;
  /** Owner's AI instructions (Settings → AI instructions) — shapes the pitch line. */
  instructions?: string;
  findLinkedin?: boolean;
}

function cleanDomain(u: string): string {
  return (u || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

/* ------------------------------------------------------------------ cache */

/** A cached address that the current rules would not accept (web designer, supplier, form service). */
function cachedEmailRejected(p: SiteProfile, domain: string, company?: string, city?: string): boolean {
  if (!p.email || p.emailGuessed) return false;
  try {
    return !emailPlausible(p.email, { domains: [domain, p.website].filter(Boolean), company, owner: p.name, city, fromOwnSite: true });
  } catch {
    return false;
  }
}

async function readCache(db: Db | null | undefined, domain: string, company?: string, city?: string): Promise<SiteProfile | null> {
  if (!db) return null;
  try {
    const since = new Date(Date.now() - CACHE_DAYS * 86400e3).toISOString();
    const row = await db.one<{ data: SiteProfile }>(
      "site_cache",
      `domain=eq.${encodeURIComponent(domain)}&fetched_at=gte.${encodeURIComponent(since)}&select=data`,
    );
    // Older profiles discarded published emails solely because the website had
    // no MX. Re-crawl those incomplete profiles rather than retaining the loss.
    if (row?.data && !row.data.email && row.data.mx === false) return null;
    if (row?.data && row.data.emailExtractionVersion !== EMAIL_EXTRACTION_VERSION) return null;
    // Re-read sites whose cached email came from someone else's domain.
    if (row?.data && cachedEmailRejected(row.data, domain, company, city)) return null;
    return row?.data ? { ...row.data, cached: true } : null;
  } catch {
    return null; // table missing or RLS — just crawl
  }
}

async function writeCache(
  db: Db | null | undefined,
  domain: string,
  p: SiteProfile,
): Promise<void> {
  if (!db) return;
  try {
    const { cached: _c, ...data } = p;
    await db.upsert("site_cache", { domain, data, fetched_at: new Date().toISOString() }, "domain");
  } catch {
    /* best effort */
  }
}

/* ----------------------------------------------------------------- claude */

export interface AiAssessment {
  ownerName?: string;
  ownerTitle?: string;
  email?: string;
  /** 0–100: how much this business needs marketing help (reason to buy). */
  need: number;
  reasons: string[];
  /** One sentence: the angle to open the email with. */
  pitch: string;
  /** The single most visible gap, in 2–6 words, for {{gap}} in templates. */
  gap: string;
  siteQuality: "none" | "poor" | "dated" | "ok" | "strong";
  /** Estimated headcount band from the website (team page, locations, careers, fleet…). */
  teamSize: "1-10" | "11-50" | "51-200" | "200+" | "unknown";
  /** Estimated annual revenue band (USD), from size, industry and footprint. */
  revenueBand: "<250k" | "250k-1M" | "1M-5M" | "5M-25M" | "25M+" | "unknown";
  /** How many physical locations/offices the site mentions (0 = unknown). */
  locations: number;
  sizeConfidence: "low" | "medium" | "high";
}

function signalsSummary(
  sig: SiteSignals | null | undefined,
  rating?: number,
  reviews?: number,
): string {
  if (!sig) return "No website could be read.";
  const bits = [
    `https: ${sig.https ? "yes" : "no"}`,
    `pages read: ${sig.pageCount}`,
    `Meta pixel: ${sig.metaPixel ? "yes" : "no"}`,
    `Google Ads tag: ${sig.googleAds ? "yes" : "no"}`,
    `Tag Manager: ${sig.gtm ? "yes" : "no"}`,
    `online booking: ${sig.booking || "none"}`,
    `chat widget: ${sig.chat ? "yes" : "no"}`,
    `site builder: ${sig.builder || "unknown"}`,
    `copyright year: ${sig.copyrightYear ?? "unknown"}`,
    `reviews widget: ${sig.reviewsWidget ? "yes" : "no"}`,
    `social links: ${sig.socialCount}`,
  ];
  if (typeof rating === "number") bits.push(`Google rating: ${rating} (${reviews ?? 0} reviews)`);
  return bits.join(", ");
}

/**
 * One Haiku call per site: who runs it, the best email, and how badly they
 * need marketing help (with the angle to pitch). ~$0.002 per site, cached 30 days.
 */
async function claudeAssess(
  env: Env,
  input: {
    company: string;
    industry?: string;
    city?: string;
    website: string;
    text: string;
    signals: SiteSignals | null;
    rating?: number;
    reviews?: number;
    hint?: string;
    onWarn?: (w: string) => void;
    instructions?: string;
  },
): Promise<AiAssessment | null> {
  const key = secret(env, "ANTHROPIC_API_KEY");
  if (!key) {
    input.onWarn?.("Claude: ANTHROPIC_API_KEY not set — no AI ratings");
    return null;
  }
  const system = `You assess small local businesses for a marketing agency that sells websites, Google/Meta ads, review generation and lead automation. You get the text of the business's website plus technical signals read from it.
${
  input.instructions?.trim()
    ? `
THE AGENCY'S OWN INSTRUCTIONS (what they sell, how they talk — the "pitch" must fit these):
"""
${input.instructions.trim().slice(0, 2500)}
"""
`
    : ""
}
Return ONLY a JSON object:
{
  "ownerName": "",        // the single most senior decision-maker named on the site (Owner/Founder/CEO > Director > Manager), "" if none
  "ownerTitle": "",
  "email": "",            // best email on the company's own domain that appears in the text, "" if none
  "need": 0,              // 0-100: how much marketing help this business visibly needs. 85+ = no real web presence / dated site / no way to book / no ads / weak reviews. 20- = polished site, booking, ads running, strong reviews.
  "reasons": ["", "", ""],// 2-4 short concrete observations that justify the number, e.g. "No online booking", "Copyright 2018", "Only 12 reviews", "Wix template"
  "pitch": "",            // ONE sentence, plain, specific to THIS business, that could open a cold email. Name a concrete gap and the outcome. No hype, no exclamation marks. Max 25 words.
  "gap": "",              // the single biggest gap in 2-6 words, e.g. "no online booking", "no Google Ads"
  "siteQuality": "ok",    // one of: none | poor | dated | ok | strong
  "teamSize": "unknown",  // estimated headcount: "1-10" | "11-50" | "51-200" | "200+" | "unknown". Evidence: team/leadership page headcount, number of offices or locations, fleet size, careers page, "X employees", years in business, breadth of services.
  "revenueBand": "unknown", // estimated annual revenue in USD: "<250k" | "250k-1M" | "1M-5M" | "5M-25M" | "25M+" | "unknown". Derive from teamSize, industry norms and footprint; a 30-person HVAC company is 1M-5M, a 3-person studio is <250k.
  "locations": 0,         // number of physical locations/offices mentioned, 0 if unknown
  "sizeConfidence": "low" // low | medium | high — how much evidence supported teamSize
}
Never invent names or emails. Judge need from evidence in the text and signals only. Size and revenue are ESTIMATES — mark sizeConfidence honestly.`;
  const user = `Company: ${input.company}
Industry: ${input.industry || "unknown"}
City: ${input.city || "unknown"}
Website: ${input.website}
Signals: ${signalsSummary(input.signals, input.rating, input.reviews)}
${input.hint ? `People found on the site: ${input.hint}\n` : ""}
Website text:
"""
${(input.text || "").slice(0, 9000)}
"""`;
  const body = (model: string) =>
    JSON.stringify({ model, max_tokens: 400, system, messages: [{ role: "user", content: user }] });
  const call = (model: string) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: body(model),
      signal: AbortSignal.timeout(15000),
    });
  try {
    let res = await call("claude-haiku-4-5");
    if (!res.ok && (res.status === 404 || res.status === 400))
      res = await call("claude-3-5-haiku-latest");
    if (!res.ok) {
      input.onWarn?.(await anthropicProblem(res));
      return null;
    }
    const d = (await res.json()) as { content?: { text?: string }[] };
    const m = (d.content?.[0]?.text || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]) as Partial<AiAssessment>;
    const q = ["none", "poor", "dated", "ok", "strong"].includes(String(j.siteQuality))
      ? (j.siteQuality as AiAssessment["siteQuality"])
      : "ok";
    const ts = ["1-10", "11-50", "51-200", "200+"].includes(String(j.teamSize))
      ? (j.teamSize as AiAssessment["teamSize"])
      : "unknown";
    const rb = ["<250k", "250k-1M", "1M-5M", "5M-25M", "25M+"].includes(String(j.revenueBand))
      ? (j.revenueBand as AiAssessment["revenueBand"])
      : "unknown";
    const sc = ["low", "medium", "high"].includes(String(j.sizeConfidence))
      ? (j.sizeConfidence as AiAssessment["sizeConfidence"])
      : "low";
    return {
      ownerName: String(j.ownerName || "").trim(),
      ownerTitle: String(j.ownerTitle || "").trim(),
      email: String(j.email || "")
        .trim()
        .toLowerCase(),
      need: Math.max(0, Math.min(100, Math.round(Number(j.need) || 0))),
      reasons: (Array.isArray(j.reasons) ? j.reasons : [])
        .map((r) => String(r).trim())
        .filter(Boolean)
        .slice(0, 4),
      pitch: String(j.pitch || "")
        .trim()
        .slice(0, 240),
      gap: String(j.gap || "")
        .trim()
        .slice(0, 60),
      siteQuality: q,
      teamSize: ts,
      revenueBand: rb,
      locations: Math.max(0, Math.min(999, Math.round(Number(j.locations) || 0))),
      sizeConfidence: sc,
    };
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- serper */

async function serperOwner(
  env: Env,
  company: string,
  city: string,
  domain: string,
  name?: string,
): Promise<{ name: string; title: string; linkedin: string } | null> {
  const key = secret(env, "SERPER_API_KEY") || secret(env, "SERPAPI_API_KEY");
  if (!key || !company) return null;
  return findOwnerLinkedin(key, { company, city, domain, name });
}

/* ------------------------------------------------------------------- main */

export async function enrichSite(env: Env, o: EnrichSiteOpts): Promise<SiteProfile | null> {
  const t0 = Date.now();
  const domain = cleanDomain(o.website);
  if (
    !domain ||
    /(^|\.)(google\.[a-z.]+|g\.page|business\.site|facebook\.com|instagram\.com|linkedin\.com|yelp\.com)$/i.test(
      domain,
    )
  )
    return null;

  const hit = await readCache(o.db, domain, o.company, o.city);
  if (hit) {
    // Cached before the LinkedIn lookup existed (or it found nothing then):
    // one targeted search now, written back so it's not repeated.
    if (!hit.linkedin && hit.name && !hit.linkedinTried && o.findLinkedin !== false) {
      const so = await serperOwner(env, o.company || "", o.city || "", domain, hit.name);
      const next: SiteProfile = { ...hit, linkedin: so?.linkedin || "", linkedinTried: true };
      if (!hit.title && so?.title) next.title = so.title;
      await writeCache(o.db, domain, { ...next, cached: false });
      return next;
    }
    return hit;
  }

  const fe = await freeEnrich({ website: domain, ownerName: o.ownerName, companyName: o.company, city: o.city, tiered: true });
  if (!fe.ok) return null;

  const siteEmails = fe.emails.filter((e) => e.source === "site");
  const ownDomainEmail = siteEmails.find((e) => e.email.endsWith("@" + fe.website));
  const people = fe.names.filter((n) => looksLikePerson(n.name, o.company || ""));
  const ownerFromSite = people.find((n) => OWNERISH.test(n.title));

  let name = o.ownerName || ownerFromSite?.name || "";
  let title = ownerFromSite?.title || "";
  let linkedin = fe.socials.linkedin || "";
  let pick = ownDomainEmail || siteEmails[0];

  // One Claude call: owner + email + marketing-need rating + pitch. Skipped only
  // when Claude is off or there is no text at all.
  let ai: SiteProfile["ai"] = null;
  if (o.useClaude !== false && fe.text) {
    const hint = people.length
      ? people.map((n) => `${n.name}${n.title ? ` (${n.title})` : ""}`).join("; ")
      : undefined;
    const ex = await claudeAssess(env, {
      onWarn: o.onWarn,
      instructions: o.instructions,
      company: o.company || "",
      industry: o.industry,
      city: o.city,
      website: fe.website,
      text: fe.text,
      signals: fe.signals,
      rating: o.rating,
      reviews: o.reviews,
      hint,
    });
    if (ex) {
      if (ex.ownerName && !o.ownerName) name = ex.ownerName;
      if (ex.ownerTitle) title = ex.ownerTitle;
      if (ex.email) {
        const known = siteEmails.find((e) => e.email === ex.email);
        if (known) {
          pick = known;
        } else if (
          // Claude read the page and named an address our patterns missed. Accept
          // it ONLY when it literally appears in the text we sent (no invented
          // addresses) and it belongs to this business.
          !pick &&
          !!fe.text.toLowerCase().match(/[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)?.some((email) => email === ex.email) &&
          emailPlausible(ex.email, {
            domains: [fe.website, domain].filter(Boolean),
            company: o.company,
            owner: name,
            city: o.city,
            fromOwnSite: true,
          })
        ) {
          pick = { email: ex.email, source: "site", page: "", mx: fe.mx };
        }
      }
      ai = {
        need: ex.need,
        reasons: ex.reasons,
        pitch: ex.pitch,
        gap: ex.gap,
        siteQuality: ex.siteQuality,
        teamSize: ex.teamSize,
        revenueBand: ex.revenueBand,
        locations: ex.locations,
        sizeConfidence: ex.sizeConfidence,
        title: ex.ownerTitle || title,
      };
    }
  }
  if (name && !looksLikePerson(name, o.company || "") && !o.ownerName) name = "";
  if (!name) name = people[0]?.name || "";
  if (!title && people[0]?.name === name) title = people[0]?.title || "";

  // LinkedIn of the owner: one cheap search. With a name we look that person
  // up directly; with no name we search for the company's owner/founder.
  let linkedinTried = false;
  if ((!linkedin || !name) && o.findLinkedin !== false) {
    linkedinTried = true;
    const so = await serperOwner(env, o.company || "", o.city || "", fe.website, name || undefined);
    if (so) {
      if (!name) {
        name = so.name;
        title = so.title;
      } else if (!title) title = so.title;
      if (!linkedin) linkedin = so.linkedin;
    }
  }

  let email = "";
  let emailGuessed = false;
  let emailPage = "";
  // Published evidence is independent of the website domain's mail server
  // (the business may use Gmail or a separate domain). Only gate guesses.
  if (pick) {
    email = pick.email;
    emailPage = pick.page;
  } else {
    const g = fe.emails.find((e) => e.source === "guess");
    if (g && fe.mx) {
      email = g.email;
      emailGuessed = true;
    }
  }

  const profile: SiteProfile = {
    website: fe.website,
    mx: fe.mx,
    signals: fe.signals,
    linkedin,
    linkedinTried,
    instagram: fe.socials.instagram || "",
    instagramSure: fe.ig ? fe.ig.confidence === "sure" : undefined,
    instagramWhy: fe.ig?.why,
    facebook: fe.socials.facebook || "",
    tiktok: fe.socials.tiktok || "",
    youtube: fe.socials.youtube || "",
    phone: fe.phones[0] || "",
    name,
    title,
    email,
    emailGuessed,
    emailPage,
    emailExtractionVersion: EMAIL_EXTRACTION_VERSION,
    names: people.map((n) => ({ name: n.name, title: n.title })),
    ai,
    cached: false,
    ms: Date.now() - t0,
  };
  void writeCache(o.db, domain, profile);
  return profile;
}

/** Run enrichSite over many businesses with bounded concurrency. */
export async function enrichMany<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          await fn(item);
        } catch {
          /* one bad site never stops the batch */
        }
      }
    },
  );
  await Promise.all(workers);
}
