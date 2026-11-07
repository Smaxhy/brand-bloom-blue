import { describe, expect, it, vi } from "vitest";
import { handleContactRequest } from "./contact.server";
import { contactSchema } from "./contact-schema";
import { readBoundedBody, requestIpHash } from "./request-security";

const payload = { kind: "quote", name: "Test Visitor", company: "Test", email: "test@example.test", message: "SEO quote", consent: true };
const request = (body = payload, origin = "https://site.test") => new Request("https://site.test/api/public/contact", {
  method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.1" }, body: JSON.stringify(body),
});
describe("quote abuse protection", () => {
  it("persists selected services and the visitor's personal message and contact information", async () => {
    const db = { insert: vi.fn(), rpc: vi.fn(async () => true) };
    const body = { ...payload, phone: "+32 123456789", services: ["video_creation"], personalMessage: "Please call after 5." };
    expect((await handleContactRequest(request(body), async () => db)).status).toBe(200);
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ phone: "+32 123456789", email: "test@example.test", personal_message: "Please call after 5.", consent: true, estimates: { monthly: 250, upfront: 0, total: 250 }, services: [{ id: "video_creation", name: "Video Creation", price: 250, billing: "monthly" }] }));
  });
  it("uses one stable fingerprint for identical retries but a different one for changed messages", async () => {
    const db = { insert: vi.fn(), rpc: vi.fn(async () => true) };
    await handleContactRequest(request(), async () => db); await handleContactRequest(request(), async () => db);
    await handleContactRequest(request({ ...payload, message: "Different request" }), async () => db);
    expect(db.insert.mock.calls[0][0].request_key).toBe(db.insert.mock.calls[1][0].request_key);
    expect(db.insert.mock.calls[0][0].request_key).not.toBe(db.insert.mock.calls[2][0].request_key);
  });
  it("requires quote contact consent", () => expect(contactSchema.safeParse({ ...payload, consent: false }).success).toBe(false));
  it("accepts a complete quote with all ten available services and consent", async () => {
    const db = { insert: vi.fn(), rpc: vi.fn(async () => true) };
    const body = { ...payload, website: "", services: ["ads_setup", "ads_management", "video_creation", "email_sms", "website", "pixel_ecom", "pixel_leadgen", "seo", "sea", "sea_setup"] };
    expect((await handleContactRequest(request(body), async () => db)).status).toBe(200);
    expect(db.insert.mock.calls[0][0].services).toHaveLength(10);
  });
  it("identifies invalid email without incorrectly blaming confirmed consent", async () => {
    const getDb = vi.fn();
    const response = await handleContactRequest(request({ ...payload, email: "visitor@invalid..com" }), getDb);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Please enter a valid e-mail address.", field: "email" });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("identifies autofilled bot-trap values without blaming confirmed consent", async () => {
    const getDb = vi.fn();
    const response = await handleContactRequest(request({ ...payload, website: "https://example.test" } as typeof payload), getDb);
    expect(response.status).toBe(400);
    expect((await response.json()).field).toBe("website");
    expect(getDb).not.toHaveBeenCalled();
  });
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