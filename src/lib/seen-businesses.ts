/**
 * "Only new": a scan hides businesses that an EARLIER scan already returned (or
 * that are already leads), and companies on the do-not-contact list — for every
 * source (Google, OpenStreetMap, the own Maps scraper, Apify). Then it remembers
 * what it returned so the next scan skips those.
 */

import { Db } from "./db";
import { businessKey, cleanDomain, isCompanyDomain, legacyBusinessKey } from "./business-key";
import { withTimeout } from "./send-errors";

type Biz = { company: string; website?: string; phone?: string; city?: string; industry?: string; id?: string };

const quoted = (k: string) => `"${k.replace(/["\\]/g, "")}"`;

export async function hideSeenBusinesses<T extends Biz>(
  db: Db,
  list: T[],
  opts: {
    hideSeen: boolean;
    /** When this scan started: what this same scan found earlier (another source or keyword) is not "seen before". */
    since?: string | null;
  },
): Promise<{ kept: T[]; notes: string[] }> {
  const notes: string[] = [];
  let kept = list;
  if (opts.hideSeen && kept.length) {
    try {
      const keys = [...new Set(kept.flatMap((b) => [businessKey(b), legacyBusinessKey(b)]).filter(Boolean))];
      const since = opts.since ? Math.min(Date.parse(opts.since), Date.now()) : NaN;
      const seen = new Set<string>();
      for (let i = 0; i < keys.length; i += 150) {
        const rows = await db.select<{ key: string; first_seen_at: string | null }>(
          "seen_businesses",
          `key=in.(${keys.slice(i, i + 150).map(quoted).join(",")})&select=key,first_seen_at`,
        );
        for (const r of rows) {
          if (Number.isFinite(since) && r.first_seen_at && Date.parse(r.first_seen_at) >= since) continue;
          seen.add(r.key);
        }
      }
      const domains = [...new Set(kept.map((b) => cleanDomain(b.website)).filter(isCompanyDomain))];
      for (let i = 0; i < domains.length; i += 150) {
        const leads = await db.select<{ domain: string }>(
          "leads",
          `domain=in.(${domains.slice(i, i + 150).map(quoted).join(",")})&select=domain`,
        );
        leads.forEach((r) => r.domain && seen.add(r.domain));
      }
      const before = kept.length;
      kept = kept.filter((b) => !seen.has(businessKey(b)) && !seen.has(legacyBusinessKey(b)));
      if (before - kept.length) notes.push(`${before - kept.length} seen before (hidden)`);
    } catch {
      /* table not migrated yet — show everything */
    }
  }
  // Automatic blacklist: a company whose address hard-bounced, opted out or
  // complained never comes back (any source, regardless of "Only new"). Only
  // real company domains count — never gmail.com or facebook.com.
  try {
    const domains = [...new Set(kept.map((b) => cleanDomain(b.website)).filter(isCompanyDomain))];
    const bad = new Set<string>();
    for (let i = 0; i < domains.length; i += 150) {
      const rows = await db.select<{ domain: string }>(
        "suppressions",
        `domain=in.(${domains.slice(i, i + 150).map(quoted).join(",")})&select=domain`,
      );
      rows.forEach((r) => r.domain && bad.add(r.domain));
    }
    if (bad.size) {
      const before = kept.length;
      kept = kept.filter((b) => !bad.has(cleanDomain(b.website)));
      if (before - kept.length) notes.push(`${before - kept.length} blacklisted (bounced / opted out) — hidden`);
    }
  } catch {
    /* no suppressions table yet */
  }
  return { kept, notes };
}

/**
 * Remember what a scan returned. Waited for (briefly): on a Worker, a write that
 * is still running when the answer goes out can be dropped — which is how scans
 * kept bringing back the same businesses.
 */
export async function rememberBusinesses(db: Db, list: Biz[]): Promise<void> {
  const now = new Date().toISOString();
  const rows = new Map<string, Record<string, unknown>>();
  for (const b of list) {
    const key = businessKey(b);
    if (!key || rows.has(key)) continue; // one row per key per write
    const domain = cleanDomain(b.website);
    rows.set(key, {
      key,
      company: b.company || "",
      domain: isCompanyDomain(domain) ? domain : null,
      city: b.city || "",
      industry: b.industry || "",
      last_seen_at: now,
    });
  }
  const all = [...rows.values()];
  for (let i = 0; i < all.length; i += 500)
    await withTimeout(db.upsert("seen_businesses", all.slice(i, i + 500), "key"), 8_000, "remembering businesses").catch(
      () => undefined,
    );
}
