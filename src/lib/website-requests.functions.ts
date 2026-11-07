import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WebsiteRequest } from "@/admin/pipeline-merge";

export const listWebsiteRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { data: role, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "ceo"]).limit(1).maybeSingle();
    if (roleError || !role) throw new Error("Only administrators can read website requests.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed, error: limitError } = await supabaseAdmin.rpc("check_rate_limit", { _key: `website-requests:${context.userId}`, _max: 10, _window_seconds: 60 });
    if (limitError || allowed !== true) throw new Error("Please wait a minute before refreshing requests.");
    const { data, error } = await context.supabase.from("contact_submissions")
      .select("id,kind,name,email,company,phone,message,personal_message,services,estimates,attribution,consent,created_at")
      .order("created_at", { ascending: false }).limit(2000);
    if (error) throw new Error("Website requests could not be loaded. Please try again.");
    return { requests: (data ?? []) as unknown as WebsiteRequest[], truncated: data?.length === 2000 };
  });