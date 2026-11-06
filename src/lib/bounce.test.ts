import { afterEach, describe, expect, it, vi } from "vitest";
import { isInvalidRecipientError, looksLikeEmail, normalizeEmail, preSendCheck, verifyEmail } from "./bounce";
import type { Db } from "./db";

afterEach(() => vi.unstubAllGlobals());

describe("address protection", () => {
  it("normalizes scraped mailbox addresses", () => {
    expect(normalizeEmail(" mailto:Owner@Example.COM); ")).toBe("owner@example.com");
  });
  it("rejects malformed addresses even when previously verified", async () => {
    const result = await preSendCheck({}, {} as Db, { id: "lead", email: "bad..name@example.com", email_verified: "valid" });
    expect(result.ok).toBe(false);
    expect(looksLikeEmail("owner@example.com")).toBe(true);
  });
  it("does not spend verification calls on malformed emails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyEmail({ REOON_API_KEY: "test" }, "not-an-email")).toBe("invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("distinguishes invalid recipients from mailbox authentication and rate errors", () => {
    expect(isInvalidRecipientError("CONVERSATIONS_MSG_INVALID_EMAIL")).toBe(true);
    expect(isInvalidRecipientError("Invalid To header")).toBe(true);
    expect(isInvalidRecipientError("401 invalid_grant")).toBe(false);
    expect(isInvalidRecipientError("429 Too Many Requests")).toBe(false);
  });
});