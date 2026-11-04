/**
 * Public "free website check" — the lead magnet on the marketing site.
 *
 * POST /api/public/check { url, email?, name?, hp? }
 *   → runs the same enrichment + AI assessment the scanner uses, returns the
 *     findings (never the owner's personal details), and — when an email is
 *     given — files the visitor as an inbound lead.
 *
 * GET /api/public/config → { bookingUrl } for the CTA buttons.
 *
 * No login. Abuse control: per-IP and global rate limits (DB-backed), a
 * honeypot field, and the 30-day site cache so repeat checks cost nothing.
 */

import { Db } from "./db";
import { enrichSite } from "./enrich-site";
import { scoreLead } from "./providers/free-enrich";

type Env = Record<string, string | undefined>;
const secret = (e: Env, k: string) => e[k] || process.env?.[k];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function cleanDomain(u: string): string {
  return (u || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

async function limited(
  db: Db | null,
  key: string,
  max: number,
  windowSec: number,
): Promise<boolean> {
  if (!db) return false;
  try {
    const ok = await db.rpc<boolean>("check_rate_limit", {
      _key: key,
      _max: max,
      _window_seconds: windowSec,
    });
    return ok === false;
  } catch {
    return false;
  }
}

export interface PublicCheckResult {
  ok: true;
  website: string;
  score: number; // 0–100 "needs help" (higher = more to gain)
  grade: "A" | "B" | "C" | "D" | "F"; // of the current site, for the visitor
  siteQuality: string;
  findings: string[];
  firstFix: string;
  summary: string;
  signals: {
    https: boolean;
    ads: boolean;
    pixel: boolean;
    booking: boolean;
    chat: boolean;
    reviewsWidget: boolean;
    builder: string;
    copyrightYear: number | null;
    socialCount: number;
  };
  cached: boolean;
  bookingUrl: string;
}

export function publicConfig(e: Env): Response {
  return json({ bookingUrl: secret(e, "BOOKING_URL") || "" });
}

export async function publicCheck(request: Request, e: Env): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    email?: string;
    name?: string;
    hp?: string;
  };
  if (body.hp) return json({ ok: false, error: "Try again." }, 400); // honeypot
  const domain = cleanDomain(body.url || "");
  if (!domain || !domain.includes(".") || domain.length > 100)
    return json({ ok: false, error: "Enter a website address like yourbusiness.com" }, 400);

  const db = Db.available(e) ? new Db(e) : null;
  const ip =
    request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  if (await limited(db, `pubcheck:ip:${ip}`, 6, 600))
    return json({ ok: false, error: "That's a few checks in a row — give it ten minutes." }, 429);
  if (await limited(db, "pubcheck:all", 300, 3600))
    return json({ ok: false, error: "We're busy right now, try again in a bit." }, 429);

  const prof = await enrichSite(e, {
    website: domain,
    company: domain.split(".")[0],
    useClaude: true,
    db,
  });
  if (!prof)
    return json(
      {
        ok: false,
        error:
          "We couldn't reach that site. Check the address, or it may be blocking automated visits.",
      },
      422,
    );

  const sig = prof.signals;
  const need = prof.ai?.need ?? heuristicNeed(sig);
  const findings = prof.ai?.reasons?.length ? prof.ai.reasons : heuristicFindings(sig);
  const grade: PublicCheckResult["grade"] =
    need >= 80 ? "F" : need >= 65 ? "D" : need >= 45 ? "C" : need >= 25 ? "B" : "A";
  const firstFix = prof.ai?.gap || findings[0] || "";
  const summary =
    prof.ai?.pitch ||
    (need >= 65
      ? "There are clear, fixable gaps between this site and the jobs it could be bringing in."
      : need >= 40
        ? "A solid base with a few gaps that are costing enquiries."
        : "This site is in good shape — the gains now are in ads and follow-up, not the site itself.");

  // File the visitor as an inbound lead when they left an email.
  const email = (body.email || "").trim().toLowerCase();
  if (db && email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    try {
      const sc = scoreLead({
        website: prof.website,
        name: body.name || "",
        email,
        emailGuessed: false,
        mx: prof.mx,
        phone: prof.phone,
        signals: sig,
        aiNeed: need,
      });
      await db.upsert(
        "leads",
        {
          company: body.name ? `${domain}` : domain,
          domain: prof.website,
          website: prof.website,
          contact_name: body.name || "",
          contact_title: "",
          email,
          email_source: "Website check",
          email_guessed: false,
          email_verified: "unknown",
          phone: prof.phone || "",
          city: "",
          region: /\.(be|nl|de|fr|eu|uk|es|it)$/.test(domain) ? "EU" : "US",
          industry: "",
          source: "Website check (inbound)",
          status: "inbound",
          score: sc.score,
          score_reasons: sc.reasons,
          signals: { ...(sig ?? {}), ai: prof.ai ?? undefined, inbound: true },
        },
        "email",
      );
    } catch {
      /* never fail the visitor's result over a DB hiccup */
    }
  }

  const out: PublicCheckResult = {
    ok: true,
    website: prof.website,
    score: need,
    grade,
    siteQuality: prof.ai?.siteQuality || "ok",
    findings: findings.slice(0, 5),
    firstFix,
    summary,
    signals: {
      https: !!sig?.https,
      ads: !!sig?.googleAds,
      pixel: !!sig?.metaPixel,
      booking: !!sig?.booking,
      chat: !!sig?.chat,
      reviewsWidget: !!sig?.reviewsWidget,
      builder: sig?.builder || "",
      copyrightYear: sig?.copyrightYear ?? null,
      socialCount: sig?.socialCount ?? 0,
    },
    cached: prof.cached,
    bookingUrl: secret(e, "BOOKING_URL") || "",
  };
  return json(out);
}

type Sig =
  ReturnType<typeof enrichSite> extends Promise<infer P>
    ? P extends { signals: infer S }
      ? S
      : never
    : never;

function heuristicNeed(sig: Sig | null): number {
  if (!sig) return 90;
  let n = 20;
  if (!sig.metaPixel && !sig.googleAds) n += 20;
  if (!sig.booking) n += 15;
  if (sig.copyrightYear && sig.copyrightYear <= new Date().getFullYear() - 3) n += 15;
  if (sig.builder && /wix|godaddy|weebly/i.test(sig.builder)) n += 10;
  if (!sig.https) n += 10;
  if (!sig.reviewsWidget && !sig.chat) n += 5;
  if (sig.socialCount === 0) n += 5;
  return Math.min(100, n);
}

function heuristicFindings(sig: Sig | null): string[] {
  if (!sig) return ["The site could not be read — visitors may be having the same problem."];
  const f: string[] = [];
  if (!sig.metaPixel && !sig.googleAds) f.push("No ad tracking — no Meta pixel or Google Ads tag");
  if (!sig.booking) f.push("No way to book or request a quote online");
  if (sig.copyrightYear && sig.copyrightYear <= new Date().getFullYear() - 3)
    f.push(`Footer still says ${sig.copyrightYear}`);
  if (sig.builder && /wix|godaddy|weebly/i.test(sig.builder))
    f.push(`Built on a ${sig.builder} template`);
  if (!sig.https) f.push("Not served over HTTPS");
  if (!sig.reviewsWidget) f.push("Reviews aren't shown on the site");
  if (!sig.chat) f.push("No chat or instant contact option");
  return f;
}
