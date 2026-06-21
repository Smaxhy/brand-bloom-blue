import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/seed-admin-once")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (token !== "kakapuma-seed-2026") {
          return new Response("Forbidden", { status: 403 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const email = "inspirovamanagement@inspirova.local";
        const password = "Kakapuma08";

        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
        if (listErr) return new Response(JSON.stringify({ step: "list", error: listErr.message }), { status: 500 });
        let user = list.users.find((u) => u.email === email);

        if (!user) {
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (createErr) return new Response(JSON.stringify({ step: "create", error: createErr.message }), { status: 500 });
          user = created.user!;
        } else {
          await supabaseAdmin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
        }

        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
        if (roleErr) return new Response(JSON.stringify({ step: "role", error: roleErr.message }), { status: 500 });

        return new Response(JSON.stringify({ ok: true, email, userId: user.id }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
