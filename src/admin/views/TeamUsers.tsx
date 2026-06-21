import { useEffect, useState } from "react";
import { Trash2, UserPlus, Crown, Shield, User as UserIcon } from "lucide-react";
import { createTeamUser, listTeamUsers, deleteTeamUser } from "@/lib/team-users.functions";

type TeamUser = {
  id: string;
  name: string;
  roles: string[];
  createdAt: string;
};

export function TeamUsers() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [role, setRole] = useState<"admin" | "user">("admin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listTeamUsers();
      setUsers(res);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Failed to load users" });
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await createTeamUser({ data: { name: name.trim(), password: pass, role } });
      setName("");
      setPass("");
      setMsg({ kind: "ok", text: `Created ${name.trim()} as ${role}` });
      await refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Failed to create user" });
    }
    setBusy(false);
  }

  async function remove(u: TeamUser) {
    if (!confirm(`Delete ${u.name}? This can't be undone.`)) return;
    try {
      await deleteTeamUser({ data: { userId: u.id } });
      await refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Failed to delete" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-[var(--brand-violet)]" />
          <h2 className="font-display text-lg font-bold">Add a new team member</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Username (e.g. john)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--brand-violet)]"
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
            placeholder="Password (min 6)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--brand-violet)]"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "user")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--brand-violet)]"
          >
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
          <button
            onClick={() => void submit()}
            disabled={busy || !name || !pass}
            className="rounded-lg bg-gradient-to-r from-[var(--brand-violet)] to-[var(--brand-coral)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
        {msg && (
          <p className={`mt-3 text-sm ${msg.kind === "ok" ? "text-[oklch(.55_.16_150)]" : "text-[oklch(.6_.2_25)]"}`}>
            {msg.text}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          They sign in with this username and password. Admins have full access; Users have the same access as Admins but cannot manage team members. Only the CEO can add or remove team members.
        </p>
      </section>

      {/* List */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold">Team members</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {users.map((u) => {
              const isCeo = u.roles.includes("ceo");
              const isAdmin = u.roles.includes("admin");
              const Icon = isCeo ? Crown : isAdmin ? Shield : UserIcon;
              const label = isCeo ? "CEO" : isAdmin ? "Admin" : "User";
              return (
                <div key={u.id} className="flex items-center gap-3 py-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                  {!isCeo && (
                    <button
                      onClick={() => void remove(u)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                      aria-label={`Delete ${u.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
