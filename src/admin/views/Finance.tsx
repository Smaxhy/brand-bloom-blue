import { useState } from "react";
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { type AdminData, type Transaction, uid, fmtEuro } from "../store";
import { Panel, StatCard, Modal, Field, inputCls, Btn } from "../ui";

const empty = (): Transaction => ({
  id: uid("t"),
  label: "",
  type: "income",
  amount: 0,
  category: "",
  date: new Date().toISOString().slice(0, 10),
});

export function Finance({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const [editing, setEditing] = useState<Transaction | null>(null);

  function save(t: Transaction) {
    update((p) => {
      const exists = p.transactions.some((x) => x.id === t.id);
      return {
        ...p,
        transactions: exists ? p.transactions.map((x) => (x.id === t.id ? t : x)) : [t, ...p.transactions],
      };
    });
    setEditing(null);
  }
  function remove(id: string) {
    update((p) => ({ ...p, transactions: p.transactions.filter((t) => t.id !== id) }));
  }

  const income = data.transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = data.transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  // monthly grouped
  const monthMap = new Map<string, { income: number; expense: number }>();
  data.transactions.forEach((t) => {
    const m = t.date.slice(0, 7);
    const cur = monthMap.get(m) || { income: 0, expense: 0 };
    if (t.type === "income") cur.income += t.amount;
    else cur.expense += t.amount;
    monthMap.set(m, cur);
  });
  const monthly = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, v]) => ({ month: m.slice(2), income: v.income, expense: v.expense }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Income" value={fmtEuro(income)} icon={ArrowUpRight} accent="oklch(.7 .18 150)" />
        <StatCard label="Total Expense" value={fmtEuro(expense)} icon={ArrowDownRight} accent="var(--brand-coral)" />
        <StatCard label="Net Profit" value={fmtEuro(income - expense)} icon={Wallet} accent="var(--brand-violet)" />
      </div>

      <Panel>
        <h3 className="mb-1 font-display text-lg font-bold">Income vs. expense</h3>
        <p className="mb-4 text-xs text-muted-foreground">Monthly money flow</p>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => fmtEuro(v)} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
              <Bar dataKey="income" radius={[6, 6, 0, 0]} fill="oklch(.7 .18 150)" />
              <Bar dataKey="expense" radius={[6, 6, 0, 0]} fill="var(--brand-coral)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel className="p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-display text-lg font-bold">Transactions</h3>
          <Btn onClick={() => setEditing(empty())}><Plus className="h-4 w-4" /> Add</Btn>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-semibold">Date</th>
              <th className="px-5 py-3 font-semibold">Description</th>
              <th className="hidden px-5 py-3 font-semibold sm:table-cell">Category</th>
              <th className="px-5 py-3 text-right font-semibold">Amount</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {[...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="px-5 py-3 text-muted-foreground">{t.date}</td>
                <td className="px-5 py-3 font-medium">{t.label}</td>
                <td className="hidden px-5 py-3 sm:table-cell"><span className="rounded-full bg-secondary px-2.5 py-1 text-xs">{t.category || "—"}</span></td>
                <td className={`px-5 py-3 text-right font-bold ${t.type === "income" ? "text-[oklch(.55_.15_150)]" : "text-destructive"}`}>
                  {t.type === "income" ? "+" : "−"}{fmtEuro(t.amount)}
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => remove(t.id)} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Transaction">
        {editing && (
          <div className="space-y-3">
            <Field label="Description"><input className={inputCls} value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select className={inputCls} value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as Transaction["type"] })}>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </Field>
              <Field label="Amount (€)"><input type="number" className={inputCls} value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} /></Field>
              <Field label="Category"><input className={inputCls} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></Field>
              <Field label="Date"><input type="date" className={inputCls} value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn onClick={() => save(editing)}>Save</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
