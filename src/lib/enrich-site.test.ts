import { describe, it, expect, vi } from "vitest";
const lookup = vi.hoisted(() => vi.fn(async () => ({ name: "Alex Smith", title: "Owner", linkedin: "https://www.linkedin.com/in/alex-smith" })));
const crawl = vi.hoisted(() => vi.fn());
vi.mock("./providers/websearch", () => ({ findOwnerLinkedin: lookup }));
vi.mock("./providers/free-enrich", () => ({ freeEnrich: crawl }));
import { enrichSite } from "./enrich-site";
import type { Db } from "./db";

describe("optional LinkedIn lookup", () => {
  it("does not spend search credits when disabled on a cached profile", async () => {
    lookup.mockClear();
    const db = { one: vi.fn(async () => ({ data: { name: "Alex Smith", linkedin: "", linkedinTried: false, emailExtractionVersion: 1 } })) } as unknown as Db;
    await enrichSite({ SERPER_API_KEY: "test-only" }, { website: "example.com", company: "Example", findLinkedin: false, db });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("looks up the cached owner when explicitly enabled", async () => {
    lookup.mockClear();
    const db = { one: vi.fn(async () => ({ data: { name: "Alex Smith", linkedin: "", linkedinTried: false, emailExtractionVersion: 1 } })), upsert: vi.fn(async () => []) } as unknown as Db;
    const result = await enrichSite({ SERPER_API_KEY: "test-only" }, { website: "example.com", company: "Example", findLinkedin: true, db });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(result?.linkedin).toBe("https://www.linkedin.com/in/alex-smith");
  });
});

describe("published email recovery", () => {
  it.each(["", "info@business.test"])("refreshes old incomplete or guessed cache %s for encoded published emails", async (email) => {
    crawl.mockClear();
    crawl.mockResolvedValue({ ok: true, website: "business.test", mx: true, emails: [{ email: "owner@business.test", source: "site", page: "/contact" }], names: [], socials: { linkedin: "" }, phones: [], text: "", signals: null });
    const db = { one: vi.fn(async () => ({ data: { email, emailGuessed: !!email, mx: true } })), upsert: vi.fn(async () => []) } as unknown as Db;
    const result = await enrichSite({}, { website: "business.test", db, useClaude: false, findLinkedin: false });
    expect(crawl).toHaveBeenCalledTimes(1);
    expect(result?.email).toBe("owner@business.test");
    expect(result?.emailGuessed).toBe(false);
    expect(result?.emailExtractionVersion).toBe(1);
  });
  it.each(["owner@business.test", "local.business@gmail.com"])("keeps published %s even when website MX is absent", async (email) => {
    crawl.mockResolvedValue({ ok: true, website: "business.test", mx: false, emails: [{ email, source: "site", page: "/contact" }], names: [], socials: { linkedin: "" }, phones: [], text: "", signals: null });
    const result = await enrichSite({}, { website: "business.test", useClaude: false, findLinkedin: false });
    expect(result?.email).toBe(email);
    expect(result?.emailGuessed).toBe(false);
    expect(result?.mx).toBe(false);
  });
  it("re-crawls old empty profiles affected by the MX email suppression", async () => {
    crawl.mockClear();
    crawl.mockResolvedValue({ ok: true, website: "business.test", mx: false, emails: [{ email: "published@gmail.com", source: "site", page: "/" }], names: [], socials: { linkedin: "" }, phones: [], text: "", signals: null });
    const db = { one: vi.fn(async () => ({ data: { email: "", mx: false } })), upsert: vi.fn(async () => []) } as unknown as Db;
    const result = await enrichSite({}, { website: "business.test", db, useClaude: false, findLinkedin: false });
    expect(crawl).toHaveBeenCalledTimes(1);
    expect(result?.email).toBe("published@gmail.com");
  });
});