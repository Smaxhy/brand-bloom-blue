import { afterEach, describe, it, expect, vi } from "vitest";
const lookup = vi.hoisted(() => vi.fn(async () => ({ name: "Alex Smith", title: "Owner", linkedin: "https://www.linkedin.com/in/alex-smith" })));
const crawl = vi.hoisted(() => vi.fn());
vi.mock("./providers/websearch", () => ({ findOwnerLinkedin: lookup }));
vi.mock("./providers/free-enrich", async (importOriginal) => ({ ...await importOriginal<typeof import("./providers/free-enrich")>(), freeEnrich: crawl }));
afterEach(() => vi.unstubAllGlobals());
import { enrichSite } from "./enrich-site";
import type { Db } from "./db";

describe("optional LinkedIn lookup", () => {
  it("does not spend search credits when disabled on a cached profile", async () => {
    lookup.mockClear();
    const db = { one: vi.fn(async () => ({ data: { name: "Alex Smith", linkedin: "", linkedinTried: false, emailExtractionVersion: 4 } })) } as unknown as Db;
    await enrichSite({ SERPER_API_KEY: "test-only" }, { website: "example.com", company: "Example", findLinkedin: false, db });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("looks up the cached owner when explicitly enabled", async () => {
    lookup.mockClear();
    const db = { one: vi.fn(async () => ({ data: { name: "Alex Smith", linkedin: "", linkedinTried: false, emailExtractionVersion: 4 } })), upsert: vi.fn(async () => []) } as unknown as Db;
    const result = await enrichSite({ SERPER_API_KEY: "test-only" }, { website: "example.com", company: "Example", findLinkedin: true, db });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(result?.linkedin).toBe("https://www.linkedin.com/in/alex-smith");
  });
});

describe("published email recovery", () => {
  it("refreshes previously published cache addresses when business relevance filtering changes", async () => {
    crawl.mockClear();
    crawl.mockResolvedValue({ ok: true, website: "business.test", mx: true, emails: [{ email: "owner@business.test", source: "site", page: "/contact" }], names: [], socials: { linkedin: "" }, phones: [], text: "", signals: null });
    const db = { one: vi.fn(async () => ({ data: { email: "designer@agency.test", emailGuessed: false, emailExtractionVersion: 1 } })), upsert: vi.fn(async () => []) } as unknown as Db;
    const result = await enrichSite({}, { website: "business.test", company: "Business", db, useClaude: false, findLinkedin: false });
    expect(crawl).toHaveBeenCalledWith(expect.objectContaining({ companyName: "Business" }));
    expect(result?.email).toBe("owner@business.test");
  });
  it.each(["", "info@business.test"])("refreshes old incomplete or guessed cache %s for encoded published emails", async (email) => {
    crawl.mockClear();
    crawl.mockResolvedValue({ ok: true, website: "business.test", mx: true, emails: [{ email: "owner@business.test", source: "site", page: "/contact" }], names: [], socials: { linkedin: "" }, phones: [], text: "", signals: null });
    const db = { one: vi.fn(async () => ({ data: { email, emailGuessed: !!email, mx: true } })), upsert: vi.fn(async () => []) } as unknown as Db;
    const result = await enrichSite({}, { website: "business.test", db, useClaude: false, findLinkedin: false });
    expect(crawl).toHaveBeenCalledTimes(1);
    expect(result?.email).toBe("owner@business.test");
    expect(result?.emailGuessed).toBe(false);
    expect(result?.emailExtractionVersion).toBe(4);
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
describe("AI email recovery", () => {
  const claudeReply = (email: string) =>
    Response.json({ content: [{ text: JSON.stringify({ ownerName: "Alex Smith", ownerTitle: "Owner", email, need: 80, reasons: ["No online booking"], pitch: "", gap: "", siteQuality: "poor", teamSize: "1-10", revenueBand: "<250k", locations: 0, sizeConfidence: "low" }) }] });

  it("rejects an AI address that only matches part of another literal address", async () => {
    crawl.mockReset();
    crawl.mockResolvedValue({ ok: true, website: "business.test", mx: true, emails: [], names: [], socials: { linkedin: "" }, phones: [], text: "owner@business.test.attacker.com", signals: null });
    vi.stubGlobal("fetch", vi.fn(async () => claudeReply("owner@business.test")));
    expect((await enrichSite({ ANTHROPIC_API_KEY: "test-only" }, { website: "business.test", findLinkedin: false }))?.email).toBe("");
  });
  it("accepts a Claude-named email that our patterns missed when it is on the page", async () => {
    crawl.mockReset();
    crawl.mockResolvedValue({ ok: true, website: "business.test", mx: true, emails: [], names: [], socials: { linkedin: "" }, phones: [], text: "Reach us any time at hello@business.test for a quote.", signals: null });
    vi.stubGlobal("fetch", vi.fn(async () => claudeReply("hello@business.test")));
    const result = await enrichSite({ ANTHROPIC_API_KEY: "test-only" }, { website: "business.test", company: "Business", city: "Denver", findLinkedin: false });
    expect(result?.email).toBe("hello@business.test");
    expect(result?.emailGuessed).toBe(false);
  });

  it("ignores a Claude-named email that is NOT anywhere on the page (no hallucinations)", async () => {
    crawl.mockReset();
    crawl.mockResolvedValue({ ok: true, website: "business.test", mx: true, emails: [], names: [], socials: { linkedin: "" }, phones: [], text: "We fix roofs across Denver. Call today.", signals: null });
    vi.stubGlobal("fetch", vi.fn(async () => claudeReply("owner@business.test")));
    const result = await enrichSite({ ANTHROPIC_API_KEY: "test-only" }, { website: "business.test", company: "Business", city: "Denver", findLinkedin: false });
    expect(result?.email).toBe("");
  });

  it("ignores a Claude-named email on an unrelated third-party domain even if printed on the page", async () => {
    crawl.mockReset();
    crawl.mockResolvedValue({ ok: true, website: "business.test", mx: true, emails: [], names: [], socials: { linkedin: "" }, phones: [], text: "Site by hello@pixelwebstudio.com — all rights reserved.", signals: null });
    vi.stubGlobal("fetch", vi.fn(async () => claudeReply("hello@pixelwebstudio.com")));
    const result = await enrichSite({ ANTHROPIC_API_KEY: "test-only" }, { website: "business.test", company: "Business", city: "Denver", findLinkedin: false });
    expect(result?.email).toBe("");
  });
});
