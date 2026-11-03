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

import { freeEnrich, type SiteSignals } from "./providers/free-enrich";
import type { Db } from "./db";

type Env = Record<string, string | undefined>;
const secret = (e: Env, k: string) => e[k] || process.env?.[k];

const OWNERISH =
  /\b(owner|founder|co-founder|ceo|president|principal|proprietor|managing director|director|zaakvoerder|eigenaar|oprichter|bestuurder|g[ée]rant|fondateur|directeur|inhaber|geschäftsführer)\b/i;
const CACHE_DAYS = 30;
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
  phone: string;
  name: string;
  title: string;
  email: string;
  emailGuessed: boolean;
  emailPage: string;
  names: { name: string; title: string }[];
  cached: boolean;
  ms: number;
}

export interface EnrichSiteOpts {
  website: string;
  company?: string;
  city?: string;
  ownerName?: string;
  useClaude?: boolean;
  db?: Db | null;
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

async function readCache(db: Db | null | undefined, domain: string): Promise<SiteProfile | null> {
  if (!db) return null;
  try {
    const since = new Date(Date.now() - CACHE_DAYS * 86400e3).toISOString();
    const row = await db.one<{ data: SiteProfile }>(
      "site_cache",
      `domain=eq.${encodeURIComponent(domain)}&fetched_at=gte.${encodeURIComponent(since)}&select=data`,
    );
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

async function claudeOwner(
  env: Env,
  company: string,
  website: string,
  text: string,
  hint?: string,
): Promise<{ ownerName?: string; ownerTitle?: string; email?: string } | null> {
  const key = secret(env, "ANTHROPIC_API_KEY");
  if (!key || !text) return null;
  const body = JSON.stringify({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    system:
      'From the website text, extract the single most senior decision-maker (Owner/Founder/CEO > Director > Manager) and the best email on the company\'s own domain. Reply with ONLY JSON: {"ownerName":"","ownerTitle":"","email":""}. Never invent; use "" when unknown.',
    messages: [
      {
        role: "user",
        content: `Company: ${company}\nWebsite: ${website}\n${hint ? `Hint: ${hint}\n` : ""}\n"""\n${text.slice(0, 9000)}\n"""`,
      },
    ],
  });
  try {
    const call = () =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(12000),
      });
    let res = await call();
    if (!res.ok && (res.status === 404 || res.status === 400)) {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: body.replace('"claude-haiku-4-5"', '"claude-3-5-haiku-latest"'),
        signal: AbortSignal.timeout(12000),
      });
    }
    if (!res.ok) return null;
    const d = (await res.json()) as { content?: { text?: string }[] };
    const m = (d.content?.[0]?.text || "").match(/\{[\s\S]*\}/);
    return m
      ? (JSON.parse(m[0]) as { ownerName?: string; ownerTitle?: string; email?: string })
      : null;
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
): Promise<{ name: string; title: string; linkedin: string } | null> {
  const key = secret(env, "SERPER_API_KEY");
  if (!key || !company) return null;
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `"${company}" ${city} (owner OR founder OR CEO) site:linkedin.com/in`,
        num: 5,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      organic?: { title?: string; link?: string; snippet?: string }[];
    };
    const brand = company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")[0];
    for (const r of d.organic ?? []) {
      const t = (r.title || "").replace(/\s*\|\s*LinkedIn.*$/i, "");
      // "Jane Doe - Owner - Summit Roofing" or "Jane Doe – Owner at Summit Roofing"
      const m = t.match(/^([^-–|]+?)\s*[-–]\s*([^-–|]+?)(?:\s*[-–]\s*(.+))?$/);
      if (!m) continue;
      const name = m[1].trim();
      const title = m[2].trim();
      const rest = `${m[3] || ""} ${r.snippet || ""}`.toLowerCase();
      if (!OWNERISH.test(title)) continue;
      if (
        brand &&
        !rest.includes(brand) &&
        !t.toLowerCase().includes(brand) &&
        !(r.snippet || "").toLowerCase().includes(domain)
      )
        continue;
      if (name.split(" ").length < 2 || name.length > 50) continue;
      return { name, title: title.slice(0, 60), linkedin: r.link || "" };
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- main */

export async function enrichSite(env: Env, o: EnrichSiteOpts): Promise<SiteProfile | null> {
  const t0 = Date.now();
  const domain = cleanDomain(o.website);
  if (!domain) return null;

  const hit = await readCache(o.db, domain);
  if (hit) return hit;

  const fe = await freeEnrich({ website: domain, ownerName: o.ownerName, tiered: true });
  if (!fe.ok) return null;

  const siteEmails = fe.emails.filter((e) => e.source === "site");
  const ownDomainEmail = siteEmails.find((e) => e.email.endsWith("@" + fe.website));
  const people = fe.names.filter((n) => looksLikePerson(n.name, o.company || ""));
  const ownerFromSite = people.find((n) => OWNERISH.test(n.title));

  let name = o.ownerName || ownerFromSite?.name || "";
  let title = ownerFromSite?.title || "";
  let linkedin = fe.socials.linkedin || "";
  let pick = ownDomainEmail || siteEmails[0];

  // Claude only when the page itself didn't settle both questions.
  const settled = !!(name && ownDomainEmail);
  if (!settled && o.useClaude !== false && fe.text) {
    const hint = people.length
      ? `People found on the site: ${people.map((n) => `${n.name}${n.title ? ` (${n.title})` : ""}`).join("; ")}`
      : undefined;
    const ex = await claudeOwner(env, o.company || "", fe.website, fe.text, hint);
    if (ex?.ownerName && !o.ownerName) name = ex.ownerName;
    if (ex?.ownerTitle) title = ex.ownerTitle;
    const ce = (ex?.email || "").toLowerCase();
    const cePick = ce && siteEmails.find((e) => e.email === ce);
    if (cePick) pick = cePick;
  }
  if (name && !looksLikePerson(name, o.company || "") && !o.ownerName) name = "";
  if (!name) name = people[0]?.name || "";
  if (!title && people[0]?.name === name) title = people[0]?.title || "";

  // Still nobody: one cheap LinkedIn lookup.
  if (!name) {
    const so = await serperOwner(env, o.company || "", o.city || "", fe.website);
    if (so) {
      name = so.name;
      title = so.title;
      if (!linkedin) linkedin = so.linkedin;
    }
  }

  let email = "";
  let emailGuessed = false;
  let emailPage = "";
  if (pick && fe.mx !== false) {
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
    phone: fe.phones[0] || "",
    name,
    title,
    email,
    emailGuessed,
    emailPage,
    names: people.map((n) => ({ name: n.name, title: n.title })),
    cached: false,
    ms: Date.now() - t0,
  };
  await writeCache(o.db, domain, profile);
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
