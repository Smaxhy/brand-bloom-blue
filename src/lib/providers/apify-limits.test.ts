import { afterEach, expect, it, vi } from "vitest";
import { apifyItems, apifyStart } from "./apify";
import { MAX_SCRAPE_RESULTS } from "../scrape-limits";

afterEach(() => vi.unstubAllGlobals());

it("requests and reads up to 2,000 Apify businesses without the old 1,000 truncation", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return String(url).includes("/datasets/")
      ? Response.json([])
      : Response.json({ data: { id: "run", defaultDatasetId: "dataset", status: "RUNNING" } });
  }));
  expect(MAX_SCRAPE_RESULTS).toBe(2000);
  await apifyStart({ APIFY_TOKEN: "test" }, { queries: ["landscaping"], location: "Brussels", max: 5000 });
  await apifyItems({ APIFY_TOKEN: "test" }, "dataset", "Brussels", "landscaping");
  expect(JSON.parse(String(calls[0].init?.body)).maxCrawledPlacesPerSearch).toBe(2000);
  expect(new URL(calls[1].url).searchParams.get("limit")).toBe("2000");
});