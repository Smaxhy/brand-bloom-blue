import { createServerFn } from "@tanstack/react-start";

export const seedAdminUser = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = "inspirovamanagement@inspirova.local";
  const password = "Kakapuma08";

  // Try to find existing user
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw listErr;
  let user = list.users.find((u) => u.email === email);

  if (!user) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    user = created.user!;
  } else {
    await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
  }

  const { error: roleErr } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
  if (roleErr) throw roleErr;

  return { ok: true, email, userId: user.id };
});
