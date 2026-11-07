import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailCheckInput } from "./email-check-schema";

export const checkEmailAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => emailCheckInput.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { data: role, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "ceo"]).limit(1).maybeSingle();
    if (error || !role) throw new Error("Only administrators can check email addresses.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed, error: limitError } = await supabaseAdmin.rpc("check_rate_limit", { _key: `email-check:${context.userId}`, _max: 10, _window_seconds: 60 });
    if (limitError || allowed !== true) throw new Error("Please wait a minute before checking again.");
    const { resolveIntegrationEnv } = await import("./integration-settings.server");
    const { verifyEmail, normalizeEmail } = await import("./bounce");
    const env = await resolveIntegrationEnv({});
    // Environment-only credentials also remain server-only.
    if (!env.REOON_API_KEY) env.REOON_API_KEY = process.env["REOON_API_KEY"];
    const emails = [...new Set(data.emails.map(normalizeEmail))];
    const results: Record<string, import("./bounce").VerifyStatus> = {};
    const started = Date.now();
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, emails.length) }, async () => {
      while (cursor < emails.length && Date.now() - started < 25000) {
        const email = emails[cursor++];
        results[email] = await verifyEmail(env, email);
      }
    }));
    // This is advisory. Invalid badges never falsely promise a suppression write.
    return { results, unchecked: emails.filter((email) => !results[email]) };
  });