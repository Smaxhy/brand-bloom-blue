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
  X,
} from "lucide-react";
import logo from "@/assets/inspirova-logo.png";
import { supabase } from "@/integrations/supabase/client";
import {
  loadData,
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
import { SettingsView } from "./views/SettingsView";

type ViewId =
  | "dashboard"
  | "pipeline"
  | "leads"
  | "scraper"
  | "raw"
  | "clients"
  | "finance"
  | "email"
  | "settings";

const NAV: { id: ViewId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pipeline", label: "Pipeline", icon: GitBranch },
  { id: "leads", label: "Lead Generation", icon: Sparkles },
  { id: "scraper", label: "Data Scraper", icon: Radar },
  { id: "raw", label: "Raw Data", icon: Database },
  { id: "clients", label: "Clients", icon: Users },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "email", label: "Email / GHL", icon: Mail },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function AdminApp() {
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [view, setView] = useState<ViewId>("dashboard");
  const [data, setData] = useState<AdminData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Subscribe to auth state first (synchronously), then check the
    // existing session. Verifies the signed-in user has the `admin` role.
    let unsubData: (() => void) | null = null;

    async function verifyAndHydrate(userId: string | undefined) {
      if (!userId) {
        setAuthed(false);
        setData(null);
        unsubData?.();
        unsubData = null;
        return;
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });
      if (!isAdmin) {
        await supabase.auth.signOut();
        setAuthed(false);
        return;
      }
      setAuthed(true);
      setData(loadData());
      const remote = await loadDataRemote();
      setData(remote);
      unsubData?.();
      unsubData = subscribeRemote(setData);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
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

  // single setter the views use; persists immediately
  const update = useMemo(
    () => (next: AdminData | ((prev: AdminData) => AdminData)) => {
      setData((prev) => {
        const base = prev ?? loadData();
        const resolved = typeof next === "function" ? (next as (p: AdminData) => AdminData)(base) : next;
        saveData(resolved);
        return resolved;
      });
    },
    [],
  );

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading admin…</div>
      </div>
    );
  }

  return <LoginScreen />;
}

  return (
    <div className="flex min-h-screen bg-[oklch(.985_.005_295)] text-foreground">
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
          {NAV.map((item) => {
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
              doLogout();
              setAuthed(false);
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
            <span className="h-2 w-2 rounded-full bg-[oklch(.7_.18_150)]" /> Signed in as InspirovaManagement
          </span>
        </header>

        <main className="flex-1 p-5 lg:p-7">
          {view === "dashboard" && <Dashboard data={data} go={setView} />}
          {view === "pipeline" && <Pipeline data={data} update={update} />}
          {view === "leads" && <Leads data={data} update={update} />}
          {view === "scraper" && <Scraper data={data} update={update} go={setView} />}
          {view === "raw" && <RawData data={data} update={update} go={setView} />}
          {view === "clients" && <Clients data={data} update={update} />}
          {view === "finance" && <Finance data={data} update={update} />}
          {view === "email" && <EmailHub data={data} update={update} />}
          {view === "settings" && <SettingsView data={data} update={update} />}
        </main>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (doLogin(user, pass)) {
      onSuccess();
    } else {
      setError("Incorrect username or password.");
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
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            className="w-full rounded-xl border border-white/15 bg-white/[.06] px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-[var(--brand-light)]"
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-white/15 bg-white/[.06] px-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-[var(--brand-light)]"
          />
          {error && <p className="text-sm text-[oklch(.72_.18_25)]">{error}</p>}
          <button
            onClick={submit}
            className="w-full rounded-xl bg-gradient-to-r from-[var(--brand-violet)] to-[var(--brand-coral)] px-4 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Sign in
          </button>
        </div>

        <p className="mt-6 text-center text-[.7rem] leading-relaxed text-white/35">
          Heads up: this gate stores a session flag in the browser. For real
          security, move credentials behind a server before going live.
        </p>
      </div>
    </div>
  );
}
