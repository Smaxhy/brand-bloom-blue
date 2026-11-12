/**
 * Gmail API helpers: build an RFC 822 message and send it, list recent inbox
 * messages, read headers. Works entirely over HTTPS from the Worker.
 */

export interface OutgoingMail {
  deadline?: number;
  from: { name: string; email: string };
  to: { name: string; email: string };
  subject: string;
  text: string;
  html: string;
  /** For follow-ups: keep the conversation in the same Gmail thread. */
  threadId?: string;
  inReplyTo?: string; // RFC Message-ID of the first message
  unsubscribeUrl?: string;
  unsubscribeMailto?: string;
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 2047 encode a header value when it has non-ASCII characters. */
function hdr(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${btoa(unescape(encodeURIComponent(v)))}?=`;
}

function addr(a: { name: string; email: string }): string {
  return a.name ? `${hdr(a.name.replace(/[<>"]/g, ""))} <${a.email}>` : a.email;
}

export function newMessageId(domain: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "");
  return `<${Date.now().toString(36)}.${rand}@${domain}>`;
}

export function buildMime(m: OutgoingMail, messageId: string): string {
  const boundary = `b_${crypto.randomUUID().replace(/-/g, "")}`;
  const lines = [
    `From: ${addr(m.from)}`,
    `To: ${addr(m.to)}`,
    `Subject: ${hdr(m.subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];
  if (m.inReplyTo) {
    lines.push(`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`);
  }
  if (m.unsubscribeUrl) {
    const parts = [`<${m.unsubscribeUrl}>`];
    if (m.unsubscribeMailto) parts.push(`<mailto:${m.unsubscribeMailto}?subject=unsubscribe>`);
    lines.push(
      `List-Unsubscribe: ${parts.join(", ")}`,
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    );
  }
  if (!m.html) {
    // Text-only: a single text/plain part, which is what a person's mail client sends.
    lines.push(
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      m.text,
      "",
    );
    return lines.join("\r\n");
  }
  lines.push(
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    m.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    m.html,
    "",
    `--${boundary}--`,
    "",
  );
  return lines.join("\r\n");
}

export async function gmailSend(
  accessToken: string,
  m: OutgoingMail,
  messageId: string,
): Promise<{ id: string; threadId: string }> {
  const raw = b64url(buildMime(m, messageId));
  const body: Record<string, string> = { raw };
  if (m.threadId) body.threadId = m.threadId;
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // A hung send must end well within the mailbox's send lease.
    signal: AbortSignal.timeout(Math.max(1, Math.min(12_000, (m.deadline ?? Date.now() + 12_000) - Date.now()))),
  });
  if (!res.ok) throw new Error(`gmail send ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { id: string; threadId: string };
  return { id: j.id, threadId: j.threadId };
}

/**
 * A failed Gmail READ as "gmail <what> <status>: <reason code>" — Google's short
 * machine reason (insufficientPermissions, accessNotConfigured, …) so the app
 * can say what to do, never the provider's full error text.
 */
async function gmailReadError(what: string, res: Response): Promise<Error> {
  let reason = "";
  try {
    const j = JSON.parse((await res.text()).slice(0, 6000)) as {
      error?: { status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] };
    };
    reason =
      j.error?.errors?.find((e) => e.reason)?.reason ||
      j.error?.details?.find((d) => d.reason)?.reason ||
      j.error?.status ||
      "";
  } catch {
    /* no readable body: the status alone */
  }
  const code = String(reason).replace(/[^\w.-]/g, "").slice(0, 60);
  return new Error(`gmail ${what} ${res.status}${code ? `: ${code}` : ""}`);
}

export interface GmailHeaderMsg {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  inReplyTo: string;
  references: string;
  failedRecipients: string;
  autoSubmitted: string;
  internalDate: number;
  labelIds: string[];
}

/** New inbox messages (replies + bounces land here). q defaults to the last 2 days. */
export async function gmailListRecent(
  accessToken: string,
  q = "in:inbox newer_than:2d",
  max = 50,
): Promise<string[]> {
  const u = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  u.searchParams.set("q", q);
  u.searchParams.set("maxResults", String(max));
  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw await gmailReadError("list", res);
  const j = (await res.json()) as { messages?: { id: string }[] };
  return (j.messages ?? []).map((m) => m.id);
}

const HEADER_NAMES = ["From", "Subject", "In-Reply-To", "References", "X-Failed-Recipients", "Auto-Submitted"];

type RawGmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: { name: string; value: string }[] };
};

function toHeaderMsg(j: RawGmailMessage): GmailHeaderMsg {
  const get = (n: string) =>
    j.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
  return {
    id: j.id,
    threadId: j.threadId,
    snippet: j.snippet ?? "",
    from: get("From"),
    subject: get("Subject"),
    inReplyTo: get("In-Reply-To"),
    references: get("References"),
    failedRecipients: get("X-Failed-Recipients"),
    autoSubmitted: get("Auto-Submitted"),
    internalDate: Number(j.internalDate ?? 0),
    labelIds: j.labelIds ?? [],
  };
}

export async function gmailGetHeaders(
  accessToken: string,
  id: string,
): Promise<GmailHeaderMsg | null> {
  const u = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
  u.searchParams.set("format", "metadata");
  for (const h of HEADER_NAMES) u.searchParams.append("metadataHeaders", h);
  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return toHeaderMsg((await res.json()) as RawGmailMessage);
}

/**
 * Every message matching `q` (newest first), page by page, up to `max`.
 * `more` = there were more than `max`.
 */
export async function gmailListAll(
  accessToken: string,
  q: string,
  max = 2000,
): Promise<{ items: { id: string; threadId: string }[]; more: boolean }> {
  const items: { id: string; threadId: string }[] = [];
  let pageToken = "";
  for (;;) {
    const u = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    u.searchParams.set("q", q);
    u.searchParams.set("maxResults", String(Math.max(1, Math.min(500, max - items.length))));
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw await gmailReadError("list", res);
    const j = (await res.json()) as { messages?: { id: string; threadId: string }[]; nextPageToken?: string };
    items.push(...(j.messages ?? []));
    if (!j.nextPageToken) return { items, more: false };
    if (items.length >= max) return { items, more: true };
    pageToken = j.nextPageToken;
  }
}

/** All messages of one conversation (headers only). A thread that no longer exists → null. */
export async function gmailThreadHeaders(accessToken: string, threadId: string): Promise<GmailHeaderMsg[] | null> {
  const u = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`);
  u.searchParams.set("format", "metadata");
  for (const h of HEADER_NAMES) u.searchParams.append("metadataHeaders", h);
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await gmailReadError("thread", res);
  const j = (await res.json()) as { messages?: RawGmailMessage[] };
  return (j.messages ?? []).map(toHeaderMsg);
}

/** Gmail search for anything that looks like a bounce (delivery failure) notice. */
export const GMAIL_BOUNCE_QUERY =
  '{from:mailer-daemon from:postmaster subject:undeliverable subject:"delivery status notification" subject:"returned mail" subject:"delivery failure" subject:"mail delivery failed" subject:"undelivered mail" subject:"failure notice"}';

export function isBounce(m: GmailHeaderMsg): boolean {
  return (
    /mailer-daemon|postmaster/i.test(m.from) ||
    !!m.failedRecipients ||
    /delivery status notification|undeliverable|returned mail/i.test(m.subject)
  );
}

export function isAutoReply(m: GmailHeaderMsg): boolean {
  return (
    (!!m.autoSubmitted && m.autoSubmitted.toLowerCase() !== "no") ||
    /out of office|automatic reply|auto-reply|autoreply|away from/i.test(m.subject)
  );
}

/** Same test as isAutoReply, for channels that only give us subject + body. */
export function isAutoReplyText(subject: string, body: string): boolean {
  return (
    /out of office|automatic reply|auto-reply|autoreply|away from/i.test(subject) ||
    /^(thank you for your (e-?mail|message)|i am (currently )?out of (the )?office|i'm (currently )?out of (the )?office)/i.test(
      body.trim(),
    )
  );
}

export function wantsToStop(text: string): boolean {
  if (
    /\b(unsubscribe|remove me|stop (emailing|contacting)|take me off|not interested|opt out|opt-out|do not (email|contact)|uitschrijven|niet ge[iï]nteresseerd|geen interesse|désinscrire|pas intéressé)\b/i.test(
      text,
    )
  )
    return true;
  // The sentence-style opt-out asks them to reply "no": a bare no/nee/non counts.
  const first =
    (text || "")
      .replace(/^(re|fwd?|aw|antw):\s*/i, "")
      .split(/\n/)
      .map((l) => l.trim())
      .find((l) => l && !/^(re|fwd?):/i.test(l)) || "";
  return /^(no|nope|nee|neen|non|nein|no thanks|no thank you|nee bedankt|nee dank je)[.!\s]*$/i.test(
    first,
  );
}

/** Full message: headers + readable text body (plain part preferred, else stripped HTML). */
export async function gmailGetFull(
  accessToken: string,
  id: string,
): Promise<(GmailHeaderMsg & { messageIdHeader: string; text: string }) | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) return null;
  type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
  const j = (await res.json()) as {
    id: string;
    threadId: string;
    snippet?: string;
    internalDate?: string;
    labelIds?: string[];
    payload?: Part & { headers?: { name: string; value: string }[] };
  };
  const get = (n: string) =>
    j.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
  const decode = (b64: string) => {
    try {
      const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return "";
    }
  };
  let plain = "";
  let html = "";
  const walk = (p?: Part) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !plain) plain = decode(p.body.data);
    if (p.mimeType === "text/html" && p.body?.data && !html) html = decode(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(j.payload);
  let text =
    plain ||
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
  // Trim quoted history ("On … wrote:", "> ")
  text = text.split(/\r?\n(?:On .{0,120}wrote:|-----Original Message-----|From: )/)[0];
  text = text
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith(">"))
    .join("\n")
    .trim()
    .slice(0, 4000);
  return {
    id: j.id,
    threadId: j.threadId,
    snippet: j.snippet ?? "",
    from: get("From"),
    subject: get("Subject"),
    inReplyTo: get("In-Reply-To"),
    references: get("References"),
    failedRecipients: get("X-Failed-Recipients"),
    autoSubmitted: get("Auto-Submitted"),
    internalDate: Number(j.internalDate ?? 0),
    labelIds: j.labelIds ?? [],
    messageIdHeader: get("Message-ID"),
    text,
  };
}
