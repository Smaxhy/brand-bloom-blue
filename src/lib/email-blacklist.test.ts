import { describe, expect, it, vi } from "vitest";
import { blacklistConfirmedInvalid } from "./email-blacklist.server";
import type { Db } from "./db";
describe("confirmed invalid blacklist", () => {
  it("persists a broken address before marking leads invalid", async () => {
    const db = { one: vi.fn(async () => null), insert: vi.fn(async () => []), update: vi.fn(async () => []) };
    await blacklistConfirmedInvalid(db as unknown as Db,"bad@company.test","invalid");
    expect(db.insert).toHaveBeenCalledWith("suppressions",expect.objectContaining({email:"bad@company.test",reason:"bounce"}));
    expect(db.update).toHaveBeenCalledWith("leads","email=eq.bad%40company.test",{email_verified:"invalid"});
  });
  it.each(["valid","mx_ok","risky","unknown"] as const)("does not blacklist %s results", async status => {
    const db={one:vi.fn(),insert:vi.fn(),update:vi.fn()};
    await blacklistConfirmedInvalid(db as unknown as Db,"owner@company.test",status);
    expect(db.insert).not.toHaveBeenCalled(); expect(db.update).not.toHaveBeenCalled();
  });
  it("does not report success when the blacklist cannot be saved", async () => {
    const db={one:vi.fn(async()=>null),insert:vi.fn(async()=>{throw new Error("unavailable")}),update:vi.fn()};
    await expect(blacklistConfirmedInvalid(db as unknown as Db,"bad@company.test","invalid")).rejects.toThrow("unavailable");
    expect(db.update).not.toHaveBeenCalled();
  });
});