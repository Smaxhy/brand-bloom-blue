import { describe, it, expect } from "vitest";
import { classifyLoginError } from "./store";

describe("classifyLoginError", () => {
  it("treats an empty / unreadable answer as a connection hiccup, not a bad password", () => {
    for (const raw of ["", "{}", "[object Object]", "null", "undefined"]) {
      const { kind, message } = classifyLoginError(raw);
      expect(kind).toBe("CONN");
      expect(message).toMatch(/clear answer|try again/i);
      expect(message).not.toContain("{}");
    }
  });

  it("flags a 5xx as a server problem and shows the status", () => {
    const { kind, message } = classifyLoginError("{}", { status: 503 });
    expect(kind).toBe("SRV");
    expect(message).toContain("HTTP 503");
  });

  it("names wrong credentials from the message or a 400", () => {
    expect(classifyLoginError("Invalid login credentials").kind).toBe("AUTH");
    expect(classifyLoginError("", { status: 400 }).kind).toBe("AUTH");
  });

  it("recognises unconfirmed email, role refusal, rate limit and timeout", () => {
    expect(classifyLoginError("Email not confirmed").kind).toBe("CONF");
    expect(classifyLoginError("", { status: 403 }).kind).toBe("ROLE");
    expect(classifyLoginError("Too many requests", { status: 429 }).kind).toBe("RATE");
    expect(classifyLoginError("request timed out").kind).toBe("TIME");
  });

  it("detects network failures including a status-0 retryable fetch error", () => {
    expect(classifyLoginError("Failed to fetch").kind).toBe("NET");
    expect(classifyLoginError("", { status: 0, name: "AuthRetryableFetchError" }).kind).toBe("NET");
  });

  it("separates a missing-backend configuration error from a login failure", () => {
    const { kind, message } = classifyLoginError("Missing Supabase environment variable(s): SUPABASE_URL");
    expect(kind).toBe("CFG");
    expect(message).toMatch(/backend|configuration/i);
  });

  it("passes through a genuine but unrecognised message", () => {
    const { kind, message } = classifyLoginError("Signups not allowed for this instance");
    expect(kind).toBe("ERR");
    expect(message).toBe("Signups not allowed for this instance");
  });
});
