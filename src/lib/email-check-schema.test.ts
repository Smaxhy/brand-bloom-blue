import { expect, it } from "vitest";
import { emailCheckInput } from "./email-check-schema";
it("bounds verification batches and rejects malformed payloads", () => {
  expect(emailCheckInput.safeParse({ emails: Array(50).fill("owner@business.test") }).success).toBe(true);
  expect(emailCheckInput.safeParse({ emails: Array(51).fill("owner@business.test") }).success).toBe(false);
  expect(emailCheckInput.safeParse({ emails: "owner@business.test" }).success).toBe(false);
  expect(emailCheckInput.safeParse({ emails: [42] }).success).toBe(false);
  expect(emailCheckInput.safeParse({ emails: ["a".repeat(255)] }).success).toBe(false);
});