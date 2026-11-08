import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api-auth", () => ({
  getApiUser: vi.fn(async () => ({ id: "test-user" })),
  hasCronSecret: vi.fn(() => false),
  unauthorized: vi.fn(),
}));
vi.mock("./db", () => ({ Db: class { static available() { return true; } async rpc() { return true; } async one() { return null; } } }));
vi.mock("./integration-settings.server", () => ({ resolveIntegrationEnv: vi.fn(async (env) => env) }));
vi.mock("./request-security", () => ({ requestIpHash: vi.fn(async () => "test-ip"), securityJson: (data: unknown, status: number) => Response.json(data, { status }) }));
vi.mock("./outreach-routes", () => ({ handleOutreachRoute: vi.fn(async () => null) }));
vi.mock("./enrich-site", () => ({
  enrichSite: vi.fn(async () => null),
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

import { handleApiRequest } from "./api-proxies";

async function reveal() {
  const response = await handleApiRequest(new Request("https://example.com/api/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ people: [{ id: "business-1", organizationName: "Holiday Lighting Co" }], usePaid: true, useClaude: false }),
  }), { SERPAPI_API_KEY: "a".repeat(64) });
  if (!response) throw new Error("Missing enrichment response");
  return response.json();
}

afterEach(() => vi.unstubAllGlobals());

describe("scraper provider result handling", () => {
  it.each([true, false])("walks Serper then Brave then paid-only SerpApi: %s", async (usePaid) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("serper.dev")) return Response.json({ message: "Not enough credits" }, { status: 400 });
      if (String(url).includes("search.brave.com")) return Response.json({ message: "monthly quota exhausted" }, { status: 429 });
      return Response.json({ organic_results: [{ link: "https://holidaylightingco.com", snippet: "hello@holidaylightingco.com" }] });
    }));
    const response = await handleApiRequest(new Request("https://example.com/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people: [{ id: "b1", organizationName: "Holiday Lighting Co" }], usePaid, useClaude: false }),
    }), { SERPER_API_KEY: "test-serper", BRAVE_SEARCH_API_KEY: "test-brave", SERPAPI_API_KEY: "test-serpapi" });
    if (!response) throw new Error("Missing response");
    const result = await response.json();
    const searches = calls.filter((url) => /serper.dev|search.brave.com|serpapi.com/.test(url));
    expect(searches[0]).toContain("serper.dev");
    expect(searches[1]).toContain("search.brave.com");
    expect(calls.some((url) => url.includes("serpapi.com"))).toBe(usePaid);
    expect(result.results[0].email).toBe(usePaid ? "hello@holidaylightingco.com" : "");
  });
  it("recovers a business email through Brave after Serper exhaustion", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("serper.dev")
      ? Response.json({ message: "no credits" }, { status: 400 })
      : Response.json({ web: { results: [{ url: "https://holidaylightingco.com", description: "hello@holidaylightingco.com" }] } })));
    const response = await handleApiRequest(new Request("https://example.com/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people: [{ id: "b1", organizationName: "Holiday Lighting Co" }], useClaude: false }),
    }), { SERPER_API_KEY: "test-serper", BRAVE_SEARCH_API_KEY: "test-brave" });
    if (!response) throw new Error("Missing response");
    expect((await response.json()).results[0].email).toBe("hello@holidaylightingco.com");
  });
  it("keeps the business domain instead of provider metadata links", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      organic_results: [{ link: "https://holidaylighting.example/contact", title: "Holiday Lighting Co", snippet: "Contact hello@holidaylighting.example", serpapi_link: "https://serpapi.com/search.json" }],
      knowledge_graph: { serpapi_link: "https://serpapi.com/search.json", thumbnail: "https://googleusercontent.com/image.jpg" },
    })));
    const result = await reveal();
    expect(result.results[0].website).toBe("holidaylighting.example");
    expect(result.results[0].email).toBe("hello@holidaylighting.example");
    expect(result.warnings).toEqual([]);
  });

  it("reports quota refusal once without fabricating a website or email", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota exhausted", { status: 429 })));
    const result = await reveal();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("SerpApi:");
    expect(result.results[0].website).toBe("");
    expect(result.results[0].email).toBe("");
  });

  it("does not expose raw provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Plan limit exceeded: private diagnostic value" })));
    const result = await reveal();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).not.toContain("private diagnostic value");
  });
  it("stops asking Serper once the account has no searches left (one warning, no call per business)", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("serper.dev")
        ? new Response(JSON.stringify({ message: "Not enough credits", statusCode: 400 }), { status: 400 })
        : Response.json({}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const people = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, organizationName: `Business ${i}` }));
    const response = await handleApiRequest(new Request("https://example.com/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people, useClaude: false }),
    }), { SERPER_API_KEY: "s".repeat(40) });
    if (!response) throw new Error("Missing enrichment response");
    const result = await response.json();
    const serperCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("serper.dev")).length;
    expect(serperCalls).toBe(1);
    expect(result.warnings).toEqual([expect.stringMatching(/no searches left on your Serper account/)]);
  });

  it.each([true, false])("uses SerpApi fallback only when Paid fallback is %s", async (usePaid) => {
    const fetchMock = vi.fn(async (url: string) => String(url).includes("serper.dev")
      ? new Response(JSON.stringify({ message: "Not enough credits" }), { status: 400 })
      : Response.json({ organic_results: [{ link: "https://holidaylightingco.com/", title: "Holiday Lighting Co", snippet: "hello@holidaylightingco.com" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleApiRequest(new Request("https://example.com/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ people: [{ id: "b1", organizationName: "Holiday Lighting Co" }], usePaid, useClaude: false }),
    }), { SERPER_API_KEY: "s".repeat(40), SERPAPI_API_KEY: "a".repeat(64) });
    if (!response) throw new Error("Missing enrichment response");
    const result = await response.json();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("serper.dev"))).toHaveLength(1);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("serpapi.com"))).toBe(usePaid);
    expect(result.results[0].email).toBe(usePaid ? "hello@holidaylightingco.com" : "");
  });
});
