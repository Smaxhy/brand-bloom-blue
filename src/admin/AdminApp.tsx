import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  GitBranch,
  Sparkles,
  Radar,
  Database,
  Users,
  Wallet,
  Mail,
  Settings as SettingsIcon,
  LogOut,
  Lock,
  Menu,
  ListChecks,
  BarChart3,
} from "lucide-react";
import logo from "@/assets/inspirova-logo.png";
import { supabase } from "@/integrations/supabase/client";
import {
  loadDataRemote,
  saveData,
  subscribeRemote,
  login as doLogin,
  logout as doLogout,
  type AdminData,
} from "./store";
import { Dashboard } from "./views/Dashboard";
import { Pipeline } from "./views/Pipeline";
import { Leads } from "./views/Leads";
import { Scraper } from "./views/Scraper";
import { RawData } from "./views/RawData";
import { Clients } from "./views/Clients";
import { Finance } from "./views/Finance";
import { EmailHub } from "./views/EmailHub";
import { Tasks } from "./views/Tasks";
import { SettingsView } from "./views/SettingsView";
import { Statistics } from "./views/Statistics";
import { TeamUsers } from "./views/TeamUsers";
import { UserPlus } from "lucide-react";

type ViewId =
  | "dashboard"
  | "pipeline"
  | "leads"
  | "scraper"
  | "raw"
  | "clients"
  | "statistics"
  | "finance"
  | "email"
  | "tasks"
  | "team"
  | "settings";

type TeamRole = "ceo" | "admin" | "user";

const BASE_NAV: { id: ViewId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pipeline", label: "Pipeline", icon: GitBranch },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "leads", label: "Lead Generation", icon: Sparkles },
  { id: "scraper", label: "Data Scraper", icon: Radar },
  { id: "raw", label: "Raw Data", icon: Database },
  { id: "clients", label: "Clients", icon: Users },
  { id: "statistics", label: "Statistics", icon: BarChart3 },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "email", label: "Email / GHL", icon: Mail },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function AdminApp() {
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<TeamRole | null>(null);
  const [accountName, setAccountName] = useState("");
  const [view, setView] = useState<ViewId>("dashboard");
  const [data, setData] = useState<AdminData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    const html = document.documentElement;
    if (data.settings.theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [data?.settings.theme]);

  useEffect(() => {
    setMounted(true);

    let unsubData: (() => void) | null = null;
    let currentUserId: string | null = null;

    async function verifyAndHydrate(userId: string | undefined) {
      if (!userId) {
        currentUserId = null;
        setAuthed(false);
        setRole(null);
        setAccountName("");
        setData(null);
        setLoadError("");
        unsubData?.();
        unsubData = null;
        return;
      }
      // Skip re-hydration if the same user is already loaded — e.g. TOKEN_REFRESHED
      // fires when the tab regains focus; we don't want to clear state.
      if (userId === currentUserId) return;
      currentUserId = userId;
      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (roleError) {
        setAuthed(true);
        setLoadError("Your login worked, but the role check is temporarily unavailable. Your data was not changed.");
        setData(null);
        return;
      }
      const list = (roles ?? []).map((r) => r.role);
      const resolved: TeamRole | null = list.includes("ceo")
        ? "ceo"
        : list.includes("admin")
          ? "admin"
          : list.includes("user")
            ? "user"
            : null;
      if (!resolved) {
        await supabase.auth.signOut();
        currentUserId = null;
        setAuthed(false);
        setRole(null);
        setAccountName("");
        return;
      }
      setRole(resolved);
      const { data: userResult } = await supabase.auth.getUser();
      const email = userResult.user?.email ?? "";
      setAccountName(email.endsWith("@inspirova.local") ? email.split("@")[0] : email || "Account");
      setAuthed(true);
      setData(null);
      setLoadError("");
      try {
        const remote = await loadDataRemote();
        setData(remote);
      } catch (error) {
        setLoadError((error as Error).message || "Admin data could not be loaded.");
        return;
      }
      unsubData?.();
      unsubData = subscribeRemote(setData);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Only react to real sign-in/out. TOKEN_REFRESHED / USER_UPDATED fire
      // on tab focus and would otherwise cause a flicker / data reload.
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "INITIAL_SESSION") return;
      void verifyAndHydrate(session?.user?.id);
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      void verifyAndHydrate(session?.user?.id);
    });

    return () => {
      sub.subscription.unsubscribe();
      unsubData?.();
    };
  }, []);

  const update = useMemo(
    () => (next: AdminData | ((prev: AdminData) => AdminData)) => {
      setData((prev) => {
        if (!prev) return prev;
        const base = prev;
        const resolved = typeof next === "function" ? (next as (p: AdminData) => AdminData)(base) : next;
        saveData(resolved);
        return resolved;
      });
    },
    [],
  );

  const nav = useMemo(() => {
    if (role === "ceo") {
      const items = [...BASE_NAV];
      // Insert Team Members above Settings
      const settingsIdx = items.findIndex((n) => n.id === "settings");
      items.splice(settingsIdx, 0, { id: "team", label: "Team Members", icon: UserPlus });
      return items;
    }
    return BASE_NAV;
  }, [role]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading admin…</div>
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen />;
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-sm rounded-xl border border-border bg-card p-5 text-center shadow-sm">
          <div className="text-sm font-semibold text-foreground">{loadError ? "Data load paused" : "Loading data…"}</div>
          {loadError && <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>}
          {loadError && (
            <button
              onClick={() => void supabase.auth.getSession().then(({ data: { session } }) => session?.user?.id && location.reload())}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Retry safely
            </button>
          )}
        </div>
      </div>
    );
  }

  const current = nav.find((n) => n.id === view) ?? nav[0];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* mobile overlay */}
      {sidebarOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img src={logo} alt="Inspirova" className="h-9 w-9 rounded-lg object-cover" />
          <div className="leading-tight">
            <div className="font-display text-[1.05rem] font-bold">Inspirova</div>
            <div className="text-[.65rem] uppercase tracking-[.14em] text-muted-foreground">Admin Suite</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_var(--brand-violet)]"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <button
            onClick={() => {
              void doLogout();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/80 px-5 py-3.5 backdrop-blur">
          <button
            onClick={() => setSidebarOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-foreground md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl font-bold tracking-tight">{current.label}</h1>
          <span className="ml-auto hidden items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <span className="h-2 w-2 rounded-full bg-[oklch(.7_.18_150)]" /> Signed in as {accountName}
          </span>
        </header>

        <main id="main-content" className="flex-1 p-5 lg:p-7" role="main">
          {view === "dashboard" && <Dashboard data={data} go={setView} />}
          {view === "pipeline" && <Pipeline data={data} update={update} />}
          {view === "tasks" && <Tasks data={data} update={update} />}
          {view === "leads" && <Leads data={data} update={update} />}
          {view === "scraper" && <Scraper data={data} update={update} go={setView} />}
          {view === "raw" && <RawData data={data} update={update} go={setView} />}
          {view === "clients" && <Clients data={data} update={update} />}
          {view === "statistics" && <Statistics data={data} update={update} />}
          {view === "finance" && <Finance data={data} update={update} />}
          {view === "email" && <EmailHub data={data} update={update} />}
          {view === "team" && role === "ceo" && <TeamUsers />}
          {view === "settings" && <SettingsView data={data} update={update} />}
        </main>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    const err = await doLogin(email, pass);
    setBusy(false);
    if (err) setError(err);
  }

  async function copyCode() {
    if (!error) return;
    const payload = `Inspirova admin login error\nCode: ${error.code}\nMessage: ${error.message}\nTime: ${new Date().toISOString()}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select-and-copy via a temp textarea
      const ta = document.createElement("textarea");
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[oklch(.18_.04_295)] px-4">
      <div className="pointer-events-none absolute -right-40 top-0 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand-violet)_30%,transparent),transparent_68%)]" />
      <div className="pointer-events-none absolute -left-40 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand-coral)_18%,transparent),transparent_68%)]" />

      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/[.04] p-8 backdrop-blur-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-white">Inspirova Admin</h1>
          <p className="mt-1 text-sm text-white/50">Private management suite. Authorised access only.</p>
        </div>

        <div className="space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Username"
            type="text"
            autoComplete="username"
            className="w-full rounded-xl border border-white/15 bg-white/[.06] px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-[var(--brand-light)]"
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-white/15 bg-white/[.06] px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-[var(--brand-light)]"
          />
          {error && (
            <div className="rounded-xl border border-[oklch(.55_.18_25/.4)] bg-[oklch(.35_.12_25/.15)] p-3">
              <p className="text-sm text-[oklch(.82_.15_25)]">{error.message}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <code className="rounded-md bg-black/30 px-2 py-1 font-mono text-[.7rem] text-white/70">
                  {error.code}
                </code>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[.7rem] font-medium text-white/80 transition hover:bg-white/10"
                >
                  {copied ? "Copied ✓" : "Copy code"}
                </button>
              </div>
              <p className="mt-2 text-[.65rem] leading-snug text-white/40">
                Send this code to support so they can look up the exact failure.
              </p>
            </div>
          )}
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-[var(--brand-violet)] to-[var(--brand-coral)] px-4 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <p className="mt-6 text-center text-[.7rem] leading-relaxed text-white/35">
          Accounts are managed by Inspirova. Contact the team if you need access.
        </p>
      </div>
    </div>
  );
}
