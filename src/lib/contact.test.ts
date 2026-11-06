import { describe, expect, it, vi } from "vitest";
import { handleContactRequest } from "./contact.server";
import { contactSchema } from "./contact-schema";
import { readBoundedBody, requestIpHash } from "./request-security";

const payload = { kind: "quote", name: "Test Visitor", company: "Test", email: "test@example.test", message: "SEO quote", consent: true };
const request = (body = payload, origin = "https://site.test") => new Request("https://site.test/api/public/contact", {
  method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.1" }, body: JSON.stringify(body),
});
describe("quote abuse protection", () => {
  it("requires quote contact consent", () => expect(contactSchema.safeParse({ ...payload, consent: false }).success).toBe(false));
  it("rejects cross-site submissions before accessing storage", async () => {
    const getDb = vi.fn();
    expect((await handleContactRequest(request(payload, "https://attacker.test"), getDb)).status).toBe(403);
    expect(getDb).not.toHaveBeenCalled();
  });
  it("allows three requests per minute and rejects the fourth", async () => {
    let count = 0;
    const insert = vi.fn();
    const db = { insert, rpc: vi.fn(async (args: { _key: string; _max: number; _window_seconds: number }) => args._key.startsWith("contact:minute:") ? ++count <= args._max : true) };
    for (let i = 0; i < 3; i++) expect((await handleContactRequest(request(), async () => db)).status).toBe(200);
    const response = await handleContactRequest(request(), async () => db);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(insert).toHaveBeenCalledTimes(3);
  });
  it("checks five-per-hour IP, three-per-hour email and sixty-per-minute global caps", async () => {
    const db = { insert: vi.fn(), rpc: vi.fn(async () => true) };
    await handleContactRequest(request(), async () => db);
    expect(db.rpc).toHaveBeenCalledWith(expect.objectContaining({ _key: expect.stringMatching(/^contact:hour:/), _max: 5, _window_seconds: 3600 }));
    expect(db.rpc).toHaveBeenCalledWith(expect.objectContaining({ _key: expect.stringMatching(/^contact:email:/), _max: 3, _window_seconds: 3600 }));
    expect(db.rpc).toHaveBeenCalledWith({ _key: "contact:global", _max: 60, _window_seconds: 60 });
  });
  it("fails closed when the limiter is unavailable", async () => {
    const db = { insert: vi.fn(), rpc: vi.fn(async () => { throw new Error("offline"); }) };
    expect((await handleContactRequest(request(), async () => db)).status).toBe(503);
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("rejects a filled honeypot", async () => {
    const getDb = vi.fn();
    expect((await handleContactRequest(request({ ...payload, website: "bot" } as typeof payload), getDb)).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
  it("bounds body reads even without a content-length header", async () => {
    await expect(readBoundedBody(new Request("https://site.test", { method: "POST", body: "12345" }), 4)).rejects.toThrow("body_too_large");
  });
  it("ignores spoofed forwarded-for values", async () => {
    const a = new Request("https://site.test", { headers: { "x-forwarded-for": "1.1.1.1" } });
    const b = new Request("https://site.test", { headers: { "x-forwarded-for": "8.8.8.8" } });
    expect(await requestIpHash(a)).toBe(await requestIpHash(b));
  });
});