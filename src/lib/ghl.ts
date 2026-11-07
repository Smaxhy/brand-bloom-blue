/**
 * GoHighLevel (LeadConnector) as a sending channel.
 *
 * A GHL "mailbox" is a row in `mailboxes` with provider = 'ghl'. Its
 * credentials live in `mailbox_tokens` (ghl_api_key = Private Integration
 * token or agency token, ghl_location_id = the sub-account). Sending goes
 * contact upsert → conversations/messages (type Email), exactly the calls the
 * original admin used. Replies and bounces are POLLED from the conversations
 * API on the same 10-minute cron as Gmail, so no workflow/webhook setup is needed.
 */

const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

export interface GhlCreds {
  apiKey: string;
  locationId: string;
  companyId?: string;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    Version: VERSION,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchRetry(
  url: string,
  init: RequestInit,
  max = 3,
  /** Retry 5xx too. Off for the send call: a 5xx may still have sent the email. */
  retryServerErrors = true,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(20000) });
    const retryable = res.status === 429 || (retryServerErrors && res.status >= 500);
    if (!retryable || attempt >= max) return res;
    const ra = Number(res.headers.get("retry-after"));
    await sleep(
      Number.isFinite(ra) && ra > 0
        ? Math.min(ra * 1000, 10000)
        : Math.min(1000 * 2 ** attempt, 8000),
    );
    attempt++;
  }
}

/** Agency tokens must be exchanged for a location token first. */
export async function ghlToken(c: GhlCreds): Promise<string> {
  if (!c.companyId) return c.apiKey;
  const res = await fetch(`${API}/oauth/locationToken`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Version: VERSION,
    },
    body: new URLSearchParams({ companyId: c.companyId, locationId: c.locationId }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok)
    throw new Error(`GHL location token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { accessToken?: string };
  if (!j.accessToken) throw new Error("GHL returned no location token");
  return j.accessToken;
}

/** Verify credentials: fetch the location. Returns its name. */
export async function ghlVerify(
  c: GhlCreds,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  try {
    const token = await ghlToken(c);
    const res = await fetchRetry(`${API}/locations/${encodeURIComponent(c.locationId)}`, {
      headers: headers(token),
    });
    if (!res.ok)
      return { ok: false, error: `GHL ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const j = (await res.json()) as { location?: { name?: string } };
    return { ok: true, name: j.location?.name || c.locationId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function ghlUpsertContact(
  token: string,
  locationId: string,
  p: { email: string; name?: string; company?: string; phone?: string; tags?: string[] },
): Promise<string> {
  const [firstName, ...rest] = (p.name || p.email).trim().split(/\s+/);
  const res = await fetchRetry(`${API}/contacts/upsert`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      locationId,
      email: p.email,
      firstName: firstName || p.email,
      lastName: rest.join(" ") || undefined,
      companyName: p.company || undefined,
      phone: p.phone || undefined,
      tags: p.tags,
      source: "Inspirova outreach",
    }),
  });
  if (!res.ok) throw new Error(`GHL upsert ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { contact?: { id?: string }; id?: string };
  const id = j.contact?.id ?? j.id;
  if (!id) throw new Error("GHL upsert returned no contact id");
  return id;
}

/** Plain text as minimal HTML for GHL's email-body field. */
export function textToMinimalHtml(text: string): string {
  const escape = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const body = (text || "").split(/(https?:\/\/[^\s<>"']+)/g)
    .map((part, index) => index % 2 === 1
      ? `<a href="${escape(part)}">${escape(part)}</a>`
      : escape(part))
    .join("");
  return `<div style="white-space:pre-wrap;font-family:inherit">${body}</div>`;
}

export interface GhlSent {
  id: string; // message id
  conversationId: string;
  emailMessageId: string;
}

export async function ghlSendEmail(
  token: string,
  m: {
    deadline?: number;
    contactId: string;
    subject: string;
    html: string;
    text: string;
    fromName: string;
    fromEmail: string;
    replyToEmailMessageId?: string;
  },
): Promise<GhlSent> {
  const res = await fetchRetry(`${API}/conversations/messages`, {
    signal: AbortSignal.timeout(Math.max(1, Math.min(12_000, (m.deadline ?? Date.now() + 12_000) - Date.now()))),
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      type: "Email",
      contactId: m.contactId,
      subject: m.subject,
      // GHL uses html for email bodies; message alone is intended for SMS.
      html: m.html || textToMinimalHtml(m.text),
      message: m.text,
      emailFrom: m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail,
      replyMessageId: m.replyToEmailMessageId || undefined,
    }),
  }, 0, false);
  if (!res.ok) throw new Error(`GHL send ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as {
    messageId?: string;
    conversationId?: string;
    emailMessageId?: string;
    msg?: string;
  };
  return {
    id: j.messageId || "",
    conversationId: j.conversationId || "",
    emailMessageId: j.emailMessageId || j.messageId || "",
  };
}

export interface GhlConversation {
  id: string;
  contactId: string;
  email?: string;
  lastMessageDate?: number | string;
  lastMessageBody?: string;
  lastMessageDirection?: string;
  lastMessageType?: string;
}

/** Conversations whose last message is an inbound email, newest first. */
export async function ghlInboundConversations(
  token: string,
  locationId: string,
  limit = 100,
  /** Next page: the last conversation's lastMessageDate (GHL's search cursor). */
  startAfterDate?: number,
): Promise<GhlConversation[]> {
  const u = new URL(`${API}/conversations/search`);
  u.searchParams.set("locationId", locationId);
  u.searchParams.set("lastMessageDirection", "inbound");
  u.searchParams.set("sortBy", "last_message_date");
  u.searchParams.set("sort", "desc");
  u.searchParams.set("limit", String(limit));
  if (startAfterDate) u.searchParams.set("startAfterDate", String(startAfterDate));
  const res = await fetchRetry(u.toString(), { headers: headers(token) });
  if (!res.ok)
    throw new Error(`GHL conversations ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { conversations?: GhlConversation[] };
  return (j.conversations ?? []).filter(
    (c) => !c.lastMessageType || /email/i.test(c.lastMessageType),
  );
}

export interface GhlMessage {
  id: string;
  direction: "inbound" | "outbound";
  dateAdded: string;
  body?: string;
  subject?: string;
  type?: string | number;
  messageType?: string;
  status?: string;
  meta?: { email?: { messageIds?: string[] } };
}

export async function ghlMessages(
  token: string,
  conversationId: string,
  limit = 20,
): Promise<GhlMessage[]> {
  const res = await fetchRetry(
    `${API}/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`,
    {
      headers: headers(token),
    },
  );
  if (!res.ok) throw new Error(`GHL messages ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { messages?: { messages?: GhlMessage[] } | GhlMessage[] };
  const arr = Array.isArray(j.messages) ? j.messages : (j.messages?.messages ?? []);
  return arr.filter((m) => !m.messageType || /email/i.test(m.messageType));
}

/** Full email (subject/body/status) by its email-message id. */
export async function ghlEmail(
  token: string,
  emailMessageId: string,
): Promise<{ subject: string; body: string; status: string; from: string } | null> {
  const res = await fetchRetry(
    `${API}/conversations/messages/email/${encodeURIComponent(emailMessageId)}`,
    {
      headers: headers(token),
    },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as {
    subject?: string;
    body?: string;
    status?: string;
    from?: string;
  };
  return {
    subject: j.subject || "",
    body: j.body || "",
    status: (j.status || "").toLowerCase(),
    from: j.from || "",
  };
}

/** Strip HTML and quoted history from a reply body. */
export function ghlPlainText(body: string): string {
  const txt = (body || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "");
  const lines = txt.split("\n");
  const cut = lines.findIndex(
    (l) =>
      /^On .+wrote:$/.test(l.trim()) ||
      /^-{2,}\s*Original Message/i.test(l) ||
      /^From: .+/.test(l.trim()),
  );
  return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trim();
}

export const GHL_BOUNCE_STATUSES = new Set([
  "bounced",
  "undelivered",
  "failed",
  "complained",
  "rejected",
]);
