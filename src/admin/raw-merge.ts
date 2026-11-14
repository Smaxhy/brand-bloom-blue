import { businessKey } from "@/lib/business-key";
import { igHandle } from "@/lib/instagram";
import { cleanIgUrl, cleanInstagramRows } from "./ig-board";
import type { RawBusiness } from "./store";

/**
 * The Instagram details a row may take from another copy of the same business:
 * only a real profile, never one that was turned down for it by hand.
 */
export function incomingInstagram(old: RawBusiness, incoming: Pick<RawBusiness, "instagram" | "instagramSure" | "instagramFollowers" | "instagramVia" | "instagramWhy">): Partial<RawBusiness> {
  if (old.instagram) return {};
  const url = cleanIgUrl(incoming.instagram);
  if (!url || (old.instagramNot ?? []).some((h) => igHandle(h) === igHandle(url))) return {};
  return {
    instagram: url,
    instagramSure: incoming.instagramSure,
    instagramFollowers: incoming.instagramFollowers,
    instagramVia: incoming.instagramVia,
    instagramWhy: incoming.instagramWhy,
  };
}

const keyOf = (r: RawBusiness) => businessKey({ company: r.business, website: r.website, phone: r.phone, city: r.city });

/**
 * Add accepted businesses to Raw Data without creating a second row for a
 * business that's already there: that row keeps its status and history and
 * only gets the details it was missing.
 */
export function addToRaw(raw: RawBusiness[], incoming: RawBusiness[]): { raw: RawBusiness[]; added: number; updated: number } {
  const at = new Map<string, number>();
  raw.forEach((r, i) => {
    const k = keyOf(r);
    if (k && !at.has(k)) at.set(k, i);
  });
  const next = raw.slice();
  const fresh: RawBusiness[] = [];
  const freshAt = new Map<string, number>();
  let updated = 0;
  // Only a real profile is saved, whatever an older scan handed over.
  for (const r of cleanInstagramRows(incoming)) {
    const k = keyOf(r);
    const i = k ? at.get(k) : undefined;
    const freshIndex = k ? freshAt.get(k) : undefined;
    if (i !== undefined) {
      const old = next[i];
      const takeEmail = !old.email && !!r.email;
      next[i] = {
        ...old,
        email: takeEmail ? r.email : old.email,
        emailSource: takeEmail ? r.emailSource : old.emailSource,
        phone: old.phone || r.phone,
        website: old.website || r.website,
        contactName: old.contactName || r.contactName,
        contactTitle: old.contactTitle || r.contactTitle,
        linkedin: old.linkedin || r.linkedin,
        // The Instagram arrives with what we know about it (certainty, followers, where it was found).
        ...incomingInstagram(old, r),
        igSearchedAt: Math.max(old.igSearchedAt ?? 0, r.igSearchedAt ?? 0) || undefined,
        rating: old.rating ?? r.rating,
        reviews: old.reviews ?? r.reviews,
        score: old.score ?? r.score,
        scoreWhy: old.scoreWhy ?? r.scoreWhy,
        ai: old.ai ?? r.ai,
      };
      updated++;
      continue;
    }
    if (freshIndex !== undefined) {
      const merged = addToRaw([fresh[freshIndex]], [r]);
      fresh[freshIndex] = merged.raw[0];
      continue;
    }
    if (k) freshAt.set(k, fresh.length);
    fresh.push(r);
  }
  return { raw: [...fresh, ...next], added: fresh.length, updated };
}
