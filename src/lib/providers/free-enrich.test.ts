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