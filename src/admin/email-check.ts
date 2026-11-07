import type { VerifyStatus } from "@/lib/bounce";
export type EmailCheckStatus = VerifyStatus;
export const emailCheckLabel: Record<EmailCheckStatus, string> = { valid: "Confirmed", invalid: "Invalid", risky: "Risky", mx_ok: "Domain accepts mail", unknown: "Unconfirmed" };
export async function checkEmailBatches(emails: string[], check: (emails: string[]) => Promise<{ results: Record<string, EmailCheckStatus>; unchecked: string[] }>) {
  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const results: Record<string, EmailCheckStatus> = {};
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = await check(unique.slice(offset, offset + 50));
    Object.assign(results, batch.results);
  }
  return { results, unchecked: unique.filter((email) => !results[email]) };
}