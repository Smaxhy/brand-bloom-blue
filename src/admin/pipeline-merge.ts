import type { Deal } from "./store";

export interface WebsiteRequest {
  id: string; kind: string; name: string; email: string; company: string | null; phone: string;
  message: string; personal_message: string; created_at: string; consent: boolean;
  services: { id: string; name: string; price: number; billing: string }[];
  estimates: { monthly: number; upfront: number; total: number } | null;
  attribution: { source?: string; medium?: string; campaign?: string };
}

const emailKey = (email: string) => email.trim().replace(/^mailto:/i, "").toLowerCase();
const textKey = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
export function sameDeal(a: Deal, b: Deal) {
  if (a.id === b.id || (a.rawId && a.rawId === b.rawId)) return true;
  const ae = emailKey(a.email), be = emailKey(b.email);
  if (ae && be) return ae === be;
  const ap = a.phone.replace(/\D/g, ""), bp = b.phone.replace(/\D/g, "");
  return !!ap && ap === bp && !!textKey(a.name) && textKey(a.name) === textKey(b.name);
}

export function cleanDuplicateDeals(deals: Deal[]): Deal[] {
  const result: Deal[] = [];
  for (const input of deals) {
    const d = { ...input, email: emailKey(input.email) };
    const index = result.findIndex((other) => sameDeal(other, d));
    if (index < 0) { result.push(d); continue; }
    const old = result[index];
    // The earliest stable identity survives; a deliberate advanced stage survives a blank/new copy.
    const requests = new Map((old.requests ?? []).map((r) => [r.id, r]));
    for (const r of d.requests ?? []) requests.set(r.id, r);
    result[index] = { ...old, contact: old.contact || d.contact, email: old.email || d.email,
      phone: old.phone || d.phone, name: old.name || d.name, source: old.source || d.source,
      rawId: old.rawId || d.rawId, value: old.value || d.value,
      stage: old.stage === "new" ? d.stage : old.stage,
      notes: !d.notes || old.notes.includes(d.notes) ? old.notes : [old.notes, d.notes].filter(Boolean).join("\n\n"),
      requests: [...requests.values()], mergedIds: [...new Set([...(old.mergedIds ?? []), d.id, ...(d.mergedIds ?? [])])],
      updatedAt: Math.max(old.updatedAt, d.updatedAt) };
  }
  return result;
}

export function mergeWebsiteRequests(deals: Deal[], requests: WebsiteRequest[]): Deal[] {
  let result = cleanDuplicateDeals(deals);
  for (const r of [...requests].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const requestDeal: Deal = { id: `website_${r.id}`, name: r.company || r.name, contact: r.name,
      email: r.email, phone: r.phone, value: r.estimates?.total ?? 0, stage: "new",
      source: r.kind === "quote" ? "Website quote" : "Website contact", notes: "",
      requests: [r], createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.created_at) };
    const existing = result.find((d) => sameDeal(d, requestDeal));
    if (!existing) { result.push(requestDeal); continue; }
    const history = new Map((existing.requests ?? []).map((request) => [request.id, request]));
    history.set(r.id, r);
    result = result.map((d) => d.id !== existing.id ? d : { ...d,
      contact: r.name || d.contact, email: r.email || d.email, phone: r.phone || d.phone,
      requests: [...history.values()], updatedAt: Math.max(d.updatedAt, requestDeal.updatedAt) });
  }
  return result;
}