import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchSite = vi.hoisted(() => vi.fn());
vi.mock("./public-site-fetch", () => ({ fetchPublicSite: fetchSite }));

import { freeEnrich, hiddenEmails } from "./providers/free-enrich";
import { readStore, storeContactPaths } from "./ecom-brands";
import { ecomScanStep } from "./ecom-scan";

/** A small Shopify shop, as its pages are served. */
const SITE: Record<string, string> = {
  "/": `<!doctype html><html><head><title>Kaiju Clothing – Anime Streetwear</title>
    <meta property="og:site_name" content="Kaiju Clothing">
    <meta name="description" content="Limited anime streetwear drops, shipped worldwide.">
    <script>Shopify.shop = "kaiju-clothing.myshopify.com"; Shopify.currency = {"active":"USD","rate":"1.0"};</script>
    <script>!function(f){f.fbq=function(){}}(window); fbq('init', '1234567890');</script></head>
    <body><div class="shopify-section"><a href="/collections/all">Shop all</a><a href="/cart">Cart</a></div>
    <footer><a href="/pages/contact">Contact</a><a href="/policies/refund-policy">Refund policy</a>
    <a href="/pages/our-story">Our story</a>
    <a href="https://www.instagram.com/kaijuclothing/">Instagram</a><a href="https://www.tiktok.com/@kaijuclothing">TikTok</a>
    <a href="https://www.instagram.com/shopify/">Powered by Shopify</a></footer></body></html>`,
  "/pages/contact": `<html><body><h1>Contact</h1><form action="/contact"><input name="email"></form>
    <a href="https://www.instagram.com/kaijuclothing/">Instagram</a></body></html>`,
  "/policies/refund-policy": `<html><body><h1>Refund policy</h1><p>To start a return, contact us at
    support@kaijuclothing.com. Questions about privacy go to privacy@shopify.com.</p>
    <a href="https://www.instagram.com/kaijuclothing/">Instagram</a></body></html>`,
  "/pages/our-story": `<html><body><p>Started in a bedroom in 2021.</p></body></html>`,
};

function serve(site: Record<string, string>, host = "kaijuclothing.com") {
  fetchSite.mockImplementation(async (url: string) => {
    const u = new URL(url);
    if (u.hostname !== host) return null;
    const html = site[u.pathname.replace(/\/+$/, "") || "/"];
    return html ? { html, finalUrl: url } : null;
  });
}
const paths = () => fetchSite.mock.calls.map((c) => new URL(c[0] as string).pathname).sort();
const asShop = (website: string, companyName = "Kaiju Clothing") =>
  freeEnrich({
    website,
    companyName,
    maxPages: 5,
    keepPages: true,
    pagesFor: ({ html, domain }) => storeContactPaths(html, domain),
  });

beforeEach(() => {
  fetchSite.mockReset();
  // The mail-server lookup: the domain accepts mail.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ Status: 0, Answer: [{ type: 15 }] })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("reading a web shop", () => {
  it("follows the shop's own contact and policy pages instead of guessing addresses", async () => {
    serve(SITE);
    const fe = await asShop("kaijuclothing.com");
    expect(paths()).toEqual(["/", "/pages/contact", "/pages/our-story", "/policies/refund-policy"]);
    // The address is on the refund policy only; the shop software's own address is never theirs.
    expect(fe.emails.filter((e) => e.source === "site").map((e) => e.email)).toEqual([
      "support@kaijuclothing.com",
    ]);
    expect(fe.emails[0].page).toBe("/policies/refund-policy");
    // Their own account, not the shop software's.
    expect(fe.ig).toMatchObject({ handle: "kaijuclothing", confidence: "sure", via: "site" });
    expect(fe.socials.tiktok).toBe("https://www.tiktok.com/@kaijuclothing");
    expect(fe.pagesHtml?.map((p) => p.path)).toEqual([
      "/",
      "/pages/contact",
      "/policies/refund-policy",
      "/pages/our-story",
    ]);
    expect(readStore(fe.pagesHtml ?? [], fe.website)).toEqual({
      platform: "Shopify",
      sells: true,
      name: "Kaiju Clothing",
      about: "Limited anime streetwear drops, shipped worldwide.",
      tools: ["Meta pixel"],
      currency: "USD",
    });
  });

  it("stays within the page limit and on the site, whatever pages are asked for", async () => {
    serve(SITE);
    await freeEnrich({
      website: "kaijuclothing.com",
      maxPages: 3,
      pagesFor: () => [
        "//evil.test/x",
        "https://evil.test/y",
        "pages/contact",
        "/pages/contact",
        "/pages/contact",
        "/a b",
        "/policies/refund-policy",
        "/pages/our-story",
      ],
    });
    expect(paths()).toEqual(["/", "/pages/contact", "/policies/refund-policy"]);
  });

  it("hands the pages back only when asked, and leaves the usual reading as it was", async () => {
    serve(SITE);
    const usual = await freeEnrich({ website: "kaijuclothing.com", maxPages: 2 });
    expect(usual.pagesHtml).toBeUndefined();
    expect(paths()).toEqual(["/", "/contact"]);
  });

  it("tries the shop software's usual addresses when the homepage links nothing", async () => {
    serve({
      "/": `<html><head><script>Shopify.theme = {"name":"Dawn"};</script></head><body class="shopify-section"></body></html>`,
      "/policies/privacy-policy": `<p>Contact us by e-mail at hello@kaijuclothing.com</p>`,
    });
    const fe = await asShop("kaijuclothing.com");
    expect(paths()).toEqual([
      "/",
      "/pages/contact",
      "/policies/privacy-policy",
      "/policies/refund-policy",
    ]);
    expect(fe.emails.map((e) => e.email)).toContain("hello@kaijuclothing.com");
  });
});

describe("a scan step with the real site reader", () => {
  it("turns a search result into a brand with its shop, email and Instagram", async () => {
    serve(SITE);
    const out = await ecomScanStep(
      { niche: "anime", source: "stores", step: 0 },
      {
        search: async () => ({
          answered: true,
          results: [
            {
              link: "https://kaijuclothing.com/collections/hoodies",
              title: "Hoodies – Kaiju Clothing",
              snippet: "Anime hoodies.",
            },
            { link: "https://gone-shop.test/products/x", title: "Gone Shop" },
            { link: "https://some-blog.test/best-anime-brands", title: "Best anime brands" },
          ],
        }),
        readSite: ({ website, companyName }) => asShop(website, companyName),
        now: () => 7_000,
      },
    );
    expect(out.brands.map((b) => [b.key, b.kind])).toEqual([
      ["kaijuclothing.com", "shop"],
      ["gone-shop.test", "unread"],
    ]);
    expect(out.brands[0]).toMatchObject({
      name: "Kaiju Clothing",
      platform: "Shopify",
      about: "Limited anime streetwear drops, shipped worldwide.",
      email: "support@kaijuclothing.com",
      instagram: "https://www.instagram.com/kaijuclothing",
      instagramSure: true,
      instagramVia: "site",
      tiktok: "https://www.tiktok.com/@kaijuclothing",
      tools: ["Meta pixel"],
      currency: "USD",
      // Its own words name the niche. Prices in dollars say nothing about where a shop is.
      match: "strong",
      country: "",
      countrySure: false,
      score: 80,
      why: ["Shopify shop", "Instagram found", "email on their site", "sells anime"],
    });
    expect(out.skipped).toEqual({ notBrands: 0, seen: 0, notShops: 1, elsewhere: 0, unplaced: 0 });
  });
});

describe("addresses on a shop's pages", () => {
  it("are never made out of ordinary sentences", () => {
    for (const prose of [
      "Shop at kaijuclothing.com for the latest drops",
      "Visit us at www.kaijuclothing.com today",
      "Available at kaijuclothing.com and in stores",
      "Follow us @kaiju.co and tag @kaiju.official",
      "Look at kaiju.co now. Great at 5.30 pm",
      "Free shipping at checkout.No code needed",
    ])
      expect(hiddenEmails(`<p>${prose}</p>`), prose).toEqual([]);
  });

  it("end where the address ends, not in the next sentence", () => {
    expect(
      hiddenEmails(
        "<p>To start a return, contact us at support@kaijuclothing.com. Questions go elsewhere.</p>",
      ),
    ).toEqual(["support@kaijuclothing.com"]);
    expect(hiddenEmails("<p>Reach hello@kaijuclothing.com.\nReturns within 30 days</p>")).toEqual([
      "hello@kaijuclothing.com",
    ]);
    expect(hiddenEmails("<p>Questions? hello@kaijuclothing.com . We reply fast</p>")).toEqual([
      "hello@kaijuclothing.com",
    ]);
  });

  it("are still read when they were disguised on purpose", () => {
    expect(
      hiddenEmails(
        "<p>owner at business dot test</p><p>team[at]business[dot]co[dot]uk</p><p>hello (at) business (dot) test</p>",
      ),
    ).toEqual(["owner@business.test", "team@business.co.uk", "hello@business.test"]);
    expect(
      hiddenEmails("<p>sales [at] kaijuclothing.com</p><p>press @ kaijuclothing.com</p>"),
    ).toEqual(["sales@kaijuclothing.com", "press@kaijuclothing.com"]);
  });
});
