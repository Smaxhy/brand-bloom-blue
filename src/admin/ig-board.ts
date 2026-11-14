/**
 * The Instagram working list: one line per account, filed in sections, with
 * the clean-up that keeps junk and doubles out of it.
 *
 * Pure functions (no network, no React), so every rule here is covered by tests.
 * Nothing in this file sends a message: sections only record what you did by hand.
 */
import { igFit, igHandle, igUrl } from "@/lib/instagram";
import { normCompany } from "@/lib/business-key";
import type { AdminData, RawBusiness } from "./store";

/** Where an account sits in the list. "todo" and "check" are worked out; the others are filed by hand. */
export type IgStage = "todo" | "check" | "dmed" | "replied" | "skip";

/** What was filed by hand for an account, next to the time it was DMed (kept in `igDms`). */
export interface IgMark {
  /** "replied" = they answered; "skip" = not a fit, kept out of the list to DM. */
  stage?: "replied" | "skip";
  at: number;
  /** Filed as an earlier DM (not sent today): left out of today's count. */
  filed?: boolean;
}

export const IG_STAGES: { id: IgStage; label: string; hint: string }[] = [
  { id: "todo", label: "To DM", hint: "Ready to message" },
  {
    id: "check",
    label: "Check first",
    hint: "Might not be their account: look at it before you message",
  },
  { id: "dmed", label: "DMed", hint: "Messaged, no answer yet" },
  { id: "replied", label: "Replied", hint: "They answered" },
  { id: "skip", label: "Not a fit", hint: "Left out of the list to DM" },
];

/** One Instagram account, with every saved business it belongs to. */
export interface IgAccount {
  handle: string;
  url: string;
  /** The saved business shown for it (the best of `rows`); none when it was messaged without being saved. */
  row?: RawBusiness;
  /** Every Raw Data row that carries this account. */
  rows: RawBusiness[];
  business: string;
  city: string;
  industry: string;
  /** Other, differently named businesses that share the account (a second location, or a wrong match). */
  others: string[];
  followers: number | null;
  score: number | null;
  /** 0–100: how well the handle fits the business name or website. */
  fit: number;
  /** We believe it is theirs (their listing or website says so, hard evidence, or you confirmed it). */
  sure: boolean;
  /** Why, in plain words. */
  why: string;
  stage: IgStage;
  /** When it was DMed, and when it was last filed by hand. */
  dmedAt?: number;
  filedAt?: number;
  /** When the business was saved (the newest of its rows). */
  addedAt: number;
}

const VIA_WHY: Record<string, string> = {
  listing: "their listing gives this Instagram as their website",
  site: "linked on their website",
  bio: "linked on their link-in-bio page",
  search: "found by search",
};

/** How well a handle fits a saved business, remembered: the list is rebuilt on every change and the answer never differs. */
const fits = new Map<string, number>();
function fitOf(handle: string, row: Pick<RawBusiness, "business" | "website">): number {
  const key = `${handle}\n${row.business}\n${row.website}`;
  let fit = fits.get(key);
  if (fit === undefined) {
    if (fits.size >= 20_000) fits.clear();
    fit = igFit(handle, { name: row.business, domain: row.website });
    fits.set(key, fit);
  }
  return fit;
}

/** The canonical profile link for whatever is stored, or "" when it isn't a real profile (a section page, a placeholder). */
export function cleanIgUrl(stored?: string | null): string {
  return igUrl(igHandle(stored || ""));
}

/**
 * Do we trust that this row's Instagram is the business's own?
 * Rows saved before the reason was kept are trusted only when the handle
 * itself looks like the business — the rest are worth a look first.
 */
export function igRowTrust(
  row: RawBusiness,
  handle = igHandle(row.instagram || ""),
): { sure: boolean; why: string; fit: number } {
  const fit = handle ? fitOf(handle, row) : 0;
  if (row.instagramChecked) return { sure: true, why: "you checked it", fit };
  if (row.instagramSure === false)
    return {
      sure: false,
      why: row.instagramWhy || "the name matches, nothing else confirms it",
      fit,
    };
  if (row.instagramVia)
    return {
      sure: true,
      why: row.instagramWhy || VIA_WHY[row.instagramVia] || "found during a reveal",
      fit,
    };
  return fit >= 55
    ? { sure: true, why: "the handle matches the business name", fit }
    : { sure: false, why: "the handle doesn't look like the business name", fit };
}

/** The section an account is in. */
export function igStageOf(
  handle: string,
  data: Pick<AdminData, "igDms" | "igMarks">,
  about: { sure: boolean; rejected?: boolean },
): IgStage {
  const mark = data.igMarks?.[handle];
  if (mark?.stage === "replied") return "replied";
  if (mark?.stage === "skip") return "skip";
  if (data.igDms?.[handle]) return "dmed";
  // Every business it belongs to was rejected in Raw Data.
  if (about.rejected) return "skip";
  return about.sure ? "todo" : "check";
}

/** One line per Instagram account: saved businesses grouped by handle, plus accounts messaged without being saved. */
export function igAccounts(data: Pick<AdminData, "raw" | "igDms" | "igMarks">): IgAccount[] {
  const groups = new Map<string, RawBusiness[]>();
  for (const row of data.raw ?? []) {
    const handle = igHandle(row.instagram || "");
    if (!handle) continue;
    const group = groups.get(handle);
    if (group) group.push(row);
    else groups.set(handle, [row]);
  }
  const out: IgAccount[] = [];
  for (const [handle, rows] of groups) {
    const ranked = rows
      .map((row) => ({ row, trust: igRowTrust(row, handle) }))
      .sort(
        (a, b) =>
          Number(b.trust.sure) - Number(a.trust.sure) ||
          Number(a.row.status === "rejected") - Number(b.row.status === "rejected") ||
          b.trust.fit - a.trust.fit ||
          (b.row.score ?? -1) - (a.row.score ?? -1) ||
          b.row.scrapedAt - a.row.scrapedAt,
      );
    const { row, trust } = ranked[0];
    const own = normCompany(row.business);
    const others = [
      ...new Map(
        rows
          .filter((r) => normCompany(r.business) !== own)
          .map((r) => [normCompany(r.business), r.business] as const),
      ).values(),
    ];
    const followers = rows.reduce<number | null>(
      (best, r) =>
        typeof r.instagramFollowers === "number" ? Math.max(best ?? 0, r.instagramFollowers) : best,
      null,
    );
    const score = rows.reduce<number | null>(
      (best, r) => (typeof r.score === "number" ? Math.max(best ?? 0, r.score) : best),
      null,
    );
    out.push({
      handle,
      url: igUrl(handle),
      row,
      rows,
      business: row.business,
      city: row.city || "",
      industry: row.industry || "",
      others,
      followers,
      score,
      fit: trust.fit,
      sure: trust.sure,
      why: trust.why,
      stage: igStageOf(handle, data, {
        sure: trust.sure,
        rejected: rows.every((r) => r.status === "rejected"),
      }),
      dmedAt: data.igDms?.[handle],
      filedAt: data.igMarks?.[handle]?.at,
      addedAt: Math.max(...rows.map((r) => r.scrapedAt || 0)),
    });
  }
  // Messaged from a search result that was never saved: still shown where it was filed.
  const loose = new Set([...Object.keys(data.igDms ?? {}), ...Object.keys(data.igMarks ?? {})]);
  for (const handle of loose) {
    if (groups.has(handle) || igHandle(handle) !== handle) continue;
    const stage = igStageOf(handle, data, { sure: true });
    if (stage === "todo") continue;
    out.push({
      handle,
      url: igUrl(handle),
      rows: [],
      business: "",
      city: "",
      industry: "",
      others: [],
      followers: null,
      score: null,
      fit: 0,
      sure: true,
      why: "messaged from a search result that wasn't saved",
      stage,
      dmedAt: data.igDms?.[handle],
      filedAt: data.igMarks?.[handle]?.at,
      addedAt: data.igDms?.[handle] ?? data.igMarks?.[handle]?.at ?? 0,
    });
  }
  return out;
}

export function igCounts(accounts: IgAccount[]): Record<IgStage, number> {
  const counts: Record<IgStage, number> = { todo: 0, check: 0, dmed: 0, replied: 0, skip: 0 };
  for (const a of accounts) counts[a.stage]++;
  return counts;
}

/** Search box: handle, business, contact, town, trade. */
export function igMatches(account: IgAccount, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return true;
  return [
    account.handle,
    account.business,
    account.city,
    account.industry,
    ...account.others,
    ...account.rows.map((r) => r.contactName || ""),
  ].some((text) => text.toLowerCase().includes(q));
}

export type IgSortKey = "score" | "followers" | "added" | "dmed" | "account" | "business" | "city";
export interface IgSort {
  key: IgSortKey;
  dir: "asc" | "desc";
}

/** The order each section opens in: best leads first to DM; the latest first once messaged. */
export function igDefaultSort(stage: IgStage): IgSort {
  return stage === "dmed" || stage === "replied"
    ? { key: "dmed", dir: "desc" }
    : { key: "score", dir: "desc" };
}

/** Sort a section. Lines without the value (no follower count, no score) always come last. */
export function sortIgAccounts(accounts: IgAccount[], sort: IgSort): IgAccount[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const text = (a: IgAccount): string =>
    sort.key === "account" ? a.handle : sort.key === "business" ? a.business : a.city;
  const number = (a: IgAccount): number | null =>
    sort.key === "score"
      ? a.score
      : sort.key === "followers"
        ? a.followers
        : sort.key === "dmed"
          ? // When it last moved: the DM itself, or the reply / the "not a fit" after it.
            ((a.stage === "dmed" ? a.dmedAt : (a.filedAt ?? a.dmedAt)) ?? null)
          : a.addedAt || null;
  const textual = sort.key === "account" || sort.key === "business" || sort.key === "city";
  return [...accounts].sort((a, b) => {
    if (textual) {
      const x = text(a).toLowerCase();
      const y = text(b).toLowerCase();
      if (!x !== !y) return x ? -1 : 1;
      const order = x.localeCompare(y);
      if (order) return order * sign;
    } else {
      const x = number(a);
      const y = number(b);
      if ((x == null) !== (y == null)) return x == null ? 1 : -1;
      if (x != null && y != null && x !== y) return (x - y) * sign;
    }
    // The same value: the better lead, then the closer name match, then a steady order.
    return (
      (b.score ?? -1) - (a.score ?? -1) ||
      (b.followers ?? -1) - (a.followers ?? -1) ||
      b.fit - a.fit ||
      a.handle.localeCompare(b.handle)
    );
  });
}

const MAX_MARKS = 5000;
const newest = <T>(map: Record<string, T>, time: (value: T) => number): Record<string, T> =>
  Object.fromEntries(
    Object.entries(map)
      .sort((a, b) => time(b[1]) - time(a[1]))
      .slice(0, MAX_MARKS),
  );

/**
 * File accounts in a section. Nothing is sent: this records what you did.
 * `filed` — these were DMed earlier, so they don't count as today's.
 */
export function moveIgAccounts(
  data: AdminData,
  handles: string[],
  to: Exclude<IgStage, "check">,
  now = Date.now(),
  opts: { filed?: boolean } = {},
): AdminData {
  const dms = { ...(data.igDms ?? {}) };
  const marks = { ...(data.igMarks ?? {}) };
  let changed = false;
  for (const raw of handles) {
    const handle = igHandle(raw);
    if (!handle) continue;
    changed = true;
    const before = marks[handle];
    const hadDm = !!dms[handle];
    if (to === "todo") {
      delete dms[handle];
      delete marks[handle];
    } else if (to === "dmed") {
      if (!hadDm) dms[handle] = now;
      const filed = hadDm ? before?.filed : opts.filed;
      if (filed) marks[handle] = { at: before?.at ?? now, filed: true };
      else delete marks[handle];
    } else if (to === "replied") {
      // A reply means it was messaged, here or elsewhere: keep the DM date if we have it.
      if (!hadDm) dms[handle] = now;
      marks[handle] = {
        stage: "replied",
        at: now,
        ...(before?.filed || !hadDm ? { filed: true } : {}),
      };
    } else {
      marks[handle] = { stage: "skip", at: now, ...(before?.filed ? { filed: true } : {}) };
    }
  }
  if (!changed) return data;
  return { ...data, igDms: newest(dms, (t) => t), igMarks: newest(marks, (m) => m.at) };
}

/** Undo a move: put these accounts back exactly where `before` had them. */
export function restoreIgMarks(
  data: AdminData,
  handles: string[],
  before: Pick<AdminData, "igDms" | "igMarks">,
): AdminData {
  const dms = { ...(data.igDms ?? {}) };
  const marks = { ...(data.igMarks ?? {}) };
  for (const raw of handles) {
    const handle = igHandle(raw);
    if (!handle) continue;
    const dm = before.igDms?.[handle];
    if (dm) dms[handle] = dm;
    else delete dms[handle];
    const mark = before.igMarks?.[handle];
    if (mark) marks[handle] = mark;
    else delete marks[handle];
  }
  return { ...data, igDms: dms, igMarks: marks };
}

/** Drop marks kept under something that isn't an account (an old "@popular"), and tidy their shape. */
export function cleanIgMarks(data: Pick<AdminData, "igDms" | "igMarks">): {
  igDms: Record<string, number>;
  igMarks: Record<string, IgMark>;
} {
  const igDms: Record<string, number> = {};
  for (const [key, at] of Object.entries(data.igDms ?? {})) {
    const handle = igHandle(key);
    if (handle && Number.isFinite(at) && at > 0)
      igDms[handle] = Math.max(igDms[handle] ?? 0, Number(at));
  }
  const igMarks: Record<string, IgMark> = {};
  for (const [key, mark] of Object.entries(data.igMarks ?? {})) {
    const handle = igHandle(key);
    if (!handle || !mark || typeof mark !== "object" || !Number.isFinite(mark.at)) continue;
    const stage = mark.stage === "replied" || mark.stage === "skip" ? mark.stage : undefined;
    if (!stage && !mark.filed) continue;
    igMarks[handle] = {
      ...(stage ? { stage } : {}),
      at: Number(mark.at),
      ...(mark.filed ? { filed: true } : {}),
    };
  }
  return { igDms, igMarks };
}

const withoutInstagram = <T extends { instagram?: string }>(row: T): T => {
  const {
    instagram: _i,
    instagramSure: _s,
    instagramFollowers: _f,
    instagramVia: _v,
    instagramWhy: _w,
    instagramChecked: _c,
    ...rest
  } = row as T & Record<string, unknown>;
  return rest as T;
};

/**
 * Clean the Instagram details stored on saved businesses:
 * - anything that isn't a real profile (a "popular" page, a template's
 *   placeholder, a widget maker's account) is taken off;
 * - an account you turned down for a business stays off it;
 * - an account attached to three or more differently named businesses is a
 *   wrong match on the ones whose name it doesn't fit, and is taken off those.
 * Contact details, statuses and outreach history are never touched.
 */
export function cleanInstagramRows(rows: RawBusiness[]): RawBusiness[] {
  let changed = false;
  const byHandle = new Map<string, number[]>();
  const next = rows.map((row, index) => {
    if (!row.instagram) return row;
    const handle = igHandle(row.instagram);
    const turnedDown = !!handle && (row.instagramNot ?? []).some((h) => igHandle(h) === handle);
    if (!handle || turnedDown) {
      changed = true;
      return withoutInstagram(row);
    }
    const list = byHandle.get(handle);
    if (list) list.push(index);
    else byHandle.set(handle, [index]);
    const url = igUrl(handle);
    if (url === row.instagram) return row;
    changed = true;
    return { ...row, instagram: url };
  });
  for (const [handle, indexes] of byHandle) {
    if (indexes.length < 3) continue;
    const names = new Set(indexes.map((i) => normCompany(next[i].business)));
    if (names.size < 3) continue;
    for (const i of indexes) {
      const row = next[i];
      if (row.instagramChecked || fitOf(handle, row) >= 55) continue;
      changed = true;
      next[i] = withoutInstagram(row);
    }
  }
  return changed ? next : rows;
}

/** The same first rule for scan results that aren't saved yet: only real profiles stay. */
export function cleanInstagramResults<T extends { instagram?: string }>(rows: T[]): T[] {
  let changed = false;
  const next = rows.map((row) => {
    if (!row.instagram) return row;
    const url = cleanIgUrl(row.instagram);
    if (url === row.instagram) return row;
    changed = true;
    return url ? { ...row, instagram: url } : withoutInstagram(row);
  });
  return changed ? next : rows;
}

/** "It's theirs": checked by hand, so it moves to the list to DM and stays there. */
export function confirmInstagram(rows: RawBusiness[], handles: string[]): RawBusiness[] {
  const set = new Set(handles.map((h) => igHandle(h)).filter(Boolean));
  if (!set.size) return rows;
  return rows.map((row) =>
    row.instagram && set.has(igHandle(row.instagram))
      ? { ...row, instagramSure: true, instagramChecked: true }
      : row,
  );
}

/**
 * "Wrong account": taken off the business and remembered, so a later reveal
 * can't put it back; the business also rests from searching for a while.
 */
export function rejectInstagram(
  rows: RawBusiness[],
  handles: string[],
  now = Date.now(),
): RawBusiness[] {
  const set = new Set(handles.map((h) => igHandle(h)).filter(Boolean));
  if (!set.size) return rows;
  return rows.map((row) => {
    const handle = row.instagram ? igHandle(row.instagram) : "";
    if (!handle || !set.has(handle)) return row;
    const not = [...new Set([...(row.instagramNot ?? []), handle])].slice(-10);
    return { ...withoutInstagram(row), instagramNot: not, igSearchedAt: now };
  });
}

/** A business that was searched for this recently is not searched for again. */
export const IG_SEARCH_REST_MS = 30 * 86_400_000;
export const igSearchedLately = (at: number | undefined, now = Date.now()): boolean =>
  !!at && now - at < IG_SEARCH_REST_MS;

/**
 * The saved businesses worth looking up: no Instagram yet and a name to look
 * for. `rested` were searched in the last 30 days and are left alone — a
 * second search so soon costs a credit and finds the same nothing.
 */
export function igFinderTargets(
  rows: RawBusiness[],
  ids?: Set<string>,
  now = Date.now(),
): { targets: RawBusiness[]; rested: number } {
  let rested = 0;
  const targets: RawBusiness[] = [];
  for (const row of rows) {
    if (ids ? !ids.has(row.id) : row.status === "rejected") continue;
    if (cleanIgUrl(row.instagram) || !row.business.trim()) continue;
    if (igSearchedLately(row.igSearchedAt, now)) rested++;
    else targets.push(row);
  }
  return { targets, rested };
}
