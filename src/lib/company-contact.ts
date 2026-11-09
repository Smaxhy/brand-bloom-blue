import type { Db } from "./db";
import { enc } from "./db";
import { cleanDomain, isCompanyDomain } from "./business-key";

export const COMPANY_COOLDOWN_DAYS = 90;

/** Server-only outreach history check. Query failures must hold, never permit, a send. */
export async function companyAlreadyContacted(
  db: Pick<Db, "select" | "one">,
  lead: { id: string; domain?: string | null },
  opts: { excludeEnrollmentId?: string; includeNotStarted?: boolean } = {},
): Promise<{ reason: string } | null> {
  const ids = new Set([lead.id]);
  const domain = cleanDomain(lead.domain);
  if (isCompanyDomain(domain)) {
    for (let page = 0; ; page++) {
      if (page >= 20) throw new Error("db select leads: company history exceeds safe lookup budget");
      const others = await db.select<{ id: string }>("leads",
        `domain=eq.${enc(domain)}&id=neq.${enc(lead.id)}&select=id&order=id.asc&limit=100&offset=${page * 100}`);
      others.forEach((other) => ids.add(other.id));
      if (others.length < 100) break;
    }
  }
  const all = [...ids];
  const since = new Date(Date.now() - COMPANY_COOLDOWN_DAYS * 86_400_000).toISOString();
  for (let offset = 0; offset < all.length; offset += 100) {
    const inList = `in.(${all.slice(offset, offset + 100).map(enc).join(",")})`;
    const notThis = opts.excludeEnrollmentId ? `&id=neq.${enc(opts.excludeEnrollmentId)}` : "";
    const started = "&or=(current_step.gt.0,last_error.like.sending%20step*,last_error.like.Possibly%20sent*)";
    const running = await db.one<{ lead_id: string }>("enrollments",
      `lead_id=${inList}&status=in.(queued,active,paused)${opts.includeNotStarted ? "" : started}${notThis}&select=lead_id`) ??
      await db.one<{ lead_id: string }>("enrollments",
        `lead_id=${inList}&status=eq.failed&last_error=like.Possibly%20sent*${notThis}&select=lead_id`);
    if (running) return { reason: running.lead_id === lead.id
      ? "this address is already in another sequence"
      : "someone else at this company is already in a sequence" };
    // History kept from a removed person has no enrollment any more (NULL); a
    // plain "neq" would silently skip those rows, so they are matched explicitly.
    const sent = await db.one<{ lead_id: string; sent_at: string }>("messages",
      `lead_id=${inList}&direction=eq.out&status=in.(sent,bounced)&sent_at=gte.${enc(since)}${
        opts.excludeEnrollmentId
          ? `&or=(enrollment_id.is.null,enrollment_id.neq.${enc(opts.excludeEnrollmentId)})`
          : ""
      }&select=lead_id,sent_at&order=sent_at.desc`);
    if (sent) return { reason: `${sent.lead_id === lead.id ? "this address" : "someone at this company"} was already emailed on ${new Date(sent.sent_at).toISOString().slice(0, 10)}` };
  }
  return null;
}