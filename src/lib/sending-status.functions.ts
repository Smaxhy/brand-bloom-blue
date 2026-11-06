import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSendingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { data: role, error } = await context.supabase.from("user_roles")
      .select("role").eq("user_id", context.userId).in("role", ["admin", "ceo"]).limit(1).maybeSingle();
    if (error || !role) throw new Error("Only administrators can check sending status.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed, error: limitError } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: `sending-status:${context.userId}`, _max: 10, _window_seconds: 60,
    });
    if (limitError || !allowed) throw new Error("Please wait a minute before checking again.");
    const { Db } = await import("./db");
    const { sendingStatus } = await import("./sending-status.server");
    try {
      return await sendingStatus(new Db({}));
    } catch {
      throw new Error("Sending status is temporarily unavailable. Please try again.");
    }
  });