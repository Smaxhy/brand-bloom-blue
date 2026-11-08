import { describe, it, expect } from "vitest";
import { integrationInputSchema } from "./integration-settings-schema";

describe("integration entry validation", () => {
  it("accepts the optional Brave Search credential", () => {
    expect(integrationInputSchema.safeParse({ values: { BRAVE_SEARCH_API_KEY: "test-only" } }).success).toBe(true);
  });
  it("accepts Google client ID and secret together", () => {
    expect(integrationInputSchema.safeParse({ values: { GOOGLE_OAUTH_CLIENT_ID: "example.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "test-only" } }).success).toBe(true);
  });
  it("does not allow browser configuration of the database service credential", () => {
    expect(integrationInputSchema.safeParse({ values: { SUPABASE_SERVICE_ROLE_KEY: "test-only" } }).success).toBe(false);
  });
  it("does not allow browser configuration of the scheduler secret", () => {
    expect(integrationInputSchema.safeParse({ values: { CRON_SECRET: "test-only" } }).success).toBe(false);
  });
  it("rejects empty credentials", () => {
    expect(integrationInputSchema.safeParse({ values: { APOLLO_API_KEY: "" } }).success).toBe(false);
  });
});