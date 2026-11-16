import { describe, expect, it, vi } from "vitest";
import { type EcomBrand, ecomFit } from "@/lib/ecom-brands";
import {
  ECOM_DRY_LIMIT,
  ECOM_GAP_MS,
  type EcomAsk,
  type EcomScanIo,
  type EcomStepReply,
  runEcomScan,
} from "./ecom-finder";

const brand = (key: string, over: Partial<EcomBrand> = {}): EcomBrand => {
  const b = {
    key,
    name: key,
    website: key.startsWith("ig:") ? "" : key,
    about: "",
    kind: "shop" as const,
    platform: "Shopify",
    email: "",
    instagram: key.startsWith("ig:") ? `https://www.instagram.com/${key.slice(3)}` : "",
    instagramSure: true,
    instagramVia: "" as const,
    instagramWhy: "",
    followers: null,
    tiktok: "",
    tools: [],
    currency: "",
    niche: "Anime",
    industry: "online anime brands",
    source: "stores" as const,
    query: "q",
    foundAt: 1,
    ...over,
  };
  return { ...b, ...ecomFit(b) };
};

const ok = (over: Partial<EcomStepReply> = {}): EcomAsk => ({
  status: "ok",
  data: {
    brands: [],
    query: "q",
    searches: 1,
    done: false,
    stopped: false,
    retry: false,
    skipped: { notBrands: 0, seen: 0, notShops: 0 },
    ...over,
  },
});

/** A scan with a clock that only moves when the scan waits. */
function scan(
  replies: (body: Record<string, unknown>, n: number) => EcomAsk,
  over: Partial<EcomScanIo> = {},
) {
  let clock = 1_000_000;
  const waits: number[] = [];
  const asked: Record<string, unknown>[] = [];
  const found: EcomBrand[][] = [];
  const io: EcomScanIo = {
    ask: vi.fn(async (body) => {
      asked.push(body);
      return replies(body, asked.length - 1);
    }),
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    stopped: () => false,
    list: [],
    onBrands: (brands) => void found.push(brands),
    onProgress: () => undefined,
    now: () => clock,
    ...over,
  };
  return { io, waits, asked, found };
}
const options = {
  niche: "anime",
  market: "",
  sources: ["stores", "instagram"] as ("stores" | "instagram")[],
  maxSearches: 4,
  hideSeen: true,
};

describe("an ecom scan", () => {
  it("uses exactly the searches it was given, taking turns between shops and Instagram", async () => {
    const s = scan((body, n) =>
      ok({ brands: [brand(`shop${n}.com`)], query: `${body.source} ${body.step}` }),
    );
    const out = await runEcomScan(options, s.io);
    expect(s.asked.map((b) => [b.source, b.step])).toEqual([
      ["stores", 0],
      ["instagram", 0],
      ["stores", 1],
      ["instagram", 1],
    ]);
    expect(out.end).toBe("done");
    expect(out.tally).toMatchObject({ searches: 4, found: 4 });
    expect(out.message).toBe(
      "Found 4 new brands with 4 searches: 0 with Instagram, 0 with an email.",
    );
    // Never faster than the request limit allows.
    expect(s.waits).toEqual([ECOM_GAP_MS, ECOM_GAP_MS, ECOM_GAP_MS]);
  });

  it("picks each source up where it is told to, and reports where it stopped", async () => {
    const s = scan((_b, n) => ok({ brands: [brand(`shop${n}.com`)] }));
    const out = await runEcomScan({ ...options, startAt: { stores: 10, instagram: 4 } }, s.io);
    expect(s.asked.map((b) => [b.source, b.step])).toEqual([
      ["stores", 10],
      ["instagram", 4],
      ["stores", 11],
      ["instagram", 5],
    ]);
    expect(out.next).toEqual({ stores: 12, instagram: 6 });
    const one = scan(() => ok({ brands: [] }));
    expect(
      (await runEcomScan({ ...options, sources: ["instagram"], maxSearches: 2 }, one.io)).next,
    ).toEqual({ instagram: 2 });
  });

  it("tells the server what it already holds, so nothing is read twice", async () => {
    const s = scan((_b, n) => ok({ brands: [brand(`shop${n}.com`)] }), {
      list: [brand("old.com"), brand("ig:oldpage")],
    });
    await runEcomScan({ ...options, maxSearches: 2, hideSeen: false }, s.io);
    expect(s.asked[0]).toMatchObject({
      niche: "anime",
      market: "",
      hideSeen: false,
      have: ["old.com", "ig:oldpage"],
    });
    expect(s.asked[1].have).toEqual(["old.com", "ig:oldpage", "shop0.com"]);
    expect(typeof s.asked[0].since).toBe("string");
    expect(s.asked[1].since).toBe(s.asked[0].since);
  });

  it("counts a brand once, and not one that was in the list already", async () => {
    const s = scan(
      () => ok({ brands: [brand("old.com"), brand("new.com", { email: "a@new.com" })] }),
      { list: [brand("old.com")] },
    );
    const out = await runEcomScan({ ...options, sources: ["stores"], maxSearches: 2 }, s.io);
    expect(out.tally).toMatchObject({ searches: 2, found: 1, withEmail: 1, withInstagram: 0 });
  });

  it("adds up what the searches left out", async () => {
    const s = scan(() => ok({ skipped: { notBrands: 2, seen: 1, notShops: 3 } }));
    const out = await runEcomScan({ ...options, maxSearches: 2 }, s.io);
    expect(out.tally).toMatchObject({ notBrands: 4, seen: 2, notShops: 6 });
  });

  it("stops by itself when searches keep finding nothing new", async () => {
    const s = scan(() => ok());
    const out = await runEcomScan({ ...options, maxSearches: 40 }, s.io);
    expect(out.end).toBe("dry");
    // Three empty searches in each place, then no more are paid for.
    expect(out.tally.searches).toBe(ECOM_DRY_LIMIT * 2);
    expect(out.message).toBe(
      "No new brands in 6 searches. Stopped early: the last searches found nothing new.",
    );
  });

  it("stops looking in a place that finds nothing and spends the rest where brands are", async () => {
    const s = scan((body, n) =>
      body.source === "instagram" ? ok() : ok({ brands: [brand(`s${n}.com`)] }),
    );
    const out = await runEcomScan({ ...options, maxSearches: 10 }, s.io);
    expect(s.asked.map((b) => b.source).join(" ")).toBe(
      "stores instagram stores instagram stores instagram stores stores stores stores",
    );
    expect(out.end).toBe("done");
    expect(out.tally).toMatchObject({ searches: 10, found: 7 });
    expect(out.message).toContain("Instagram was left after 3 searches that found nothing new.");
    expect(out.next).toEqual({ stores: 7, instagram: 3 });
  });

  it("gives a place another chance each time it finds something", async () => {
    // Shops: nothing, nothing, a brand, nothing, nothing, nothing: left only after three in a row.
    const hits = new Set([2]);
    const s = scan((body) =>
      ok({ brands: hits.has(body.step as number) ? [brand(`s${body.step}.com`)] : [] }),
    );
    const out = await runEcomScan({ ...options, sources: ["stores"], maxSearches: 40 }, s.io);
    expect(out.tally.searches).toBe(6);
    expect(out.end).toBe("dry");
  });

  it("carries on with the other source when one has run every search", async () => {
    const s = scan((body, n) =>
      body.source === "instagram"
        ? ok({ done: true, brands: [brand(`ig:p${n}`)] })
        : ok({ brands: [brand(`s${n}.com`)] }),
    );
    const out = await runEcomScan({ ...options, maxSearches: 5 }, s.io);
    expect(s.asked.map((b) => b.source)).toEqual([
      "stores",
      "instagram",
      "stores",
      "stores",
      "stores",
    ]);
    expect(out.end).toBe("done");
  });

  it("ends when every search there is has run, without using the rest", async () => {
    const s = scan(() => ok({ done: true, brands: [brand("a.com")] }));
    const out = await runEcomScan({ ...options, maxSearches: 10 }, s.io);
    expect(s.asked).toHaveLength(2);
    expect(out.end).toBe("plan");
    expect(out.message).toContain("Every search for this niche has run.");
  });

  it("stops between two searches when asked to, keeping what was found", async () => {
    let stop = false;
    const s = scan(
      (_b, n) => {
        if (n === 1) stop = true;
        return ok({ brands: [brand(`s${n}.com`)] });
      },
      { stopped: () => stop },
    );
    const out = await runEcomScan({ ...options, maxSearches: 10 }, s.io);
    expect(s.asked).toHaveLength(2);
    expect(out.end).toBe("stopped");
    expect(out.tally.found).toBe(2);
    expect(s.found).toHaveLength(2);
  });

  it("ends at once when the provider has no searches left, and says what to do", async () => {
    const s = scan((_b, n) =>
      n === 0 ? ok({ brands: [brand("a.com")] }) : ok({ stopped: true, searches: 0 }),
    );
    const out = await runEcomScan(options, s.io);
    expect(s.asked).toHaveLength(2);
    expect(out.end).toBe("noSearches");
    expect(out.message).toContain("no searches left");
    expect(out.tally.searches).toBe(1);
  });

  it("reports a missing search key without spending anything", async () => {
    const s = scan(() => ok({ noProvider: true, stopped: true, searches: 0 }));
    const out = await runEcomScan(options, s.io);
    expect(out).toMatchObject({ end: "noProvider", message: "" });
    expect(s.asked).toHaveLength(1);
  });

  it("asks a busy provider again, then moves on to the next search", async () => {
    const s = scan((body) =>
      body.source === "stores" && body.step === 0
        ? ok({ retry: true, searches: 0 })
        : ok({ brands: [brand(`${body.source}${body.step}.com`)] }),
    );
    const out = await runEcomScan({ ...options, sources: ["stores"], maxSearches: 2 }, s.io);
    expect(s.asked.map((b) => b.step)).toEqual([0, 0, 0, 0, 1, 2]);
    expect(out.end).toBe("done");
    expect(out.tally.searches).toBe(2);
  });

  it("gives up on a provider that stays busy", async () => {
    const s = scan(() => ok({ retry: true, searches: 0 }));
    const out = await runEcomScan({ ...options, maxSearches: 40 }, s.io);
    expect(out.end).toBe("failed");
    expect(out.message).toContain("keeps answering that it is busy");
    expect(s.asked.length).toBe(13);
  });

  it("waits out the request limit and asks the same search again", async () => {
    const s = scan((_b, n) =>
      n === 0 ? { status: "limited" } : ok({ brands: [brand(`s${n}.com`)] }),
    );
    const out = await runEcomScan({ ...options, sources: ["stores"], maxSearches: 1 }, s.io);
    expect(s.asked.map((b) => b.step)).toEqual([0, 0]);
    expect(s.waits).toContain(20_000);
    expect(out.end).toBe("done");
  });

  it("stops with the reason when the connection keeps dropping", async () => {
    const s = scan((_b, n) =>
      n === 0
        ? ok({ brands: [brand("a.com")] })
        : { status: "failed", message: "The connection dropped during a search." },
    );
    const out = await runEcomScan({ ...options, sources: ["stores"], maxSearches: 5 }, s.io);
    expect(s.asked).toHaveLength(4);
    expect(out.end).toBe("failed");
    expect(out.message).toBe(
      "The connection dropped during a search. What was found so far is kept.",
    );
  });

  it("passes on what the provider warned about, once", async () => {
    const s = scan(() =>
      ok({
        brands: [brand(`x${Math.random()}.com`)],
        warnings: [
          "Switched to Brave for the Google lookups (the previous provider is unavailable)",
        ],
      }),
    );
    const out = await runEcomScan({ ...options, maxSearches: 3 }, s.io);
    expect(out.warnings).toEqual([
      "Switched to Brave for the Google lookups (the previous provider is unavailable)",
    ]);
  });

  it("asks for nothing without a niche or a place to look", async () => {
    const s = scan(() => ok());
    expect(await runEcomScan({ ...options, sources: [] }, s.io)).toMatchObject({
      end: "failed",
      message: "Choose where to look: online shops, Instagram, or both.",
    });
    expect(await runEcomScan({ ...options, niche: "  " }, s.io)).toMatchObject({
      end: "failed",
      message: "Type what the brands sell.",
    });
    expect(s.asked).toHaveLength(0);
  });
});
