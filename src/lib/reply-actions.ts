/**
 * What happens when a person writes back (not an out-of-office): every running
 * sequence for that person stops — not just the one whose thread they answered
 * (GoHighLevel keeps one conversation per contact, so an old finished enrolment
 * and a new running one share it). A "stop"/"unsubscribe" also puts the address
 * on the do-not-contact list.
 */

import { Db, enc } from "./db";
import { addSuppression } from "./bounce";

const RUNNING = "queued,active,paused";

export async function applyReply(
  db: Db,
  p: {
    enrollment: { id: string; lead_id: string; sequence_id: string };
    lead: { email?: string | null; domain?: string | null } | null;
    /** They asked to stop / unsubscribe / said not interested. */
    stop: boolean;
    /** When the reply arrived. */
    at: string;
    note: string;
  },
): Promise<void> {
  if (p.stop && p.lead?.email)
    await addSuppression(db, { email: p.lead.email, domain: p.lead.domain ?? null, reason: "replied_stop", note: p.note });

  const running = await db.select<{ id: string; sequence_id: string }>(
    "enrollments",
    `lead_id=eq.${enc(p.enrollment.lead_id)}&status=in.(${RUNNING})&select=id,sequence_id`,
  );
  const seqOf = new Map<string, string>([[p.enrollment.id, p.enrollment.sequence_id]]);
  for (const r of running) seqOf.set(r.id, r.sequence_id);

  let ids = [...seqOf.keys()];
  if (!p.stop) {
    // A sequence set to keep going after a reply ("stop on reply" off) keeps going.
    const seqIds = [...new Set(seqOf.values())];
    const seqs = await db.select<{ id: string; stop_on_reply: boolean | null }>(
      "sequences",
      `id=in.(${seqIds.map(enc).join(",")})&select=id,stop_on_reply`,
    );
    const keepGoing = new Set(seqs.filter((s) => s.stop_on_reply === false).map((s) => s.id));
    ids = ids.filter((id) => !keepGoing.has(seqOf.get(id) || ""));
  }
  if (!ids.length) return;
  await db.update(
    "enrollments",
    // An earlier bounce/unsubscribe stays what it was; a "stop" always wins.
    `id=in.(${ids.map(enc).join(",")})${p.stop ? "&status=neq.unsubscribed" : "&status=not.in.(bounced,unsubscribed)"}`,
    { status: p.stop ? "unsubscribed" : "replied", replied_at: p.at },
  );
}

/** The enrolment a reply in this thread belongs to: a running one first, else the newest. */
export async function enrollmentForThread<T extends { id: string; status: string }>(
  db: Db,
  threadFilter: string,
): Promise<T | null> {
  const rows = await db.select<T>("enrollments", `${threadFilter}&select=*&order=created_at.desc&limit=10`);
  return rows.find((r) => RUNNING.split(",").includes(r.status)) ?? rows[0] ?? null;
}
