import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const person = z.object({ id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/), name: z.string().max(200).default(""), domain: z.string().max(2048).default(""), organizationName: z.string().max(200).default(""), linkedin: z.string().max(2048).optional(), rating: z.number().min(0).max(5).optional(), reviews: z.number().min(0).optional(), phone: z.string().max(100).optional(), city: z.string().max(200).optional(), industry: z.string().max(200).optional() });
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), people: z.array(person).min(1).max(2000), label: z.string().max(120), options: z.object({ useClaude: z.boolean().optional(), usePaid: z.boolean().optional(), revealPhone: z.boolean().optional(), findLinkedin: z.boolean().optional() }) }),
  z.object({ action: z.enum(["step", "status", "cancel"]), id: z.string().uuid(), full: z.boolean().optional() }),
  z.object({ action: z.literal("list") }),
]);
export const scanJobAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { data: role, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "ceo"]).limit(1).maybeSingle();
    if (error || !role) throw new Error("Only administrators can manage scans.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed, error: limitError } = await supabaseAdmin.rpc("check_rate_limit", { _key: `scan:${context.userId}`, _max: data.action === "start" ? 3 : 30, _window_seconds: 60 });
    if (limitError || !allowed) throw new Error("Please wait a minute before trying again.");
    const { Db } = await import("./db"); const db = new Db({});
    const helpers = await import("./scan-jobs.server");
    if (data.action === "list") return { jobs: await helpers.listScanJobs(db, context.userId) };
    if (data.action === "start") {
      if (JSON.stringify(data.people).length > 1000000) throw new Error("This scan is too large. Use fewer businesses.");
      const active = await db.select("scan_jobs", `created_by=eq.${context.userId}&status=in.(queued,running)&select=id&limit=3`);
      if (active.length >= 3) throw new Error("Finish or stop a current scan before starting another.");
      const [job] = await db.insert<import("./scan-jobs.server").ScanJob>("scan_jobs", { created_by: context.userId, label: data.label, people: data.people, total: data.people.length, options: data.options });
      if (!job) throw new Error("Could not save this scan.");
      return { job, produced: [] };
    }
    const job = await helpers.getScanJob(db, data.id, context.userId, data.full);
    if (!job) throw new Error("Scan not found.");
    if (data.action === "cancel") { await helpers.cancelScanJob(db, data.id, context.userId); return { job: await helpers.getScanJob(db, data.id, context.userId) }; }
    if (data.action === "status") return { job };
    const { resolveIntegrationEnv } = await import("./integration-settings.server");
    return helpers.stepScanJob(db, await resolveIntegrationEnv({}), data.id, context.userId);
  });