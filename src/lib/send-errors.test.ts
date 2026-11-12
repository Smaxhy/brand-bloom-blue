import { describe, expect, it } from "vitest";
import { CANT_READ, CANT_SEND, cantSend, isMailboxAuthError, mailboxProblem, shownMailboxError } from "./send-errors";

describe("mailbox problems in plain words", () => {
  it("Google: a permission that wasn't given, for sending and for reading", () => {
    const send = mailboxProblem('gmail send 403: {"error":{"message":"Request had insufficient authentication scopes."}}');
    expect(send?.text).toMatch(/didn't give permission to send from this mailbox \(error 403\)\. Reconnect it in Settings → Sending mailboxes and tick every box/);
    expect(send?.reconnect).toBe(true);
    expect(mailboxProblem("gmail list 403: insufficientPermissions")?.text).toMatch(/permission to read this mailbox/);
    // no reason given at all: still says what to do
    expect(mailboxProblem("gmail list 403")?.text).toMatch(/refused to let this mailbox's inbox be read \(error 403\).*tick every box/);
  });
  it("Google: the Gmail API switched off is not a reconnect problem", () => {
    const p = mailboxProblem("gmail list 403: accessNotConfigured");
    expect(p?.text).toMatch(/Gmail API is switched off in your Google Cloud project/);
    expect(p?.reconnect).toBe(false);
  });
  it("Google: expired or withdrawn sign-in", () => {
    expect(mailboxProblem("gmail send 401: Invalid Credentials")?.text).toMatch(/no longer accepts this mailbox's sign-in \(error 401\)/);
    expect(mailboxProblem("token refresh failed: invalid_grant")?.text).toMatch(/expired or was withdrawn\. Reconnect it/);
    expect(mailboxProblem("mailbox not connected")?.text).toMatch(/isn't connected any more/);
  });
  it("GoHighLevel: a refused key or location", () => {
    expect(mailboxProblem("GHL send 401: Invalid JWT", "ghl")?.text).toMatch(/GoHighLevel refused the connection \(error 401\): the API key or location is no longer valid/);
    expect(mailboxProblem("GHL mailbox is not connected")?.text).toMatch(/GoHighLevel isn't connected for this mailbox/);
  });
  it("a 'slow down' or a problem with one recipient is not a mailbox problem", () => {
    expect(mailboxProblem("gmail send 403: userRateLimitExceeded")).toBeNull();
    expect(mailboxProblem("GHL send 429: Too many requests")).toBeNull();
    expect(mailboxProblem("GHL send 422: something about this contact (id 4031)")).toBeNull();
    expect(mailboxProblem("Network connection lost.")).toBeNull();
  });
  it("covers everything the sender treats as a connection problem", () => {
    for (const m of [
      "gmail send 401: x",
      "gmail send 403: x",
      "gmail list 403: insufficientPermissions",
      "GHL send 403: x",
      "GHL location token 401: x",
      "GHL conversations 401: x",
      "token refresh failed: invalid_grant",
      "mailbox not connected",
      "GHL mailbox is not connected",
      "GHL returned no location token",
      "UNAUTHENTICATED",
    ]) {
      expect(isMailboxAuthError(m)).toBe(true);
      expect(mailboxProblem(m)?.text, m).toBeTruthy();
    }
  });
  it("never passes the provider's own words on", () => {
    const raw = 'gmail send 403: {"error":{"code":403,"message":"The caller does not have permission","status":"PERMISSION_DENIED","traceId":"zz91"}}';
    expect(mailboxProblem(raw)?.text).not.toMatch(/caller does not have|PERMISSION_DENIED|zz91/);
    expect(shownMailboxError(raw)).not.toMatch(/caller does not have|PERMISSION_DENIED|zz91/);
    expect(shownMailboxError("something odd from an older version")).toMatch(/reported a problem/);
    expect(shownMailboxError("Token refresh failed: invalid_grant. Reconnect this mailbox.")).toMatch(/expired or was withdrawn/);
    expect(shownMailboxError(`${CANT_READ}already plain`)).toBe(`${CANT_READ}already plain`);
    expect(shownMailboxError("")).toBeNull();
  });
  it("knows which mailboxes shouldn't be given new people", () => {
    expect(cantSend({ status: "active", last_error: null })).toBe(false);
    expect(cantSend({ status: "active", last_error: `${CANT_READ}x` })).toBe(false); // can still send first emails
    expect(cantSend({ status: "active", last_error: `${CANT_SEND}x` })).toBe(true);
    expect(cantSend({ status: "paused", last_error: null })).toBe(true);
    expect(cantSend({ status: "error", last_error: null })).toBe(true);
  });
});
