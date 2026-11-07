import { describe, expect, it } from "vitest";
import { emailMessages, replyState } from "./ghl-inbox";
describe("GoHighLevel inbox history", () => {
  const outgoing = { id: "sent", direction: "outbound", dateAdded: "2026-11-07T10:00:00Z", messageType: "TYPE_EMAIL", status: "sent" };
  it("shows a reply even when a later outbound email exists", () => {
    expect(replyState([outgoing, { ...outgoing, id: "reply", direction: "inbound" }, { ...outgoing, id: "followup", dateAdded: "2026-11-07T12:00:00Z" }])).toBe("Replied");
  });
  it("does not classify incoming SMS as an email reply", () => {
    expect(replyState([outgoing, { ...outgoing, id: "sms", direction: "inbound", messageType: "TYPE_SMS" }])).toBe("No reply in loaded history");
  });
  it("includes numeric email type and excludes unknown non-email messages", () => {
    expect(emailMessages([{ ...outgoing, messageType: undefined, type: 3 }, { ...outgoing, id: "unknown", messageType: undefined }]).map((m) => m.id)).toEqual(["sent"]);
  });
});