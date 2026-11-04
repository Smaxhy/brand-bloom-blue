/**
 * Universal lead filters that need the enrichment result (not just the Maps row):
 * decision-maker seniority, estimated team size, estimated revenue band.
 * Pure functions — used by the scraper UI (client) and saved searches (server).
 *
 * Rule: a row is only dropped when we have evidence that contradicts the filter.
 * No title / no estimate = kept (we can't judge it), so filters narrow, never starve.
 */

export const SENIORITY_PATTERNS: Record<string, RegExp> = {
  owner: /\b(owner|proprietor|eigenaar|zaakvoerder|inhaber|propri[ée]taire|titular)\b/i,
  founder: /\b(founder|co-?founder|oprichter|fondateur|gründer)\b/i,
  c_suite:
    /\b(ceo|cfo|cmo|coo|cto|chief|president|managing director|algemeen directeur|geschäftsführer|directeur g[ée]n[ée]ral|bestuurder)\b/i,
  partner: /\b(partner|vennoot|associ[ée])\b/i,
  vp: /\b(vp|vice president|vice-president)\b/i,
  head: /\b(head of|hoofd)\b/i,
  director: /\b(director|directeur|direktor)\b/i,
  manager: /\b(manager|gerant|g[ée]rant|verantwoordelijke|leiter)\b/i,
};

export function seniorityOf(title: string): string[] {
  const t = (title || "").trim();
  if (!t) return [];
  return Object.entries(SENIORITY_PATTERNS)
    .filter(([, re]) => re.test(t))
    .map(([k]) => k);
}

export interface LeadFilterInput {
  title?: string | null;
  teamSize?: string | null; // "1-10" | "11-50" | "51-200" | "200+" | "unknown"
  revenueBand?: string | null; // "<250k" | "250k-1M" | "1M-5M" | "5M-25M" | "25M+" | "unknown"
}

export interface LeadFilterSpec {
  seniorities?: string[];
  teamSizes?: string[];
  revenueBands?: string[];
}

/** Returns null when the row passes, else a short reason it was hidden. */
export function leadFilterReason(x: LeadFilterInput, f: LeadFilterSpec): string | null {
  if (f.seniorities?.length && x.title) {
    const s = seniorityOf(x.title);
    if (s.length && !s.some((k) => f.seniorities!.includes(k)))
      return `title "${x.title}" outside selected seniority`;
  }
  if (
    f.teamSizes?.length &&
    x.teamSize &&
    x.teamSize !== "unknown" &&
    !f.teamSizes.includes(x.teamSize)
  )
    return `est. team ${x.teamSize}`;
  if (
    f.revenueBands?.length &&
    x.revenueBand &&
    x.revenueBand !== "unknown" &&
    !f.revenueBands.includes(x.revenueBand)
  )
    return `est. revenue ${x.revenueBand}`;
  return null;
}

/** Map Apollo-style employee ranges ("1,10","11,20",…) onto the AI size bands. */
export function employeeRangesToBands(ranges: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const r of ranges ?? []) {
    const [lo, hi] = r.split(",").map(Number);
    if (!Number.isFinite(lo)) continue;
    if (lo <= 10) out.add("1-10");
    if ((lo <= 50 && (hi ?? lo) >= 11) || (lo >= 11 && lo <= 50)) out.add("11-50");
    if ((lo <= 200 && (hi ?? lo) >= 51) || (lo >= 51 && lo <= 200)) out.add("51-200");
    if ((hi ?? lo) > 200 || lo > 200) out.add("200+");
  }
  return Array.from(out);
}

/** What the AI assessment attaches to a lead (mirrors enrich-site.ts SiteProfile.ai). */
export interface LeadAi {
  need: number;
  reasons: string[];
  pitch: string;
  gap: string;
  siteQuality?: string;
  teamSize?: string;
  revenueBand?: string;
  locations?: number;
  sizeConfidence?: string;
  title?: string;
}

export const TEAM_SIZE_BANDS = ["1-10", "11-50", "51-200", "200+"] as const;
export const REVENUE_BANDS = ["<250k", "250k-1M", "1M-5M", "5M-25M", "25M+"] as const;
