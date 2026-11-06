import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  company: z.string().trim().max(120).optional().default(""),
  message: z.string().trim().min(1).max(2000),
  website: z.string().max(0).optional(), // honeypot
});

async function hashIp(ip: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("insp-contact:" + ip));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try { raw = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return json({ error: "Please fill in your name, a valid e-mail and a message." }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        const ip_hash = await hashIp(ip);
        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("contact_submissions").select("id", { count: "exact", head: true })
          .eq("ip_hash", ip_hash).gte("created_at", since);
        if ((count ?? 0) >= 5) return json({ error: "Too many messages. Please try again later or e-mail us directly." }, 429);
        const { name, email, company, message } = parsed.data;
        const { error } = await supabaseAdmin.from("contact_submissions")
          .insert({ name, email, company: company || null, message, ip_hash });
        if (error) { console.error("contact insert failed", error.message); return json({ error: "Something went wrong. Please e-mail us directly." }, 500); }
        return json({ ok: true });
      },
    },
  },
});
