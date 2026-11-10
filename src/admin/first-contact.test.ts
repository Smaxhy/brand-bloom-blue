import { describe, expect, it } from "vitest";
import { isFirstContact } from "./first-contact";

describe("first-contact sequence option", () => {
  const empty = { enrolled: new Set<string>(), sent: new Set<string>() };
  it("allows someone never emailed or enrolled", () => {
    expect(isFirstContact({ email: "new@example.com" }, empty)).toBe(true);
  });
  it("excludes every previous enrollment, including finished sequences", () => {
    expect(isFirstContact({ email: " OLD@example.com " }, { ...empty, enrolled: new Set(["old@example.com"]) })).toBe(false);
  });
  it("excludes previously sent emails even without raw sending metadata", () => {
    expect(isFirstContact({ email: "old@example.com" }, { ...empty, sent: new Set(["old@example.com"]) })).toBe(false);
  });
  it("excludes a raw contact with a previous sending timestamp", () => {
    expect(isFirstContact({ email: "old@example.com", lastEmailedAt: 123 }, empty)).toBe(false);
  });
  it("excludes contacts without an email", () => {
    expect(isFirstContact({}, empty)).toBe(false);
  });
});