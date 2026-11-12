import { describe, expect, it } from "vitest";
import { GMAIL_SCOPES, grantedGmailAccess } from "./google-oauth";

const S = "https://www.googleapis.com/auth/";

describe("what Google granted when a mailbox was connected", () => {
  it("everything ticked: may send and read", () => {
    expect(grantedGmailAccess(GMAIL_SCOPES)).toEqual({ known: true, send: true, read: true });
    expect(grantedGmailAccess("https://mail.google.com/ openid")).toEqual({ known: true, send: true, read: true });
  });
  it("a box left unticked is noticed straight away", () => {
    expect(grantedGmailAccess(`${S}gmail.readonly ${S}userinfo.email openid`)).toMatchObject({ send: false, read: true });
    expect(grantedGmailAccess(`${S}gmail.send ${S}userinfo.email openid`)).toMatchObject({ send: true, read: false });
    expect(grantedGmailAccess(`${S}userinfo.email openid`)).toMatchObject({ send: false, read: false });
  });
  it("assumes nothing when Google doesn't say", () => {
    expect(grantedGmailAccess("")).toEqual({ known: false, send: true, read: true });
    expect(grantedGmailAccess(undefined)).toEqual({ known: false, send: true, read: true });
  });
});
