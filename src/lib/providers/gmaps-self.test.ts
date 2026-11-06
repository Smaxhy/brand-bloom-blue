import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedText, parseGmapsCsv, scraperFetch } from "./gmaps-self";

afterEach(() => vi.unstubAllGlobals());
describe("own Maps scraper safety", () => {
  it("blocks private and non-HTTPS destinations before sending credentials", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const address of ["http://business.com", "https://127.0.0.1", "https://169.254.169.254", "https://service.internal"])
      await expect(scraperFetch({ GMAPS_SCRAPER_URL: address }, "/api/v1/jobs")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses redirects instead of forwarding credentials", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ Status: 0, Answer: [{ type: 1, data: "1.1.1.1" }] }))
      .mockResolvedValueOnce(Response.json({ Status: 0, Answer: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://other.com" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(scraperFetch({ GMAPS_SCRAPER_URL: "https://maps.business.com" }, "/api/v1/jobs")).rejects.toThrow("redirects");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects downloads over the read limit", async () => {
    await expect(boundedText(new Response("12345"), 4)).rejects.toThrow("too large");
  });
  it("parses quoted business fields but drops unsafe website links", () => {
    const rows = parseGmapsCsv('title,website,emails\n"Tree, care",javascript:alert(1),info@business.com\n', "Phoenix", "Tree service");
    expect(rows[0]?.company).toBe("Tree, care");
    expect(rows[0]?.website).toBe("");
    expect(rows[0]?.email).toBe("info@business.com");
  });
});