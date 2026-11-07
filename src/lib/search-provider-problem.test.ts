import { describe, expect, it } from "vitest";
import { searchProviderProblem } from "./api-proxies";

describe("search provider refusals in plain words", () => {
  it("Serper out of credits (a 400 with the reason in the body) stops further searches", () => {
    const p = searchProviderProblem("Serper", 400, '{"message":"Not enough credits","statusCode":400}');
    expect(p.stop).toBe(true);
    expect(p.text).toMatch(/no searches left/);
    expect(p.text).not.toMatch(/Not enough credits/); // the provider's own words are never shown
  });
  it("a bad key stops too; a one-off refusal doesn't", () => {
    expect(searchProviderProblem("Serper", 403, '{"message":"Unauthorized"}').stop).toBe(true);
    const one = searchProviderProblem("Serper", 400, '{"message":"Query too long"}');
    expect(one.stop).toBe(false);
    expect(one.text).toBe("Serper: refused a search (HTTP 400)");
    expect(searchProviderProblem("Serper", 502, "").stop).toBe(false);
  });
  it("SerpApi's monthly limit stops further searches", () => {
    expect(searchProviderProblem("SerpApi", 429, '{"error":"Your account has run out of searches."}').stop).toBe(true);
  });
});
