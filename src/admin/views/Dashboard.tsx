import {
  Wallet,
  Users,
  GitBranch,
  Sparkles,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  CartesianGrid,
} from "recharts";
import { type AdminData, STAGES, fmtEuro } from "../store";
import { Panel, StatCard } from "../ui";

export function Dashboard({
  data,
  go,
}: {
  data: AdminData;
  go: (v: any) => void;
}) {
  const income = data.transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = data.transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const net = income - expense;
  const pipelineValue = data.deals
    .filter((d) => d.stage !== "lost" && d.stage !== "won")
    .reduce((s, d) => s + d.value, 0);
  const mrr = data.clients.filter((c) => c.status === "active").reduce((s, c) => s + c.monthly, 0);
  const newLeads = data.raw.filter((r) => r.status === "raw").length;

  // build a simple monthly cashflow series from transactions
  const byDate = [...data.transactions].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const series = byDate.map((t) => {
    running += t.type === "income" ? t.amount : -t.amount;
    return { date: t.date.slice(5), net: running };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net Cashflow" value={fmtEuro(net)} hint={`${fmtEuro(income)} in · ${fmtEuro(expense)} out`} icon={Wallet} accent="var(--brand-violet)" />
        <StatCard label="Monthly Recurring" value={fmtEuro(mrr)} hint={`${data.clients.filter((c) => c.status === "active").length} active clients`} icon={Users} accent="var(--brand-violet)" />
        <StatCard label="Open Pipeline" value={fmtEuro(pipelineValue)} hint={`${data.deals.filter((d) => d.stage !== "won" && d.stage !== "lost").length} live deals`} icon={GitBranch} accent="var(--brand-coral)" />
        <StatCard label="New Raw Leads" value={String(newLeads)} hint="Awaiting review" icon={Sparkles} accent="oklch(.66 .19 250)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Cashflow</h3>
              <p className="text-xs text-muted-foreground">Running net balance over recorded transactions</p>
            </div>
            <span className="flex items-center gap-1 text-sm font-semibold text-[var(--brand-violet)]">
              <TrendingUp className="h-4 w-4" /> {fmtEuro(net)}
            </span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-violet)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--brand-violet)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: number) => fmtEuro(v)}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="net" stroke="var(--brand-violet)" strokeWidth={2.5} fill="url(#cf)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Pipeline</h3>
            <button onClick={() => go("pipeline")} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Open <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-3">
            {STAGES.map((st) => {
              const deals = data.deals.filter((d) => d.stage === st.id);
              const val = deals.reduce((s, d) => s + d.value, 0);
              const max = Math.max(...STAGES.map((s) => data.deals.filter((d) => d.stage === s.id).reduce((a, d) => a + d.value, 0)), 1);
              return (
                <div key={st.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{st.label}</span>
                    <span className="text-muted-foreground">{deals.length} · {fmtEuro(val)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full" style={{ width: `${(val / max) * 100}%`, background: st.tone }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel>
        <h3 className="mb-4 font-display text-lg font-bold">Recent activity</h3>
        <div className="space-y-2.5">
          {[...data.deals]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 5)
            .map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-sm font-bold">
                  {d.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{d.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{d.contact} · {d.source}</div>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                  {STAGES.find((s) => s.id === d.stage)?.label}
                </span>
                <span className="hidden text-sm font-semibold sm:block">{fmtEuro(d.value)}</span>
              </div>
            ))}
        </div>
      </Panel>
    </div>
  );
}
