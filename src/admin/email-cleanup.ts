import type { RawBusiness } from "./store";

/** Keep the most important contact row; never touch outreach/message history. */
export function cleanDuplicateEmails(rows: RawBusiness[]): RawBusiness[] {
  const output: RawBusiness[] = [];
  const byEmail = new Map<string, number>();
  const importance = (row: RawBusiness) => (row.lastEmailedAt ? 4 : 0) +
    (row.status === "accepted" ? 2 : row.status === "rejected" ? 1 : 0);
  for (const row of rows) {
    const email = (row.email || "").trim().toLowerCase().replace(/^mailto:/, "");
    const index = email ? byEmail.get(email) : undefined;
    if (index === undefined) {
      if (email) byEmail.set(email, output.length);
      output.push({ ...row, email });
      continue;
    }
    const previous = output[index];
    const preferred = importance(row) > importance(previous) ? row : previous;
    const other = preferred === row ? previous : row;
    const merged = { ...preferred, email };
    for (const field of ["business", "phone", "website", "city", "industry", "contactName", "contactTitle", "linkedin", "emailSource", "source"] as const) {
      if (!merged[field] && other[field]) merged[field] = other[field];
    }
    merged.lastEmailedAt = Math.max(previous.lastEmailedAt || 0, row.lastEmailedAt || 0) || undefined;
    merged.rating ??= other.rating;
    merged.reviews ??= other.reviews;
    merged.score ??= other.score;
    merged.scoreWhy ??= other.scoreWhy;
    merged.ai ??= other.ai;
    output[index] = merged;
  }
  return output;
}