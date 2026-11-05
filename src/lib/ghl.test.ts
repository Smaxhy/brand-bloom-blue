import { afterEach, describe, expect, it, vi } from "vitest";
import { ghlSendEmail, textToMinimalHtml } from "./ghl";

afterEach(() => vi.unstubAllGlobals());

describe("GHL email body", () => {
  const email = {
    contactId: "test-contact", subject: "Follow-up", html: "",
    text: "Hello\nYour results & next steps", fromName: "Test", fromEmail: "sender@example.com",
  };

  it("sends the plain-text body through the GHL html field", async () => {
    const fetchMock = vi.fn(async () => Response.json({ messageId: "message-1", conversationId: "conversation-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await ghlSendEmail("test-token", email);
    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(request.body));
    expect(payload.html).toBe(textToMinimalHtml(email.text));
    expect(payload.message).toBe(email.text);
    expect(result.id).toBe("message-1");
  });

  it("preserves an existing HTML email body", async () => {
    const fetchMock = vi.fn(async () => Response.json({ messageId: "message-2" }));
    vi.stubGlobal("fetch", fetchMock);
    await ghlSendEmail("test-token", { ...email, html: "<p>Existing body</p>" });
    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request.body)).html).toBe("<p>Existing body</p>");
  });

  it("escapes markup and prevents quoted URLs from creating attributes", () => {
    const body = textToMinimalHtml('<script>alert(1)</script> https://example.com/" onclick="alert(2) & next');
    expect(body).not.toContain("<script>");
    expect(body).not.toContain('href="https://example.com/" onclick=');
    expect(body).toContain('href="https://example.com/"');
    expect(body).toContain("&lt;script&gt;");
    expect(body).toContain("&quot;");
    expect(body).toContain("&amp; next");
  });
});