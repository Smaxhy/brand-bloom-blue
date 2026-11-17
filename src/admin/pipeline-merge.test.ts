import { describe, it, expect } from "vitest";
import { cleanDuplicateDeals, latestCall, mergeWebsiteRequests, removePipelineDeal, requestedCall, type WebsiteRequest } from "./pipeline-merge";
import type { Deal } from "./store";
const deal = (overrides: Partial<Deal> = {}): Deal => ({ id: "original", name: "Business", contact: "", email: "", phone: "", value: 0, stage: "new", source: "Apollo", notes: "Original notes", createdAt: 1, updatedAt: 1, ...overrides });
const request: WebsiteRequest = { id: "request1", kind: "quote", name: "Jane Doe", email: "jane@example.test", company: "Business", phone: "+32 123456789", message: "Full request", personal_message: "Please call after 5.", created_at: "2026-11-07T20:00:00Z", consent: true, services: [{ id: "video_creation", name: "Video Creation", price: 250, billing: "monthly" }], estimates: { monthly: 250, upfront: 0, total: 250 }, attribution: { source: "outreach" } };
describe("quote pipeline", () => {
  it("keeps a deleted quote out after refresh without changing the original request", () => {
    const [quote] = mergeWebsiteRequests([], [request]);
    const removed = removePipelineDeal([quote], quote);
    expect(mergeWebsiteRequests(removed.deals, [request], removed.dismissedWebsiteRequestIds)).toHaveLength(0);
    expect(request.personal_message).toBe("Please call after 5.");
    expect(mergeWebsiteRequests([], [request])).toHaveLength(1);
  });
  it("allows a new request from the same visitor after deleting an older quote", () => {
    const [quote] = mergeWebsiteRequests([], [request]);
    const removed = removePipelineDeal([quote], quote);
    const next = mergeWebsiteRequests(removed.deals, [request, { ...request, id: "new-request" }], removed.dismissedWebsiteRequestIds);
    expect(next).toHaveLength(1); expect(next[0].requests?.map((r) => r.id)).toEqual(["new-request"]);
  });
  it("retains email services phone and personal message", () => {
    const result = mergeWebsiteRequests([], [request]);
    expect(result[0]).toMatchObject({ email: "jane@example.test", contact: "Jane Doe", phone: "+32 123456789", value: 250 });
    expect(result[0].requests?.[0]).toEqual(request);
  });
  it("does not duplicate repeat reads and retains different requests", () => {
    const result = mergeWebsiteRequests(mergeWebsiteRequests([], [request]), [request, { ...request, id: "request2", personal_message: "Another question" }]);
    expect(result).toHaveLength(1); expect(result[0].requests).toHaveLength(2);
  });
  it("matches an existing email without resetting its stage or identity", () => {
    const result = mergeWebsiteRequests([deal({ email: " JANE@example.test ", stage: "proposal" })], [request]);
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ id: "original", stage: "proposal", notes: "Original notes" });
  });
  it("merges company-phone raw duplicates retaining information and old IDs", () => {
    const result = cleanDuplicateDeals([deal({ phone: "(513) 903-3060" }), deal({ id: "copy", phone: "5139033060", notes: "Extra", contact: "Tom" })]);
    expect(result).toHaveLength(1); expect(result[0].mergedIds).toContain("copy"); expect(result[0].contact).toBe("Tom"); expect(result[0].notes).toContain("Extra");
  });
  it("keeps distinct named contacts with different emails", () => {
    expect(cleanDuplicateDeals([deal({ email: "a@example.test", phone: "123" }), deal({ id: "b", email: "b@example.test", phone: "123" })])).toHaveLength(2);
  });
  it("never merges unidentified contacts solely by company", () => {
    expect(cleanDuplicateDeals([deal(), deal({ id: "b" })])).toHaveLength(2);
  });
  it("retains the linked request identity after an administrator corrects the email", () => {
    const saved = deal({ email: "corrected@example.test", requests: [request], stage: "qualified" });
    const result = mergeWebsiteRequests([saved], [request]);
    expect(result).toHaveLength(1); expect(result[0].id).toBe("original"); expect(result[0].stage).toBe("qualified");
  });
});

describe("call requests from the growth check", () => {
  const call: WebsiteRequest = { ...request, id: "call1", created_at: "2026-11-16T09:00:00Z",
    message: "Quote request (contact consent confirmed)\nCall requested: Thursday 19 November 2026, afternoon (visitor's time zone: Europe/Brussels)\nGrowth check answers:\nBusiness type: Online store" };
  it("reads the day a visitor asked for", () => {
    expect(requestedCall(call)).toBe("Thursday 19 November 2026, afternoon (visitor's time zone: Europe/Brussels)");
    expect(latestCall([call])).toBe("Thursday 19 November 2026, afternoon");
  });
  it("finds no call in an ordinary quote or contact message", () => {
    expect(requestedCall(request)).toBe("");
    expect(requestedCall({ message: "Note: Call requested: tomorrow" })).toBe("");
    expect(latestCall([request])).toBe("");
    expect(latestCall()).toBe("");
  });
  it("shows the newest call when a visitor asked twice", () => {
    const later = { ...call, id: "call2", created_at: "2026-11-17T09:00:00Z", message: "Quote request (contact consent confirmed)\nCall requested: Friday 20 November 2026, morning" };
    expect(latestCall([later, call, request])).toBe("Friday 20 November 2026, morning");
    expect(latestCall([call, request, later])).toBe("Friday 20 November 2026, morning");
  });
  it("puts a call request in the pipeline as its own source", () => {
    const [deal] = mergeWebsiteRequests([], [call]);
    expect(deal).toMatchObject({ source: "Website call request", stage: "new", email: "jane@example.test", contact: "Jane Doe", name: "Business" });
    expect(mergeWebsiteRequests([], [request])[0].source).toBe("Website quote");
  });
  it("adds a call request to the deal that visitor already has", () => {
    const result = mergeWebsiteRequests([deal({ email: "jane@example.test", stage: "contacted" })], [request, call]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("Apollo");
    expect(latestCall(result[0].requests)).toBe("Thursday 19 November 2026, afternoon");
  });
});
