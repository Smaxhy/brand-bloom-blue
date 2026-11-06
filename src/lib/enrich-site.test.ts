import { describe, it, expect, vi } from "vitest";
const lookup = vi.hoisted(() => vi.fn(async () => ({ name: "Alex Smith", title: "Owner", linkedin: "https://www.linkedin.com/in/alex-smith" })));
vi.mock("./providers/websearch", () => ({ findOwnerLinkedin: lookup }));
import { enrichSite } from "./enrich-site";
import type { Db } from "./db";

describe("optional LinkedIn lookup", () => {
  it("does not spend search credits when disabled on a cached profile", async () => {
    lookup.mockClear();
    const db = { one: vi.fn(async () => ({ data: { name: "Alex Smith", linkedin: "", linkedinTried: false } })) } as unknown as Db;
    await enrichSite({ SERPER_API_KEY: "test-only" }, { website: "example.com", company: "Example", findLinkedin: false, db });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("looks up the cached owner when explicitly enabled", async () => {
    lookup.mockClear();
    const db = { one: vi.fn(async () => ({ data: { name: "Alex Smith", linkedin: "", linkedinTried: false } })), upsert: vi.fn(async () => []) } as unknown as Db;
    const result = await enrichSite({ SERPER_API_KEY: "test-only" }, { website: "example.com", company: "Example", findLinkedin: true, db });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(result?.linkedin).toBe("https://www.linkedin.com/in/alex-smith");
  });
});