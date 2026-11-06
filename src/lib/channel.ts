/**
 * One send/sync surface over both channels:
 *   - Google Workspace mailbox (Gmail API, OAuth)      provider = 'google'
 *   - GoHighLevel sub-account (LeadConnector API)       provider = 'ghl'
 *
 * The sequencer, the test-send route and the reply route call `sendVia`; the
 * cron calls `syncGhlMailbox` for GHL rows (Gmail rows keep their own sync).
 *
 * Column reuse (no schema churn): for GHL rows, messages.gmail_message_id holds
 * the GHL email-message id and messages.gmail_thread_id / enrollments.thread_id
 * hold the GHL conversation id.
 */

import { normalizeEmail } from "./bounce";
import { Db, enc } from "./db";
import { accessTokenFor } from "./google-oauth";
import { gmailSend, newMessageId } from "./gmail";
import { ghlToken, ghlUpsertContact, ghlSendEmail, type GhlCreds } from "./ghl";

type Env = Record<string, string | undefined>;

export interface ChannelMailbox {
  id: string;
  email: string;
  display_name: string;
  provider?: string | null;
  signature?: string;
}

export interface OutgoingMail {
  to: { name: string; email: string };
  subject: string;
  text: string;
  html: string;
  /** Gmail: thread id to append to. GHL: ignored (conversation is per contact). */
  threadId?: string;
  /** Gmail: RFC Message-ID we reply to. GHL: the first email-message id, for In-Reply-To threading. */
  inReplyTo?: string;
  unsubscribeUrl?: string;
  /** Lead context for the GHL contact upsert. */
  company?: string;
  phone?: string;
}

export interface SentMail {
  id: string; // provider message id
  threadId: string; // Gmail thread id | GHL conversation id
  rfcMessageId: string; // our RFC Message-ID (Gmail) | GHL email-message id (GHL)
}

export const isGhl = (mb: ChannelMailbox) => (mb.provider || "google") === "ghl";

export async function ghlCredsFor(db: Db, mailboxId: string): Promise<GhlCreds> {
  const t = await db.one<{
    ghl_api_key: string | null;
    ghl_location_id: string | null;
    ghl_company_id: string | null;
  }>(
    "mailbox_tokens",
    `mailbox_id=eq.${enc(mailboxId)}&select=ghl_api_key,ghl_location_id,ghl_company_id`,
  );
  if (!t?.ghl_api_key || !t.ghl_location_id) throw new Error("GHL mailbox is not connected");
  return {
    apiKey: t.ghl_api_key,
    locationId: t.ghl_location_id,
    companyId: t.ghl_company_id || undefined,
  };
}

export async function sendVia(
  env: Env,
  db: Db,
  mb: ChannelMailbox,
  m: OutgoingMail,
): Promise<SentMail> {
  if (isGhl(mb)) {
    const creds = await ghlCredsFor(db, mb.id);
    const token = await ghlToken(creds);
    const contactId = await ghlUpsertContact(token, creds.locationId, {
      email: normalizeEmail(m.to.email),
      name: m.to.name,
      company: m.company,
      phone: m.phone,
      tags: ["inspirova-outreach"],
    });
    const sent = await ghlSendEmail(token, {
      contactId,
      subject: m.subject,
      html: m.html,
      text: m.text,
      fromName: mb.display_name,
      fromEmail: mb.email,
      replyToEmailMessageId: m.inReplyTo || undefined,
    });
    return {
      id: sent.emailMessageId || sent.id,
      threadId: sent.conversationId,
      rfcMessageId: sent.emailMessageId || sent.id,
    };
  }

  const token = await accessTokenFor(env, db, mb.id);
  const rfc = newMessageId(mb.email.split("@")[1] || "localhost");
  const sent = await gmailSend(
    token,
    {
      from: { name: mb.display_name, email: mb.email },
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
      threadId: m.threadId,
      inReplyTo: m.inReplyTo,
      unsubscribeUrl: m.unsubscribeUrl,
      unsubscribeMailto: mb.email,
    },
    rfc,
  );
  return { id: sent.id, threadId: sent.threadId, rfcMessageId: rfc };
}
