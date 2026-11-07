import { describe, expect, it } from "vitest";
import { cleanDuplicateEmails } from "./email-cleanup";
import type { RawBusiness } from "./store";
const row = (id: string, email: string, extra: Partial<RawBusiness> = {}): RawBusiness => ({ id, email, business: "Business", phone: "", website: "", city: "", industry: "", status: "raw", scrapedAt: 1, ...extra });
describe("automatic duplicate email cleanup", () => {
  it("removes case and whitespace duplicate email entries", () => {
    const result = cleanDuplicateEmails([row("a", " Owner@Company.test "), row("b", "owner@company.test")]);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("owner@company.test");
  });
  it("keeps sent contact identity and merges missing details", () => {
    const result = cleanDuplicateEmails([row("new", "a@company.test", { phone: "123", lastEmailedAt: 10 }), row("sent", "a@company.test", { lastEmailedAt: 20, status: "accepted" })]);
    expect(result[0]).toMatchObject({ id: "sent", status: "accepted", phone: "123", lastEmailedAt: 20 });
  });
  it("keeps distinct addresses and contacts without addresses", () => {
    expect(cleanDuplicateEmails([row("a", ""),row("b", ""),row("c", "a@company.test"),row("d", "b@company.test")])).toHaveLength(4);
  });
});