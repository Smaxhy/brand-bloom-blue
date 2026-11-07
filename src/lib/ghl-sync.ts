/**
 * Replies + bounces for a GHL "mailbox", polled on the cron (no webhooks).
 *
 *  Replies: conversations whose last message is inbound → match to an
 *           enrollment by conversation id (enrollments.thread_id) → classify
 *           with Claude, record the message, stop the sequence (same rules as Gmail).
 *  Bounces: shortly after sending (10–16 min) and again ~6 h later, ask GHL for
 *           the email's delivery status; bounced/undelivered → suppress + mark the enrollment.
 */

import { Db, enc } from "./db";
import { classifyReply } from "./reply-ai";
import { isAutoReplyText, wantsToStop } from "./gmail";
import { ghlCredsFor } from "./channel";
import { applyHardBounce } from "./bounce";
import { applyReply, enrollmentForThread } from "./reply-actions";
import {
  ghlToken,
  ghlInboundConversations,
  ghlMessages,
  ghlEmail,
  ghlPlainText,
  GHL_BOUNCE_STATUSES,
} from "./ghl";
import type { Mailbox, Enrollment, Lead, Sequence, Step, OutreachSettings } from "./sequencer";

type Env = Record<string, string | undefined>;

export async function syncGhlMailbox(
  env: Env,
  db: Db,
  mb: Mailbox,
  /** Stop between messages after this moment (the rest is read next time). */
  deadline?: number,
): Promise<{ replies: number; bounces: number; stops: number; partial?: boolean; note?: string }> {
  const out: { replies: number; bounces: number; stops: number; partial?: boolean; note?: string } = { replies: 0, bounces: 0, stops: 0 };
  const late = () => {
    if (deadline && Date.now() > deadline) out.partial = true;
    return !!out.partial;
  };
  const creds = await ghlCredsFor(db, mb.id);
  const token = await ghlToken(creds);
  // Back to the last complete read (an hour of overlap), at most 14 days, so a
  // quiet spell can't hide a reply; never read before: 3 days.
  const lastOk = mb.last_sync_at ? Date.parse(mb.last_sync_at) : 0;
  const since = lastOk ? Math.max(Date.now() - 14 * 86400e3, lastOk - 3600e3) : Date.now() - 3 * 86400e3;

  /* ------------------------------------------------------------ replies */
  const at = (c: { lastMessageDate?: number | string }) =>
    typeof c.lastMessageDate === "number" ? c.lastMessageDate : Date.parse(String(c.lastMessageDate || ""));
  const convs = await ghlInboundConversations(token, creds.locationId, 100);
  // More conversations with replies than one page since the last read: read
  // further pages. If GHL won't page, the newest 100 are read — every follow-up
  // still checks its own conversation for a reply right before it goes out.
  let page = convs;
  for (let p = 1; p < 5 && page.length >= 90; p++) {
    const oldest = at(page[page.length - 1]);
    if (!Number.isFinite(oldest) || oldest < since) break;
    let next: typeof convs = [];
    try {
      next = await ghlInboundConversations(token, creds.locationId, 100, oldest);
    } catch {
      out.note = "more than 100 conversations with replies since the last read — the newest were read";
      break;
    }
    if (!next.length || next[0].id === page[0].id) break; // no paging here
    convs.push(...next.filter((c) => !convs.some((x) => x.id === c.id)));
    page = next;
  }
  for (const c of convs) {
    if (late()) break;
    const lastAt =
      typeof c.lastMessageDate === "number"
        ? c.lastMessageDate
        : Date.parse(String(c.lastMessageDate || ""));
    if (Number.isFinite(lastAt) && lastAt < since) break; // sorted desc
    // One conversation per contact: a finished enrolment and a running one can
    // share it — the running one is the one to stop.
    const en = await enrollmentForThread<Enrollment>(db, `thread_id=eq.${enc(c.id)}&mailbox_id=eq.${mb.id}`);
    if (!en) continue; // not one of ours
    const msgs = await ghlMessages(token, c.id, 20);
    const inbound = msgs.filter(
      (m) => m.direction === "inbound" && Date.parse(m.dateAdded) >= since,
    );
    if (!inbound.length) continue;
    const known = new Set(
      (
        await db.select<{ gmail_message_id: string }>(
          "messages",
          `gmail_message_id=in.(${inbound.map((m) => `"${m.id}"`).join(",")})&select=gmail_message_id`,
        )
      ).map((r) => r.gmail_message_id),
    );
    for (const m of inbound.sort((a, b) => Date.parse(a.dateAdded) - Date.parse(b.dateAdded))) {
      if (known.has(m.id)) continue;
      if (late()) break;
      const emailId = m.meta?.email?.messageIds?.[0];
      const full = emailId ? await ghlEmail(token, emailId) : null;
      const subject = full?.subject || m.subject || "Re:";
      const bodyText = ghlPlainText(full?.body || m.body || "");
      const auto = isAutoReplyText(subject, bodyText);
      const lead = await db.one<Lead>("leads", `id=eq.${en.lead_id}&select=*`);
      let intent = auto ? "auto" : "unknown";
      let draft = "";
      if (!auto) {
        const stepRows = await db.select<Step>(
          "sequence_steps",
          `sequence_id=eq.${en.sequence_id}&select=*&order=position.asc`,
        );
        const settings = await db.one<OutreachSettings>(
          "outreach_settings",
          "id=eq.singleton&select=*",
        );
        const ai = await classifyReply(env, {
          replyText: bodyText,
          lead,
          ourFirstEmail: stepRows[0]?.body || "",
          senderName: mb.display_name,
          company: settings?.company_name || "Inspirova Marketing",
          signature: mb.signature,
          instructions: settings?.ai_instructions || "",
        });
        if (ai) {
          intent = ai.intent;
          draft = ai.draft;
        }
      }
      // Act on the reply FIRST (stop the sequence, honour an opt-out), then
      // record it as handled — a run that ends in between re-reads it next time.
      if (!auto) {
        const stop = intent === "not_interested" || wantsToStop(subject) || wantsToStop(bodyText);
        // Every running sequence for this person stops, not only this one.
        await applyReply(db, {
          enrollment: en,
          lead,
          stop,
          at: new Date(Date.parse(m.dateAdded) || Date.now()).toISOString(),
          note: bodyText.slice(0, 200),
        });
        if (stop) out.stops++;
      }
      await db
        .insert("messages", {
          enrollment_id: en.id,
          lead_id: en.lead_id,
          mailbox_id: mb.id,
          direction: "in",
          gmail_message_id: m.id,
          gmail_thread_id: c.id,
          rfc_message_id: emailId || null,
          from_header: full?.from || lead?.email || null,
          subject,
          snippet: bodyText.slice(0, 300),
          body_text: bodyText,
          intent,
          draft_reply: draft || null,
          kind: auto ? "auto_reply" : "reply",
          status: "received",
          sent_at: new Date(Date.parse(m.dateAdded) || Date.now()).toISOString(),
        })
        .catch(() => {});
      if (auto) continue;
      out.replies++;
    }
  }

  /* ------------------------------------------------------------ bounces */
  // Ask GHL about each sent email around two moments — 10–16 min after sending
  // (most bounces) and ~6 h after (late ones). With a sync every ~5 min that is
  // one or two lookups per window, instead of re-checking every email of the
  // last 3 days on every sync (which ate the API limit sending needs). Up to 100
  // per window; what doesn't fit in the time slot is read on the next pass, and
  // a follow-up always checks its own conversation for a bounce first.
  type SentRow = { id: string; gmail_message_id: string | null; enrollment_id: string | null; lead_id: string | null; subject: string };
  const nowMs = Date.now();
  const recent = await db.select<{ id: string; gmail_message_id: string | null; enrollment_id: string | null; lead_id: string | null; subject: string; sent_at: string; delivery_checked_at?: string | null }>(
    "messages", `mailbox_id=eq.${mb.id}&direction=eq.out&status=eq.sent&sent_at=gte.${enc(new Date(Date.now() - 3 * 86400e3).toISOString())}&sent_at=lte.${enc(new Date(Date.now() - 10 * 60000).toISOString())}&or=(delivery_checked_at.is.null,delivery_checked_at.lt.${enc(new Date(Date.now() - 6 * 3600000).toISOString())})&select=id,gmail_message_id,enrollment_id,lead_id,subject,sent_at,delivery_checked_at&order=delivery_checked_at.asc.nullsfirst,sent_at.asc&limit=30`,
  );
  for (const r of recent) {
    if (late()) break;
    if (!r.gmail_message_id) continue;
    const e = await ghlEmail(token, r.gmail_message_id);
    if (!e) { out.partial = true; continue; }
    if (!GHL_BOUNCE_STATUSES.has(e.status)) {
      await db.update("messages", `id=eq.${r.id}`, { delivery_checked_at: new Date().toISOString() });
      continue;
    }
    const lead = r.lead_id ? await db.one<Lead>("leads", `id=eq.${r.lead_id}&select=*`) : null;
    if (lead?.email)
      await applyHardBounce(db, {
        email: lead.email,
        lead,
        enrollmentId: r.enrollment_id,
        reason: "bounce",
        note: `GHL: ${e.status}`,
        strict: true, // a failed write throws: the email stays "sent" and is checked again
      });
    else if (r.enrollment_id)
      await db.update("enrollments", `id=eq.${r.enrollment_id}`, {
        status: "bounced",
        last_error: `GHL ${e.status}`,
      });
    await db.update("messages", `id=eq.${r.id}`, { status: "bounced", error: `GHL ${e.status}` });
    await db
      .insert("messages", {
        enrollment_id: r.enrollment_id,
        lead_id: r.lead_id,
        mailbox_id: mb.id,
        direction: "in",
        gmail_message_id: `${r.gmail_message_id}:bounce`,
        subject: `Delivery failed: ${r.subject}`,
        snippet: `GHL reported ${e.status}`,
        kind: "bounce",
        status: "received",
      })
      .catch(() => {});
    out.bounces++;
  }

  if (out.partial) return out;
  await db.update("mailboxes", `id=eq.${mb.id}`, {
    last_sync_at: new Date().toISOString(),
    last_error: null,
  });
  return out;
}
