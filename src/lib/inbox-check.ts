/**
 * Inbox check — advisory content checks for the things that push a cold email
 * toward Promotions or Spam. Not a prediction of inbox placement. Pure; used by
 * the sequence editor and by "Write with AI".
 */
export interface InboxIssue { level: "warn" | "block"; text: string }

const SPAM_WORDS =
  /\b(free|guarantee[ds]?|risk[- ]free|act now|limited time|urgent|winner|congratulations|click here|buy now|order now|cheap|discount|lowest price|double your|earn money|make money|no obligation|special promotion|exclusive deal|once in a lifetime|amazing|incredible|unbelievable|miracle)\b/gi;
const OK_CAPS = /^(LLC|HVAC|USA|CEO|ROI|SEO|PPC|CRM|SMS|FAQ|HTML|HTTPS?|LTD|BVBA)$/;

export function inboxCheck(subject: string, body: string): { score: number; issues: InboxIssue[] } {
  const issues: InboxIssue[] = [];
  const text = `${subject}\n${body}`;
  const words = body.trim().split(/\s+/).filter(Boolean).length;

  if (/<(?:img|table|style|div|span)\b/i.test(body)) issues.push({ level: "block", text: "HTML or images: use a plain-text message." });
  const links = (body.match(/https?:\/\/[^\s)]+/gi) ?? []).length;
  if (links > 1) issues.push({ level: "warn", text: `${links} links: keep only the most relevant one.` });
  if (/https?:\/\/(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|rebrand\.ly|ow\.ly|is\.gd)\//i.test(body)) issues.push({ level: "block", text: "Shortened link: use the full address." });
  const spam = Array.from(new Set((text.match(SPAM_WORDS) ?? []).map((w) => w.toLowerCase())));
  if (spam.length) issues.push({ level: spam.length > 2 ? "block" : "warn", text: `Promotional wording (${spam.slice(0, 5).join(", ")}): consider a more specific, personal message.` });
  if (/^(?:re|fw|fwd):/i.test(subject.trim())) issues.push({ level: "block", text: "Reply-style subject: use only for a genuine reply." });
  const bangs = (text.match(/!/g) ?? []).length;
  if (bangs > 1) issues.push({ level: "warn", text: `${bangs} exclamation marks: none reads more personal.` });
  const caps = (text.match(/\b[A-Z]{4,}\b/g) ?? []).filter((w) => !OK_CAPS.test(w));
  if (caps.length) issues.push({ level: "warn", text: `ALL-CAPS words (${caps.slice(0, 3).join(", ")}): write them normally.` });
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) issues.push({ level: "warn", text: "Emoji: they read as marketing in a first email." });
  if (/\$\s?\d|€\s?\d|\b\d+\s?%/.test(body)) issues.push({ level: "warn", text: "Prices or percentages: a common Promotions signal." });
  if (/\bunsubscribe\b|click (?:here|below) to/i.test(body)) issues.push({ level: "warn", text: "Newsletter wording: the footer already handles opting out; keep the body personal." });
  if (subject.trim().length > 60) issues.push({ level: "warn", text: "Subject over 60 characters: short subjects look personal." });
  if (words > 120) issues.push({ level: "warn", text: `Long message (${words} words): consider shortening it.` });
  if (!/\{\{(?:pitch|gap|company|first_name)(?:\}|\|)/.test(body)) issues.push({ level: "warn", text: "No recipient-specific field: identical bodies to many people get bulk-flagged." });
  return { score: Math.max(0, 100 - issues.reduce((sum, issue) => sum + (issue.level === "block" ? 35 : 10), 0)), issues };
}
