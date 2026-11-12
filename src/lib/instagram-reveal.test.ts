import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api-auth", () => ({
  getApiUser: vi.fn(async () => ({ id: "test-user" })),
  hasCronSecret: vi.fn(() => false),
  unauthorized: vi.fn(),
}));
vi.mock("./db", () => ({ Db: class { static available() { return true; } async rpc() { return true; } async one() { return null; } } }));
vi.mock("./integration-settings.server", () => ({ resolveIntegrationEnv: vi.fn(async (env) => env) }));
vi.mock("./request-security", () => ({ requestIpHash: vi.fn(async () => "test-ip"), securityJson: (data: unknown, status: number) => Response.json(data, { status }) }));
vi.mock("./outreach-routes", () => ({ handleOutreachRoute: vi.fn(async () => null) }));
const enrichSite = vi.hoisted(() => vi.fn());
vi.mock("./enrich-site", () => ({
  enrichSite,
  enrichMany: async (people: unknown[], _limit: number, run: (person: unknown) => Promise<void>) => {
    for (const person of people) await run(person);
  },
}));
vi.mock("./providers/free-enrich", async (importOriginal) => ({
  ...await importOriginal<typeof import("./providers/free-enrich")>(),
  freeEnrich: vi.fn(),
  hasMx: vi.fn(async () => false),
  scoreLead: vi.fn(() => ({ score: 0, reasons: [] })),
}));
const fetchPublicSite = vi.hoisted(() => vi.fn());
vi.mock("./public-site-fetch", () => ({ fetchPublicSite }));

import { handleApiRequest } from "./api-proxies";

type Person = Record<string, unknown>;
const joe: Person = { id: "b1", organizationName: "Joe's Roofing", domain: "joesroofing.com", city: "Denver, CO", phone: "(303) 555-0142" };

/** The site profile the website reader returns (an address is known, so only Instagram is still open). */
const site = (over: Record<string, unknown> = {}) => ({
  website: "joesroofing.com", mx: true, signals: null, linkedin: "", phone: "", name: "", title: "",
  email: "office@joesroofing.com", emailGuessed: false, emailPage: "/contact", names: [], ai: null, cached: false, ...over,
});
const profile = (handle: string, name: string, bio: string, followers = "2,310") => ({
  link: `https://www.instagram.com/${handle}/`,
  title: `${name} (@${handle}) • Instagram photos and videos`,
  snippet: `${followers} Followers, 400 Following, 120 Posts - ${name} (@${handle}) on Instagram: "${bio}"`,
});

/** Stub Serper: answers are picked by the query text; every query is recorded. */
function serper(answer: (q: string) => unknown[]) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: string }) => {
    const q = String((JSON.parse(init?.body || "{}") as { q?: string }).q || "");
    asked.push(q);
    return Response.json({ organic: answer(q) });
  }));
  return { asked, igAsked: () => asked.filter((q) => /instagram/i.test(q)) };
}

async function reveal(people: Person[], options: Record<string, unknown> = {}) {
  const response = await handleApiRequest(new Request("https://example.com/api/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ people, useClaude: false, ...options }),
  }), { SERPER_API_KEY: "k".repeat(40) });
  if (!response) throw new Error("Missing enrichment response");
  return (await response.json()) as { results: Record<string, unknown>[]; warnings: string[] };
}

beforeEach(() => {
  enrichSite.mockReset();
  enrichSite.mockResolvedValue(site());
  fetchPublicSite.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("finding a business's Instagram during a reveal", () => {
  it("1 — the listing's own Instagram link is used as is: no search is spent", async () => {
    const s = serper(() => []);
    const { results } = await reveal([{ ...joe, instagram: "https://www.instagram.com/joesroofingdenver/?hl=en" }]);
    expect(results[0]).toMatchObject({ instagram: "https://www.instagram.com/joesroofingdenver", instagramVia: "listing", instagramSure: true });
    expect(s.igAsked()).toEqual([]);
  });

  it("2 — the profile their website links to is used: no search is spent", async () => {
    enrichSite.mockResolvedValue(site({ instagram: "https://www.instagram.com/mile_high_roofs", instagramSure: true, instagramWhy: "the only Instagram profile their website links to" }));
    const s = serper(() => []);
    const { results } = await reveal([joe]);
    expect(results[0]).toMatchObject({ instagram: "https://www.instagram.com/mile_high_roofs", instagramVia: "site", instagramSure: true, instagramWhy: "the only Instagram profile their website links to" });
    expect(s.igAsked()).toEqual([]);
  });

  it("3 — a link-in-bio page from the listing is read for it", async () => {
    fetchPublicSite.mockResolvedValue({ html: '<a href="https://www.instagram.com/joesroofingdenver">Instagram</a><a href="https://www.instagram.com/linktree">Linktree</a>', finalUrl: "https://linktr.ee/joesroofing" });
    enrichSite.mockResolvedValue(null);
    const s = serper(() => []);
    const { results } = await reveal([{ id: "b1", organizationName: "Joe's Roofing", city: "Denver", bioLink: "https://linktr.ee/joesroofing" }]);
    expect(fetchPublicSite).toHaveBeenCalledWith("https://linktr.ee/joesroofing", expect.any(Number), expect.anything());
    expect(results[0]).toMatchObject({ instagram: "https://www.instagram.com/joesroofingdenver", instagramVia: "bio" });
    expect(s.igAsked()).toEqual([]);
  });

  it("4 — otherwise it searches, and takes the profile whose bio shows their website (one search)", async () => {
    const s = serper((q) => (q.startsWith("site:instagram.com") ? [
      profile("joesroofingtx", "Joe's Roofing Texas", "Houston's roofer"),
      profile("mile_high_roofs", "Mile High Roofs", "Denver roof repair · joesroofing.com", "12.4K"),
    ] : []));
    const { results } = await reveal([joe]);
    expect(results[0]).toMatchObject({ instagram: "https://www.instagram.com/mile_high_roofs", instagramVia: "search", instagramSure: true, instagramFollowers: 12400 });
    expect(s.igAsked()).toEqual(["site:instagram.com Joe's Roofing Denver"]);
  });

  it("5 — the broader search runs only when the precise one found nothing, and a name-only match is marked 'likely'", async () => {
    const s = serper((q) => (q.startsWith("site:instagram.com") ? [] : [profile("joesroofing", "Joe's Roofing", "Quality roofs. Free quotes.")]));
    const { results } = await reveal([joe]);
    expect(s.igAsked()).toEqual(["site:instagram.com Joe's Roofing Denver", '"Joe\'s Roofing" Denver instagram']);
    expect(results[0]).toMatchObject({ instagram: "https://www.instagram.com/joesroofing", instagramSure: false, instagramVia: "search" });
    expect(String(results[0].instagramWhy)).toMatch(/check it's the right business/);
  });

  it("6 — someone else's profile is never passed off as theirs", async () => {
    serper(() => [
      profile("eliteroofingdenver", "Elite Roofing Denver", "Denver CO roofing contractor"),
      { link: "https://www.instagram.com/explore/tags/joesroofing/", title: "#joesroofing", snippet: "12 posts" },
      { link: "https://www.instagram.com/p/Cabc/", title: "Instagram", snippet: "New roof!" },
    ]);
    const { results } = await reveal([joe]);
    expect(results[0].instagram).toBe("");
    expect(results[0].instagramVia).toBe("");
  });

  it("7 — a person with no business name is not searched for", async () => {
    const s = serper(() => [profile("janedoe", "Jane Doe", "hi")]);
    const { results } = await reveal([{ id: "p1", name: "Jane Doe", domain: "joesroofing.com" }]);
    expect(results[0].instagram).toBe("");
    expect(s.igAsked()).toEqual([]);
  });

  it("8 — with the Instagram search switched off no search credit is spent; the free sources still work", async () => {
    const s = serper(() => [profile("joesroofing", "Joe's Roofing", "Denver roofer · joesroofing.com")]);
    const off = await reveal([joe], { findInstagram: false });
    expect(off.results[0].instagram).toBe("");
    expect(s.igAsked()).toEqual([]);
    enrichSite.mockResolvedValue(site({ instagram: "https://www.instagram.com/joesroofing", instagramSure: true }));
    const free = await reveal([joe], { findInstagram: false });
    expect(free.results[0]).toMatchObject({ instagram: "https://www.instagram.com/joesroofing", instagramVia: "site" });
    expect(s.igAsked()).toEqual([]);
  });

  it("9 — a business that already has an email still gets its Instagram looked up", async () => {
    // (the earlier version only searched for businesses without an email)
    const s = serper((q) => (q.startsWith("site:instagram.com") ? [profile("joesroofing", "Joe's Roofing", "Denver roofer · joesroofing.com")] : []));
    const { results } = await reveal([joe]);
    expect(results[0].email).toBe("office@joesroofing.com");
    expect(results[0].instagram).toBe("https://www.instagram.com/joesroofing");
    expect(s.igAsked()).toHaveLength(1);
  });
});
