/**
 * Auth gate for the same-origin /api/* proxies.
 *
 * Every proxy spends money (Apollo credits, Places quota, Claude tokens) or
 * acts as you (sending email), so every call must come from a signed-in admin.
 * The browser attaches the Supabase session token as `Authorization: Bearer …`
 * (see `authFetch` in src/admin/store.ts); here we verify it against Supabase
 * Auth and, when the app has roles, require admin/ceo.
 *
 * Cron / webhook routes use a shared secret instead (see requireCronSecret).
 */

type Env = Record<string, string | undefined>;

export interface ApiUser {
  id: string;
  email: string;
}

function env(e: Env, name: string): string | undefined {
  return e[name] || (typeof process !== "undefined" ? process.env?.[name] : undefined);
}

/** Verify the bearer token with Supabase Auth. Returns the user or null. */
export async function getApiUser(request: Request, e: Env): Promise<ApiUser | null> {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const url = env(e, "SUPABASE_URL") || env(e, "VITE_SUPABASE_URL");
  const anon = env(e, "SUPABASE_PUBLISHABLE_KEY") || env(e, "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anon) return null;

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as {
      id?: string;
      email?: string;
      factors?: { status?: string; factor_type?: string }[];
    };
    if (!u.id) return null;

    // 2FA: if the account has a verified authenticator, the session must have
    // completed it (JWT claim aal = "aal2"). Otherwise the API treats it as signed out.
    const hasTotp = (u.factors ?? []).some((f) => f.status === "verified");
    if (hasTotp) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { aal?: string };
        if (payload.aal !== "aal2") return null;
      } catch {
        return null;
      }
    }

    // Require an explicit verified role; missing roles or lookup failures deny access.
    try {
      const roleRes = await fetch(
        `${url.replace(/\/$/, "")}/rest/v1/user_roles?select=role&user_id=eq.${u.id}`,
        {
          headers: { apikey: anon, Authorization: `Bearer ${token}` },
        },
      );
      if (!roleRes.ok) return null;
      const rows = (await roleRes.json()) as { role?: string }[];
      if (!Array.isArray(rows) || !rows.some((r) => r.role === "admin" || r.role === "ceo")) return null;
    } catch {
      return null;
    }

    return { id: u.id, email: u.email || "" };
  } catch {
    return null;
  }
}

/** Cron triggers and internal jobs authenticate with a shared secret header. */
export function hasCronSecret(request: Request, e: Env): boolean {
  const expected = env(e, "CRON_SECRET");
  if (!expected) return false;
  const got =
    request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  return got.length > 0 && got === expected;
}

export function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "unauthorized", message: "Sign in to the admin panel first." }),
    {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}
