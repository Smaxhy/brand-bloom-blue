import { Sparkles, Target, Megaphone, Filter } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { type AdminData, STAGES, fmtEuro } from "../store";
import { Panel, StatCard } from "../ui";

const COLORS = [
  "var(--brand-violet)",
  "var(--brand-coral)",
  "oklch(.66 .19 250)",
  "var(--brand-violet)",
  "var(--brand-light)",
  "oklch(.72 .15 60)",
];

export function Leads({ data }: { data: AdminData; update: (fn: (p: AdminData) => AdminData) => void }) {
  // sources from deals + raw
  const sourceMap = new Map<string, number>();
  data.deals.forEach((d) => sourceMap.set(d.source || "Other", (sourceMap.get(d.source || "Other") || 0) + 1));
  const sources = [...sourceMap.entries()].map(([name, value]) => ({ name, value }));

  // funnel by stage
  const funnel = STAGES.filter((s) => s.id !== "lost").map((s) => ({
    name: s.label,
    count: data.deals.filter((d) => d.stage === s.id).length,
  }));

  const totalDeals = data.deals.length;
  const won = data.deals.filter((d) => d.stage === "won").length;
  const conv = totalDeals ? Math.round((won / totalDeals) * 100) : 0;
  const rawCount = data.raw.length;
  const accepted = data.raw.filter((r) => r.status === "accepted").length;

  const channels = [
    { ch: "Meta Ads",   leads: 42 },
    { ch: "Google",     leads: 28 },
    { ch: "Cold Email", leads: 64 },
    { ch: "Referral",   leads: 11 },
    { ch: "Organic",    leads: 23 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Leads" value={String(totalDeals + rawCount)} hint={`${totalDeals} in CRM · ${rawCount} raw`} icon={Sparkles} accent="var(--brand-violet)" />
        <StatCard label="Win Rate" value={`${conv}%`} hint={`${won} deals won`} icon={Target} accent="var(--brand-violet)" />
        <StatCard label="Accepted Raw" value={String(accepted)} hint="Ready for outreach" icon={Filter} accent="var(--brand-coral)" />
        <StatCard label="Avg. Deal Value" value={fmtEuro(totalDeals ? Math.round(data.deals.reduce((s, d) => s + d.value, 0) / totalDeals) : 0)} hint="Across all stages" icon={Megaphone} accent="oklch(.66 .19 250)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-1 font-display text-lg font-bold">Lead sources</h3>
          <p className="mb-4 text-xs text-muted-foreground">Where your active deals come from</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sources} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                  {sources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {sources.map((s, i) => (
              <span key={s.name} className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-1 font-display text-lg font-bold">Conversion funnel</h3>
          <p className="mb-4 text-xs text-muted-foreground">Deal count by pipeline stage</p>
          <div className="space-y-2.5 pt-2">
            {funnel.map((f, i) => {
              const max = Math.max(...funnel.map((x) => x.count), 1);
              return (
                <div key={f.name}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-muted-foreground">{f.count}</span>
                  </div>
                  <div className="h-6 overflow-hidden rounded-lg bg-secondary">
                    <div className="h-full rounded-lg transition-all" style={{ width: `${(f.count / max) * 100}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel>
        <h3 className="mb-1 font-display text-lg font-bold">Channel performance</h3>
        <p className="mb-4 text-xs text-muted-foreground">Leads by acquisition channel (last 30 days)</p>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={channels}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="ch" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
              <Bar dataKey="leads" radius={[6, 6, 0, 0]} fill="var(--brand-violet)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
