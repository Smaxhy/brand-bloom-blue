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
    body: JSON.stringify({ people, useClaude: false, findInstagram: true, ...options }),
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

  it("5 — the broader search runs only when Instagram answered with no profile at all, and a name-only match is marked 'likely'", async () => {
    const s = serper((q) => (q.startsWith("site:instagram.com") ? [] : [profile("joesroofing", "Joe's Roofing", "Quality roofs. Free quotes.")]));
    const { results } = await reveal([joe]);
    expect(s.igAsked()).toEqual(["site:instagram.com Joe's Roofing Denver", "Joe's Roofing Denver instagram"]);
    expect(results[0].instagramSearches).toBe(2);
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

  it("10 — when Instagram answers with profiles and none is theirs, no second search is paid for", async () => {
    // The usual case for a business that has no Instagram: other roofers come back. Asking again finds the same.
    const s = serper(() => [
      profile("eliteroofingdenver", "Elite Roofing Denver", "Denver CO roofing contractor"),
      profile("denverroofingpros", "Denver Roofing Pros", "Best roofers in Denver"),
    ]);
    const { results } = await reveal([joe]);
    expect(results[0].instagram).toBe("");
    expect(s.igAsked()).toEqual(["site:instagram.com Joe's Roofing Denver"]);
    expect(results[0].instagramSearches).toBe(1);
  });

  it("11 — an Instagram-only run pays for nothing else: no email search, no website search", async () => {
    const noEmail = site({ email: "" });
    const answers = (q: string) => (q.startsWith("site:instagram.com") ? [profile("joesroofing", "Joe's Roofing", "Denver roofer · joesroofing.com")] : []);
    // an ordinary reveal also searches for the address it couldn't find on the website…
    enrichSite.mockResolvedValue(noEmail);
    const full = serper(answers);
    await reveal([joe]);
    expect(full.asked.length).toBeGreaterThan(1);
    expect(full.asked.some((q) => /email/.test(q))).toBe(true);
    // …the Instagram-only run asks one thing
    enrichSite.mockResolvedValue(noEmail);
    const only = serper(answers);
    const { results } = await reveal([joe], { instagramOnly: true });
    expect(only.asked).toEqual(["site:instagram.com Joe's Roofing Denver"]);
    expect(results[0]).toMatchObject({ instagram: "https://www.instagram.com/joesroofing", instagramSearches: 1 });
    // …and a business with no website at all is not sent looking for one first
    enrichSite.mockResolvedValue(null);
    const bare = serper(() => []);
    await reveal([{ id: "b2", organizationName: "Maven Tree Services", city: "Albuquerque" }], { instagramOnly: true });
    expect(bare.asked.every((q) => /instagram/i.test(q))).toBe(true);
  });

  it("12 — a business searched for recently is not searched for again; the free sources are still read", async () => {
    const s = serper(() => [profile("joesroofing", "Joe's Roofing", "Denver roofer · joesroofing.com")]);
    const rested = await reveal([{ ...joe, igSearched: true }]);
    expect(rested.results[0].instagram).toBe("");
    expect(rested.results[0].instagramSearches).toBe(0);
    expect(s.igAsked()).toEqual([]);
    enrichSite.mockResolvedValue(site({ instagram: "https://www.instagram.com/joesroofing", instagramSure: true }));
    const free = await reveal([{ ...joe, igSearched: true }]);
    expect(free.results[0]).toMatchObject({ instagram: "https://www.instagram.com/joesroofing", instagramVia: "site", instagramSearches: 0 });
  });

  it("13 — a search account with no credits left is not counted as a search, so the business is tried again later", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: string }) => {
      asked.push(String((JSON.parse(init?.body || "{}") as { q?: string }).q || ""));
      return new Response(JSON.stringify({ message: "Not enough credits" }), { status: 400 });
    }));
    const { results, warnings } = await reveal([joe]);
    expect(results[0].instagram).toBe("");
    expect(results[0].instagramSearches).toBe(0);
    expect(asked.filter((q) => /instagram/i.test(q))).toHaveLength(1); // asked once, then left alone
    expect(warnings.join(" ")).toMatch(/no searches left/);
  });

  it("14 — a name nothing could be recognised by is not searched for", async () => {
    enrichSite.mockResolvedValue(null);
    const s = serper(() => [profile("treeservice", "Tree Service", "Trees")]);
    const { results } = await reveal([{ id: "b3", organizationName: "Tree Service", city: "Denver" }]);
    expect(s.igAsked()).toEqual([]);
    expect(results[0].instagramSearches).toBe(0);
  });

  it("15 — an account turned down by hand is passed over, on their website and in the search", async () => {
    // the website links a supplier's account; it was turned down, so the search still runs and takes the next match
    enrichSite.mockResolvedValue(site({ instagram: "https://www.instagram.com/gaf_roofing", instagramSure: true }));
    const s = serper(() => [
      profile("joesroofing", "Joe's Roofing", "Denver roofer"),
      profile("joesroofingco", "Joe's Roofing", "Denver, CO · joesroofing.com"),
    ]);
    const { results } = await reveal([{ ...joe, igNot: ["gaf_roofing", "joesroofing"] }]);
    expect(results[0]).toMatchObject({ instagram: "https://www.instagram.com/joesroofingco", instagramVia: "search" });
    expect(s.igAsked()).toHaveLength(1);
    // without the note, the website's link is taken and nothing is searched
    const t = serper(() => []);
    const plain = await reveal([joe]);
    expect(plain.results[0]).toMatchObject({ instagram: "https://www.instagram.com/gaf_roofing", instagramVia: "site" });
    expect(t.igAsked()).toEqual([]);
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
