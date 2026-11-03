import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { integrationInputSchema } from "./integration-settings-schema";

export const canConfigureIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "ceo"]).limit(1).maybeSingle();
    return { allowed: !error && !!data };
  });

export const saveIntegrationCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => integrationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: role, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "ceo"]).limit(1).maybeSingle();
    if (roleError || !role) throw new Error("Only administrators can update shared integrations.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: permitted, error: limitError } = await supabaseAdmin.rpc("check_rate_limit", { _key: `integration-settings:${context.userId}`, _max: 10, _window_seconds: 60 });
    if (limitError || !permitted) throw new Error("Please wait a minute before updating integrations again.");
    const { encryptCredential } = await import("./integration-settings.server");
    const rows = await Promise.all(Object.entries(data.values).map(async ([name, value]) => ({ name, ciphertext: await encryptCredential(value, name, {}), updated_by: context.userId, updated_at: new Date().toISOString() })));
    const { error } = await supabaseAdmin.from("integration_credentials").upsert(rows);
    if (error) throw new Error("Could not save integration details. Please try again.");
    return { ok: true };
  });