export interface InboxIssue { level: "warn" | "block"; text: string }
/** Advisory content checks, not a prediction of inbox placement. */
export function inboxCheck(subject: string, body: string): { score: number; issues: InboxIssue[] } {
  const issues: InboxIssue[] = [];
  const text = `${subject}\n${body}`;
  if (/<(?:img|table|style|div|span)\b/i.test(body)) issues.push({ level: "block", text: "HTML or images: use a plain-text message." });
  if ((body.match(/https?:\/\/[^\s)]+/gi) ?? []).length > 1) issues.push({ level: "warn", text: "Multiple links: keep only the most relevant one." });
  if (/https?:\/\/(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|rebrand\.ly)\//i.test(body)) issues.push({ level: "block", text: "Shortened link: use the full address." });
  if (/\b(free|guarantee[ds]?|act now|limited time|click here|buy now|discount)\b/i.test(text)) issues.push({ level: "warn", text: "Promotional wording: consider a more specific, personal message." });
  if (/^(?:re|fw|fwd):/i.test(subject.trim())) issues.push({ level: "block", text: "Reply-style subject: use only for a genuine reply." });
  if (body.trim().split(/\s+/).filter(Boolean).length > 120) issues.push({ level: "warn", text: "Long message: consider shortening it." });
  if (!/\{\{(?:pitch|gap|company|first_name)(?:\}|\|)/.test(body)) issues.push({ level: "warn", text: "No recipient-specific field: consider adding a relevant detail." });
  return { score: Math.max(0, 100 - issues.reduce((sum, issue) => sum + (issue.level === "block" ? 35 : 10), 0)), issues };
}