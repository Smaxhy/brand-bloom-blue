import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NAME_RE = /^[A-Za-z0-9_.-]{3,40}$/;
const SYNTHETIC_DOMAIN = "inspirova.local";

function nameToEmail(name: string): string {
  return `${name.toLowerCase()}@${SYNTHETIC_DOMAIN}`;
}

async function assertCeo(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "ceo")
    .maybeSingle();
  if (error) throw new Error("Role check failed");
  if (!data) throw new Error("Forbidden: CEO only");
}

export const createTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; password: string; role: "admin" | "user" }) => {
    if (!NAME_RE.test(input.name)) throw new Error("Name must be 3-40 chars (letters, digits, . _ -)");
    if (typeof input.password !== "string" || input.password.length < 6) throw new Error("Password must be at least 6 characters");
    if (input.role !== "admin" && input.role !== "user") throw new Error("Role must be admin or user");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCeo(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = nameToEmail(data.name);
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);
    if (list.users.some((u) => u.email === email)) throw new Error("That username is already taken");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user");

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    return { ok: true, name: data.name, role: data.role };
  });

export const listTeamUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCeo(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    const { data: roles, error: rErr } = await supabaseAdmin.from("user_roles").select("user_id, role");
    if (rErr) throw new Error(rErr.message);
    const byUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    }
    return list.users
      .filter((u) => u.email?.endsWith(`@${SYNTHETIC_DOMAIN}`))
      .map((u) => ({
        id: u.id,
        name: u.email!.split("@")[0],
        roles: byUser.get(u.id) ?? [],
        createdAt: u.created_at,
      }));
  });

export const deleteTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (typeof input.userId !== "string" || input.userId.length < 8) throw new Error("Invalid user id");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertCeo(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
