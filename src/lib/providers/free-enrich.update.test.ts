import { afterEach, expect, it, vi } from "vitest";
import { decodeCfEmail, freeEnrich, hasMx, hiddenEmails, emailPlausible, pickBusinessEmail } from "./free-enrich";
const fetchSite = vi.hoisted(() => vi.fn());
vi.mock("../public-site-fetch", () => ({ fetchPublicSite: fetchSite }));
afterEach(() => vi.unstubAllGlobals());
it("rejects unrelated business emails and keeps published consumer mailboxes", () => {
  const ctx = { domains: ["business.test"], fromOwnSite: true };
  expect(emailPlausible("designer@agency.test", ctx)).toBe(false);
  expect(emailPlausible("owner@business.test", ctx)).toBe(true);
  expect(emailPlausible("local.business@gmail.com", ctx)).toBe(true);
  expect(emailPlausible("bad@@business.test", ctx)).toBe(false);
  expect(emailPlausible("business@gmail.be", { domains: [], company: "Business" })).toBe(false);
  expect(emailPlausible("owner@business.test.attacker.com", { domains: ["business.test"] })).toBe(false);
});
it("does not select an unrelated directory email from search snippets", () => {
  expect(pickBusinessEmail("directory@listing.test unrelated@gmail.com", "business.test", { company: "Business" })).toBe("");
  expect(pickBusinessEmail("directory@listing.test smith.plumbing@gmail.com", "business.test", { company: "Smith Plumbing" })).toBe("smith.plumbing@gmail.com");
  expect(pickBusinessEmail("smith.plumbing@gmail.com owner@business.test", "business.test", { company: "Smith Plumbing" })).toBe("owner@business.test");
});
it("drops designer footer addresses without losing the business's phone or Gmail", async () => {
  fetchSite.mockResolvedValue({ html: '<p>local.business@gmail.com</p><a href="mailto:designer@agency.test">Site designer</a><a href="tel:+32470123456">Call</a>', finalUrl: "https://business.test" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Status: 3 })));
  const result = await freeEnrich({ website: "business.test", maxPages: 1 });
  expect(result.emails.map((item) => item.email)).toEqual(["local.business@gmail.com"]);
  expect(result.phones).toContain("+32470123456");
});
it("preserves a separately published business email domain", async () => {
  fetchSite.mockResolvedValue({ html: '<a href="mailto:owner@other-business.test">Contact us</a>', finalUrl: "https://business.test" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Status: 3 })));
  const result = await freeEnrich({ website: "business.test", maxPages: 1 });
  expect(result.emails.map((item) => item.email)).toEqual(["owner@other-business.test"]);
});
it("avoids deeper crawling only after a decoded usable email and owner are found", async () => {
  fetchSite.mockClear();
  fetchSite.mockImplementation(async (url: string) => ({ html: `Owner Alex Smith <span data-cfemail="${cloudflare("owner@business.test")}"></span>`, finalUrl: url }));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Status: 0, Answer: [{ type: 15 }] })));
  await freeEnrich({ website: "business.test", tiered: true });
  expect(fetchSite).toHaveBeenCalledTimes(3);
  fetchSite.mockClear();
  fetchSite.mockImplementation(async (url: string) => ({ html: 'Owner Alex Smith <span data-cfemail="0000"></span>', finalUrl: url }));
  await freeEnrich({ website: "business.test", tiered: true });
  expect(fetchSite).toHaveBeenCalledTimes(9);
});
it("treats DNS failure as unknown rather than claiming no mail server", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Status: 2 })));
  expect(await hasMx("business.test")).toBeNull();
});
it("keeps authoritative NXDOMAIN as absent", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Status: 3 })));
  expect(await hasMx("business.test")).toBe(false);
});

function cloudflare(email: string): string {
  const key = 0x42;
  return key.toString(16) + Array.from(new TextEncoder().encode(email), (byte) => (byte ^ key).toString(16).padStart(2, "0")).join("");
}

it("decodes Cloudflare addresses without accepting malformed encoding", () => {
  expect(decodeCfEmail(cloudflare("owner@business.test"))).toBe("owner@business.test");
  for (const bad of ["", "ff1", "zz00", "0000", cloudflare("not an email")])
    expect(decodeCfEmail(bad)).toBe("");
});

it("extracts both Cloudflare markup forms and deduplicates addresses", () => {
  const hex = cloudflare("Owner@business.test");
  expect(hiddenEmails(`<span data-cfemail='${hex}'></span><a href="/cdn-cgi/l/email-protection#${hex}">Email</a>`)).toEqual(["owner@business.test"]);
});

it("recovers decimal, hex and named email entities", () => {
  expect(hiddenEmails("a&#64;business&#46;test b&#x40;business&#x2e;test c&commat;business&period;test")).toEqual(["a@business.test", "b@business.test", "c@business.test"]);
});

it("recovers deliberate at/dot obfuscation while ignoring comments and scripts", () => {
  expect(hiddenEmails("<p>owner at business dot test</p><p>team[at]business[dot]co[dot]uk</p><p>hello (at) business (dot) test</p><!-- hidden@tracking.test --><script>tracker@tracking.test</script>")).toEqual(["owner@business.test", "team@business.co.uk", "hello@business.test"]);
});

it("keeps decoded published addresses and phone details when another mailto is malformed", async () => {
  fetchSite.mockResolvedValue({ html: `<a href="mailto:%ZZ">Broken</a><span data-cfemail="${cloudflare("owner@business.test")}"></span><a href="tel:+32470123456">Call</a>`, finalUrl: "https://business.test" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ Status: 0, Answer: [{ type: 15 }] })));
  const result = await freeEnrich({ website: "business.test", maxPages: 1 });
  expect(result.ok).toBe(true);
  expect(result.emails).toContainEqual({ email: "owner@business.test", source: "site", page: "/", mx: true });
  expect(result.emails.some((email) => email.source === "guess")).toBe(false);
  expect(result.phones).toContain("+32470123456");
});
it("accepts the same brand on a second domain but not designers, suppliers or form services", () => {
  const ctx = { domains: ["smithplumbing.com"], company: "Smith Plumbing & Heating", fromOwnSite: true };
  expect(emailPlausible("office@smithplumbingaz.com", ctx)).toBe(true);
  expect(emailPlausible("jane@smithph.com", ctx)).toBe(true);
  expect(emailPlausible("hello@pixelwebstudio.com", ctx)).toBe(false);
  expect(emailPlausible("orders@plumbingsupply.com", ctx)).toBe(false);
  expect(emailPlausible("forms@jotform.com", ctx)).toBe(false);
  expect(emailPlausible("privacy@smithplumbing.com", ctx)).toBe(false);
  expect(emailPlausible("info@smithplumbing.com", ctx)).toBe(true);
  expect(emailPlausible("smithplumbing@gmail.com", { ...ctx, fromOwnSite: false })).toBe(true);
  expect(emailPlausible("bob1972@gmail.com", { ...ctx, fromOwnSite: false })).toBe(false);
});

it("reads the brand part of a domain", async () => {
  const { mainLabel, brandTokens } = await import("./free-enrich");
  expect(mainLabel("www.smith-plumbing.co.uk")).toBe("smith-plumbing");
  expect(mainLabel("mail.smithplumbing.com")).toBe("smithplumbing");
  expect(mainLabel("business.test")).toBe("business");
  expect(brandTokens("Smith Plumbing & Heating LLC", "Dr. Ann Lee")).toEqual(["smith"]);
});

it("rejects designers, chambers, city offices and trade-word domains the review found", () => {
  const pros = { domains: ["denverroofingpros.com"], company: "Denver Roofing Pros", city: "Denver", fromOwnSite: true };
  expect(emailPlausible("hello@denverwebdesign.com", pros)).toBe(false);
  expect(emailPlausible("info@denverchamber.org", pros)).toBe(false);
  expect(emailPlausible("office@denverroofers.com", { ...pros, city: undefined })).toBe(false);
  const best = { domains: ["bestroofingdenver.com"], company: "Best Roofing Denver", city: "Denver", fromOwnSite: true };
  expect(emailPlausible("permits@denver.gov", best)).toBe(false);
  expect(emailPlausible("sales@roofing.com", best)).toBe(false);
  expect(emailPlausible("office@bestroofingdenver.net", best)).toBe(true);
});
