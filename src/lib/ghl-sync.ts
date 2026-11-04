/**
 * Replies + bounces for a GHL "mailbox", polled on the cron (no webhooks).
 *
 *  Replies: conversations whose last message is inbound → match to an
 *           enrollment by conversation id (enrollments.thread_id) → classify
 *           with Claude, record the message, stop the sequence (same rules as Gmail).
 *  Bounces: for emails we sent in the last 3 days, ask GHL for the email's
 *           delivery status; bounced/undelivered → suppress + mark the enrollment.
 */

import { Db, enc } from "./db";
import { classifyReply } from "./reply-ai";
import { isAutoReplyText, wantsToStop } from "./gmail";
import { ghlCredsFor } from "./channel";
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
): Promise<{ replies: number; bounces: number; stops: number }> {
  const out = { replies: 0, bounces: 0, stops: 0 };
  const creds = await ghlCredsFor(db, mb.id);
  const token = await ghlToken(creds);
  const since = Date.now() - 3 * 86400e3;

  /* ------------------------------------------------------------ replies */
  const convs = await ghlInboundConversations(token, creds.locationId, 100);
  for (const c of convs) {
    const lastAt =
      typeof c.lastMessageDate === "number"
        ? c.lastMessageDate
        : Date.parse(String(c.lastMessageDate || ""));
    if (Number.isFinite(lastAt) && lastAt < since) break; // sorted desc
    const en = await db.one<Enrollment>(
      "enrollments",
      `thread_id=eq.${enc(c.id)}&mailbox_id=eq.${mb.id}&select=*`,
    );
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
        });
        if (ai) {
          intent = ai.intent;
          draft = ai.draft;
        }
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
      const stop = intent === "not_interested" || wantsToStop(`${subject} ${bodyText}`);
      if (stop && lead?.email) {
        await db
          .upsert(
            "suppressions",
            {
              email: lead.email.toLowerCase(),
              domain: lead.domain,
              reason: "replied_stop",
              note: bodyText.slice(0, 200),
            },
            "email",
          )
          .catch(() => {});
        out.stops++;
      }
      const seq = await db.one<Sequence>(
        "sequences",
        `id=eq.${en.sequence_id}&select=stop_on_reply`,
      );
      if (stop || seq?.stop_on_reply !== false) {
        await db.update("enrollments", `id=eq.${en.id}`, {
          status: stop ? "unsubscribed" : "replied",
          replied_at: new Date(Date.parse(m.dateAdded) || Date.now()).toISOString(),
        });
      }
      out.replies++;
    }
  }

  /* ------------------------------------------------------------ bounces */
  const recent = await db.select<{
    id: string;
    gmail_message_id: string | null;
    enrollment_id: string | null;
    lead_id: string | null;
    subject: string;
  }>(
    "messages",
    `mailbox_id=eq.${mb.id}&direction=eq.out&status=eq.sent&sent_at=gte.${enc(new Date(since).toISOString())}&select=id,gmail_message_id,enrollment_id,lead_id,subject&limit=200`,
  );
  for (const r of recent) {
    if (!r.gmail_message_id) continue;
    const e = await ghlEmail(token, r.gmail_message_id);
    if (!e || !GHL_BOUNCE_STATUSES.has(e.status)) continue;
    const lead = r.lead_id ? await db.one<Lead>("leads", `id=eq.${r.lead_id}&select=*`) : null;
    if (lead?.email) {
      await db
        .upsert(
          "suppressions",
          {
            email: lead.email.toLowerCase(),
            domain: lead.domain,
            reason: "bounce",
            note: `GHL: ${e.status}`,
          },
          "email",
        )
        .catch(() => {});
      await db.update("leads", `id=eq.${lead.id}`, { email_verified: "invalid" });
    }
    if (r.enrollment_id)
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

  await db.update("mailboxes", `id=eq.${mb.id}`, {
    last_sync_at: new Date().toISOString(),
    last_error: null,
  });
  return out;
}
