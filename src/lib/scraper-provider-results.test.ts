import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api-auth", () => ({
  getApiUser: vi.fn(async () => ({ id: "test-user" })),
  hasCronSecret: vi.fn(() => false),
  unauthorized: vi.fn(),
}));
vi.mock("./db", () => ({ Db: class { static available() { return true; } async rpc() { return true; } } }));
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
});