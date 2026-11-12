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

import { normalizeEmail, classifyBounce } from "./bounce";
import { Db, enc } from "./db";
import { accessTokenFor } from "./google-oauth";
import {
  gmailSend,
  newMessageId,
  gmailThreadHeaders,
  gmailListAll,
  gmailGetHeaders,
  isBounce,
  isAutoReply,
  isAutoReplyText,
  wantsToStop,
} from "./gmail";
import {
  ghlToken,
  ghlUpsertContact,
  ghlSendEmail,
  ghlMessages,
  ghlPlainText,
  type GhlCreds,
} from "./ghl";
import { NotSentError } from "./send-errors";

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
  deadline?: number;
}

export interface SentMail {
  id: string; // provider message id
  threadId: string; // Gmail thread id | GHL conversation id
  rfcMessageId: string; // our RFC Message-ID (Gmail) | GHL email-message id (GHL)
}

export const isGhl = (mb: ChannelMailbox) => (mb.provider || "google") === "ghl";

/**
 * Everything before the provider's send call (credentials, token, contact).
 * A failure here can't have sent anything, so it is tagged as such — the
 * sequencer then simply tries again later instead of holding the person as
 * "possibly sent". The message itself is kept unchanged.
 */
async function beforeSend<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof NotSentError) throw err;
    throw new NotSentError((err as Error | null)?.message || String(err));
  }
}

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
    const { token, contactId } = await beforeSend(async () => {
      const creds = await ghlCredsFor(db, mb.id);
      const token = await ghlToken(creds);
      const contactId = await ghlUpsertContact(token, creds.locationId, {
        email: normalizeEmail(m.to.email),
        name: m.to.name,
        company: m.company,
        phone: m.phone,
        tags: ["inspirova-outreach"],
      });
      return { token, contactId };
    });
    if (m.deadline && Date.now() + 2000 >= m.deadline) throw new NotSentError("Sending time slot ended before delivery");
    const sent = await ghlSendEmail(token, {
      deadline: m.deadline,
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

  let token = await beforeSend(() => accessTokenFor(env, db, mb.id));
  const rfc = newMessageId(mb.email.split("@")[1] || "localhost");
  const mail = {
    deadline: m.deadline,
    from: { name: mb.display_name, email: mb.email },
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html,
    threadId: m.threadId,
    inReplyTo: m.inReplyTo,
    unsubscribeUrl: m.unsubscribeUrl,
    unsubscribeMailto: mb.email,
  };
  if (m.deadline && Date.now() + 2000 >= m.deadline) throw new NotSentError("Sending time slot ended before delivery");
  let sent: Awaited<ReturnType<typeof gmailSend>>;
  try {
    sent = await gmailSend(token, mail, rfc);
  } catch (err) {
    // Google refused the stored sign-in token (401): nothing was sent. Ask for
    // a fresh one and try once more before the mailbox is called broken.
    if (!/^gmail send 401\b/.test((err as Error | null)?.message || "")) throw err;
    token = await beforeSend(() => accessTokenFor(env, db, mb.id, true));
    if (m.deadline && Date.now() + 2000 >= m.deadline) throw new NotSentError("Sending time slot ended before delivery");
    sent = await gmailSend(token, mail, rfc);
  }
  return { id: sent.id, threadId: sent.threadId, rfcMessageId: rfc };
}

/** What a follow-up's conversation shows since the person was enrolled. */
export interface ThreadState {
  /** They wrote back (not an out-of-office). */
  replied?: { at: string; text: string; stop: boolean };
  /** An email to them bounced for good (short reason). */
  bounced?: string;
  /** The conversation no longer exists (deleted), so it couldn't be read. */
  missing?: boolean;
}

/**
 * Read one conversation right before a follow-up, so a reply or bounce that the
 * inbox read hasn't recorded yet still stops it. Gmail also looks for mail FROM
 * the person in any conversation (a reply with a new subject starts a new one).
 * Throws when it couldn't look (provider down, rate limit) — the caller holds.
 */
export async function threadState(
  env: Env,
  db: Db,
  mb: ChannelMailbox,
  threadId: string,
  sinceMs: number,
  personEmail?: string | null,
): Promise<ThreadState> {
  const out: ThreadState = {};
  const noteReply = (at: string, text: string, subject: string) => {
    if (!out.replied || at > out.replied.at) out.replied = { at, text, stop: wantsToStop(subject) || wantsToStop(text) };
  };
  if (isGhl(mb)) {
    // GoHighLevel keeps ONE conversation per contact: any reply lands in it.
    const creds = await ghlCredsFor(db, mb.id);
    const token = await ghlToken(creds);
    let msgs: Awaited<ReturnType<typeof ghlMessages>>;
    try {
      msgs = await ghlMessages(token, threadId, 40);
    } catch (err) {
      if (/\b404\b/.test((err as Error).message)) return { missing: true };
      throw err;
    }
    for (const m of msgs) {
      const at = Date.parse(m.dateAdded);
      if (Number.isFinite(at) && at < sinceMs) continue;
      if (/activity/i.test(String(m.messageType || m.type || ""))) continue; // notes, pipeline changes…
      // Only a clear, final delivery failure ("failed" can be a send that never left).
      if (m.direction === "outbound" && /^bounced$/i.test(m.status || "")) out.bounced ??= `GHL: ${m.status}`;
      if (m.direction !== "inbound") continue;
      const subject = m.subject || "";
      const text = ghlPlainText(m.body || "");
      if (isAutoReplyText(subject, text)) continue;
      noteReply(new Date(Number.isFinite(at) ? at : Date.now()).toISOString(), text, subject);
    }
    return out;
  }
  const token = await accessTokenFor(env, db, mb.id);
  const me = mb.email.toLowerCase();
  const look = (m: Awaited<ReturnType<typeof gmailGetHeaders>>) => {
    if (!m) return;
    if (m.internalDate && m.internalDate < sinceMs) return;
    if (m.labelIds.includes("SENT") || m.labelIds.includes("DRAFT") || m.from.toLowerCase().includes(me)) return;
    if (isBounce(m)) {
      // A delay notice is not a bounce; the inbox read handles soft ones.
      if (classifyBounce(m.subject, m.snippet) === "hard") out.bounced ??= m.subject || "delivery failure";
      return;
    }
    if (isAutoReply(m)) return;
    noteReply(new Date(m.internalDate || Date.now()).toISOString(), m.snippet, m.subject);
  };
  const thread = await gmailThreadHeaders(token, threadId);
  if (thread === null) out.missing = true;
  const inThread = new Set((thread ?? []).map((m) => m.id));
  (thread ?? []).forEach(look);
  const who = (personEmail || "").toLowerCase().trim();
  if (/^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(who)) {
    const hits = await gmailListAll(token, `in:anywhere from:${who} after:${Math.floor(sinceMs / 1000)}`, 10);
    for (const h of hits.items) {
      if (inThread.has(h.id)) continue;
      const m = await gmailGetHeaders(token, h.id);
      if (!m) throw new Error("gmail message could not be read");
      look(m);
    }
  }
  return out;
}
