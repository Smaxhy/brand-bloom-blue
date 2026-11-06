/**
 * "Why isn't it sending?" — a dry run of every check the dispatcher makes,
 * explained in plain language. Nothing is sent or changed.
 */

import { Db, enc } from "./db";
import {
  inWindow,
  nextWindowTime,
  startOfLocalDayIso,
  localParts,
  type Mailbox,
  type Sequence,
} from "./sequencer";



export interface MailboxStatus {
  email: string;
  provider: string;
  status: string;
  can_send_now: boolean;
  reasons: string[]; // why it can't (empty when it can)
  sent_today: number;
  daily_cap: number;
  in_hours: boolean;
  hours: string;
  local_time: string;
  due_now: number;
  next_due_at: string | null;
  waiting_total: number;
  last_sync_at: string | null;
  last_error: string | null;
  sequences: string[];
}

export interface SendingStatus {
  checked_at: string;
  scheduler: { ok: boolean; last_seen: string | null; note: string };
  mailboxes: MailboxStatus[];
  blockers: string[]; // top-level, plain language
}

export async function sendingStatus(db: Pick<Db, "select">): Promise<SendingStatus> {
  const now = new Date();
  const out: SendingStatus = {
    checked_at: now.toISOString(),
    scheduler: { ok: false, last_seen: null, note: "" },
    mailboxes: [],
    blockers: [],
  };

  const mailboxes = await db.select<Mailbox>("mailboxes", "select=*&order=created_at.asc");
  const sequences = await db.select<Sequence>("sequences", "status=neq.archived&select=*");
  const active = sequences.filter((s) => s.status === "active");

  // Scheduler health: the cron syncs every mailbox and stamps last_sync_at.
  const lastSeen = mailboxes
    .map((m) => m.last_sync_at)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;
  const ageMin = lastSeen ? (now.getTime() - Date.parse(lastSeen)) / 60000 : Infinity;
  out.scheduler = {
    ok: ageMin <= 25,
    last_seen: lastSeen ?? null,
    note:
      ageMin <= 25
        ? `Mailbox sync was seen recently ( ${Math.round(ageMin)} min ago). Automatic scheduling is not confirmed by a mailbox sync alone.`
        : lastSeen
          ? `No mailbox sync recorded for ${Math.round(ageMin / 60)} h. Automatic scheduling needs checking; manual sending may still work.`
          : "No mailbox sync recorded yet. Automatic scheduling is unverified; manual sending may still work.",
  };

  if (!mailboxes.some((m) => m.status === "active"))
    out.blockers.push("No active mailbox. Settings → connect Google or GoHighLevel.");
  if (!active.length)
    out.blockers.push(
      sequences.length
        ? "No sequence is Active — press ▶ on a sequence (paused/draft ones never send)."
        : "No sequences yet — Outreach → Sequences → New sequence.",
    );

  for (const mb of mailboxes) {
    const seqsHere = active.filter((s) => s.mailbox_ids.includes(mb.id));
    const eligible = inWindow(mb) ? seqsHere : seqsHere.filter((s) => s.send_anytime);
    const anytime = seqsHere.some((s) => s.send_anytime);
    const inHours = inWindow(mb);
    const { hour } = localParts(mb.timezone);
    const sentToday = (
      await db.select<{ id: string }>(
        "messages",
        `mailbox_id=eq.${mb.id}&direction=eq.out&status=eq.sent&sent_at=gte.${enc(startOfLocalDayIso(mb.timezone))}&select=id`,
      )
    ).length;
    const seqIds = eligible.map((s) => s.id);
    const waiting = seqIds.length
      ? await db.select<{ id: string; next_send_at: string | null }>(
          "enrollments",
          `status=in.(queued,active)&sequence_id=in.(${seqIds.join(",")})&or=(mailbox_id.eq.${mb.id},mailbox_id.is.null)&select=id,next_send_at&order=next_send_at.asc&limit=1000`,
        )
      : [];
    const dueNow = waiting.filter(
      (w) => w.next_send_at && Date.parse(w.next_send_at) <= now.getTime(),
    ).length;
    const nextDue = waiting[0]?.next_send_at ?? null;

    const reasons: string[] = [];
    if (mb.status !== "active") reasons.push(`mailbox is ${mb.status}`);
    if (mb.last_error) reasons.push("Mailbox reported an error. Check its connection in Settings.");
    if (!seqsHere.length) reasons.push("no Active sequence uses this mailbox");
    if (!inHours && !anytime) {
      const next = nextWindowTime(mb, 0);
      reasons.push(
        `outside sending hours (${String(mb.window_start).padStart(2, "0")}:00–${String(mb.window_end).padStart(2, "0")}:00 ${mb.timezone}; it's ${String(hour).padStart(2, "0")}:00 there) — resumes ${next.toLocaleString("en-GB", { timeZone: mb.timezone, weekday: "short", hour: "2-digit", minute: "2-digit" })}. Tick "Send any time" on the sequence or press ▶ / Send now.`,
      );
    }
    if (sentToday >= mb.daily_cap)
      reasons.push(
        `daily cap reached (${sentToday}/${mb.daily_cap}) — resets at midnight ${mb.timezone}. Raise it in Settings → mailbox.`,
      );
    if (seqsHere.length && !waiting.length)
      reasons.push("nobody is waiting in its sequences — add people");
    else if (seqsHere.length && !dueNow && nextDue)
      reasons.push(
        `nobody is due yet — next send scheduled ${new Date(nextDue).toLocaleString("en-GB", { timeZone: mb.timezone, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} (${mb.timezone})`,
      );

    out.mailboxes.push({
      email: mb.email,
      provider: mb.provider || "google",
      status: mb.status,
      can_send_now: reasons.length === 0,
      reasons,
      sent_today: sentToday,
      daily_cap: mb.daily_cap,
      in_hours: inHours || anytime,
      hours: `${String(mb.window_start).padStart(2, "0")}:00–${String(mb.window_end).padStart(2, "0")}:00 ${mb.timezone}`,
      local_time: `${String(hour).padStart(2, "0")}:00`,
      due_now: dueNow,
      next_due_at: nextDue,
      waiting_total: waiting.length,
      last_sync_at: mb.last_sync_at ?? null,
      last_error: mb.last_error ? "Mailbox reported an error. Check its connection in Settings." : null,
      sequences: seqsHere.map((s) => s.name),
    });
  }

  if (!out.scheduler.ok) out.blockers.unshift(out.scheduler.note);
  return out;
}
