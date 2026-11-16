import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api-auth", () => ({
  getApiUser: vi.fn(async () => ({ id: "test-user" })),
  hasCronSecret: vi.fn(() => false),
  unauthorized: vi.fn(() => new Response("no", { status: 401 })),
}));
vi.mock("./db", () => ({
  Db: class {
    static available() {
      return true;
    }
    async rpc() {
      return true;
    }
    async one() {
      return null;
    }
  },
}));
vi.mock("./integration-settings.server", () => ({
  resolveIntegrationEnv: vi.fn(async (env) => env),
}));
vi.mock("./request-security", () => ({
  requestIpHash: vi.fn(async () => "test-ip"),
  securityJson: (data: unknown, status: number) => Response.json(data, { status }),
}));
vi.mock("./outreach-routes", () => ({ handleOutreachRoute: vi.fn(async () => null) }));
const seen = vi.hoisted(() => ({
  hide: vi.fn(
    async (_db: unknown, list: unknown[], _opts: { hideSeen: boolean; since?: string | null }) => ({
      kept: list,
      notes: [] as string[],
    }),
  ),
  remember: vi.fn(async (_db: unknown, _list: unknown[]) => undefined),
}));
vi.mock("./seen-businesses", () => ({
  hideSeenBusinesses: seen.hide,
  rememberBusinesses: seen.remember,
}));
const reader = vi.hoisted(() => ({ freeEnrich: vi.fn() }));
vi.mock("./providers/free-enrich", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./providers/free-enrich")>()),
  freeEnrich: reader.freeEnrich,
}));

import { handleApiRequest } from "./api-proxies";

const SHOP = `<html><head><meta property="og:site_name" content="Kaiju Clothing"></head><body><script>Shopify.shop = "k.myshopify.com";</script></body></html>`;
const shop = (website: string) => ({
  ok: true,
  website,
  text: "",
  emails: [{ email: `hello@${website}`, source: "site", page: "/pages/contact", mx: true }],
  phones: [],
  socials: { linkedin: "", facebook: "", instagram: "", tiktok: "", youtube: "" },
  ig: null,
  names: [],
  mx: true,
  pages: ["/"],
  signals: {},
  pagesHtml: [{ path: "/", html: SHOP }],
});

async function step(body: Record<string, unknown>, env: Record<string, string>) {
  const response = await handleApiRequest(
    new Request("https://example.com/api/discover/ecom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
  if (!response) throw new Error("Missing ecom response");
  return { status: response.status, data: await response.json() };
}

beforeEach(() => {
  seen.hide.mockClear();
  seen.remember.mockClear();
  reader.freeEnrich.mockReset();
  reader.freeEnrich.mockImplementation(async ({ website }: { website: string }) => shop(website));
});
afterEach(() => vi.unstubAllGlobals());

describe("the ecom scan route", () => {
  it("runs one Serper search for the step, with its page and country, then reads the shops", async () => {
    const sent: { url: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        sent.push({ url: String(url), body: String(init?.body ?? "") });
        return Response.json({
          organic: [
            {
              link: "https://kaijuclothing.com/collections/all",
              title: "Kaiju Clothing",
              snippet: "Anime streetwear.",
            },
            { link: "https://www.amazon.com/s?k=soap", title: "Amazon" },
          ],
        });
      }),
    );
    // Step 6 of a typed niche is the second page of its second search.
    const { status, data } = await step(
      {
        niche: "handmade soap",
        market: "gb",
        source: "stores",
        step: 6,
        since: "2026-11-16T00:00:00.000Z",
      },
      {
        SERPER_API_KEY: "test-serper",
        BRAVE_SEARCH_API_KEY: "test-brave",
        SERPAPI_API_KEY: "test-serpapi",
      },
    );
    expect(status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://google.serper.dev/search");
    expect(JSON.parse(sent[0].body)).toEqual({
      q: 'handmade soap ("add to basket" OR "add to cart") -amazon -etsy -ebay -aliexpress -temu -walmart',
      num: 10,
      page: 2,
      gl: "gb",
    });
    expect(data).toMatchObject({ searches: 1, done: false, stopped: false, warnings: [] });
    expect(data.brands).toHaveLength(1);
    expect(data.brands[0]).toMatchObject({
      key: "kaijuclothing.com",
      name: "Kaiju Clothing",
      platform: "Shopify",
      email: "hello@kaijuclothing.com",
      industry: "online handmade soap brands",
    });
    // The shop is read with the shop page plan and a small page limit: no AI, no paid lookups.
    const asked = reader.freeEnrich.mock.calls[0][0];
    expect(asked).toMatchObject({ website: "kaijuclothing.com", maxPages: 5, keepPages: true });
    expect(
      asked.pagesFor({
        html: '<a href="/pages/contact">Contact</a><a href="/policies/refund-policy">Refunds</a>',
        domain: "kaijuclothing.com",
      }),
    ).toEqual(["/pages/contact", "/policies/refund-policy"]);
    expect(seen.hide.mock.calls[0][2]).toEqual({
      hideSeen: true,
      since: "2026-11-16T00:00:00.000Z",
    });
    expect(seen.remember).toHaveBeenCalledTimes(1);
  });

  it("falls back to Brave when Serper is out of credit, and never to SerpApi", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("serper.dev"))
          return Response.json({ message: "Not enough credits" }, { status: 400 });
        return Response.json({
          web: {
            results: [
              {
                url: "https://kaijuclothing.com/",
                title: "Kaiju Clothing",
                description: "Anime streetwear.",
              },
            ],
          },
        });
      }),
    );
    const { data } = await step(
      { niche: "anime", market: "be", source: "stores", step: 8, hideSeen: false },
      {
        SERPER_API_KEY: "test-serper",
        BRAVE_SEARCH_API_KEY: "test-brave",
        SERPAPI_API_KEY: "test-serpapi",
      },
    );
    expect(calls).toHaveLength(2);
    const brave = new URL(calls[1]);
    expect(brave.hostname).toBe("api.search.brave.com");
    expect(brave.searchParams.get("country")).toBe("BE");
    expect(brave.searchParams.get("offset")).toBeNull();
    expect(calls.some((url) => url.includes("serpapi.com"))).toBe(false);
    expect(data.brands).toHaveLength(1);
    expect(data.warnings.join(" ")).toContain("Switched to Brave");
    expect(seen.hide.mock.calls[0][2]).toEqual({ hideSeen: false, since: null });
  });

  it("plans without Google's inurl: when Brave is the only provider", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return Response.json({ web: { results: [] } });
      }),
    );
    await step(
      { niche: "anime", source: "stores", step: 2 },
      { BRAVE_SEARCH_API_KEY: "test-brave" },
    );
    expect(new URL(calls[0]).searchParams.get("q")).toBe('anime merch "shop all" "new arrivals"');
    calls.length = 0;
    // With a Serper key the plan stays Google's, also for a search that falls back to Brave.
    await step(
      { niche: "anime", source: "stores", step: 2 },
      { SERPER_API_KEY: "test-serper", BRAVE_SEARCH_API_KEY: "test-brave" },
    );
    expect(calls).toHaveLength(1);
  });

  it("stops the scan when every provider is out of searches, without reading a site", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("serper.dev")
          ? Response.json({ message: "Not enough credits" }, { status: 400 })
          : Response.json({ message: "monthly quota exhausted" }, { status: 429 }),
      ),
    );
    const { data } = await step(
      { niche: "anime", step: 0 },
      { SERPER_API_KEY: "s", BRAVE_SEARCH_API_KEY: "b", SERPAPI_API_KEY: "p" },
    );
    expect(data).toMatchObject({ stopped: true, retry: false, searches: 0, brands: [] });
    expect(reader.freeEnrich).not.toHaveBeenCalled();
    expect(seen.remember).not.toHaveBeenCalled();
  });

  it("asks again later when Brave is only busy for a moment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "Too many requests" }, { status: 429 })),
    );
    const { data } = await step({ niche: "anime", step: 0 }, { BRAVE_SEARCH_API_KEY: "b" });
    expect(data).toMatchObject({ retry: true, stopped: false, searches: 0 });
  });

  it("says so when no search key is connected, and searches nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // SerpApi alone is not used: it needs the paid opt-in.
    const { data } = await step({ niche: "anime", step: 0 }, { SERPAPI_API_KEY: "test-serpapi" });
    expect(data).toMatchObject({ noProvider: true, stopped: true, searches: 0, brands: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only answers a POST with a readable body", async () => {
    const get = await handleApiRequest(new Request("https://example.com/api/discover/ecom"), {
      SERPER_API_KEY: "s",
    });
    expect(get?.status).toBe(405);
    const bad = await handleApiRequest(
      new Request("https://example.com/api/discover/ecom", { method: "POST", body: "{" }),
      { SERPER_API_KEY: "s" },
    );
    expect(bad?.status).toBe(400);
  });
});
