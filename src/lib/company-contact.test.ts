import { describe, expect, it, vi } from "vitest";
import { companyAlreadyContacted } from "./company-contact";

describe("company history boundaries", () => {
  it("finds contacts beyond the first 100 company leads", async () => {
    const select = vi.fn(async (_table: string, query: string) => query.includes("offset=0")
      ? Array.from({ length: 100 }, (_, i) => ({ id: `older-${i}` })) : [{ id: "older-101" }]);
    const one = vi.fn(async (table: string, query: string) => table === "enrollments" && query.includes("older-101")
      ? { lead_id: "older-101", sent_at: new Date().toISOString() } : null);
    const db = { select, one } as unknown as Parameters<typeof companyAlreadyContacted>[0];
    expect(await companyAlreadyContacted(db, { id: "new", domain: "business.com" }, { includeNotStarted: true })).toEqual({ reason: "someone else at this company is already in a sequence" });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("propagates unavailable history rather than allowing contact", async () => {
    const db = { select: vi.fn(async () => { throw new Error("unavailable"); }), one: vi.fn() } as unknown as Parameters<typeof companyAlreadyContacted>[0];
    await expect(companyAlreadyContacted(db, { id: "new", domain: "business.com" })).rejects.toThrow("unavailable");
  });
});