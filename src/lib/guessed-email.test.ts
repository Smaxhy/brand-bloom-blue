import { expect, it } from "vitest";
import { canEnrollGuessedEmail } from "./guessed-email";
it("requires confirmation for guessed addresses unless explicitly overridden", () => {
  expect(canEnrollGuessedEmail("valid", false)).toBe(true);
  for (const status of ["mx_ok", "risky", "unknown"]) {
    expect(canEnrollGuessedEmail(status, false)).toBe(false);
    expect(canEnrollGuessedEmail(status, "true")).toBe(false);
    expect(canEnrollGuessedEmail(status, true)).toBe(true);
  }
});
it("never permits invalid guesses even with an override", () => {
  expect(canEnrollGuessedEmail("invalid", true)).toBe(false);
});