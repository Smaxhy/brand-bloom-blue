import { useMemo, useState } from "react";
import { Plus, CheckCircle2, Circle, Trash2, Flag, CalendarClock, TrendingUp, Flame } from "lucide-react";
import { type AdminData, type Task, uid } from "../store";
import { Panel, Modal, Field, inputCls, Btn, StatCard } from "../ui";

const emptyTask = (): Task => ({
  id: uid("tk"),
  title: "",
  notes: "",
  priority: "med",
  createdAt: Date.now(),
});

const PRIORITY_TONE: Record<Task["priority"], { bg: string; fg: string; label: string }> = {
  low: { bg: "oklch(.94 .02 250)", fg: "oklch(.4 .06 250)", label: "Low" },
  med: { bg: "color-mix(in oklab, var(--brand-violet) 14%, transparent)", fg: "var(--brand-violet)", label: "Medium" },
  high: { bg: "color-mix(in oklab, var(--destructive) 14%, transparent)", fg: "var(--destructive)", label: "High" },
};

function fmtDue(due?: number): string {
  if (!due) return "No due date";
  const d = new Date(due);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff}d overdue`;
  if (diff < 7) return `in ${diff}d`;
  return d.toLocaleDateString();
}

export function Tasks({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const tasks = data.tasks ?? [];
  const [editing, setEditing] = useState<Task | null>(null);
  const [filter, setFilter] = useState<"open" | "today" | "overdue" | "done" | "all">("open");

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endOfToday = today.getTime() + 86400000;

  const analytics = useMemo(() => {
    const now = Date.now();
    const day = 86400000;
    const done7 = tasks.filter((t) => t.completedAt && now - t.completedAt < 7 * day).length;
    const created7 = tasks.filter((t) => now - t.createdAt < 7 * day).length;
    const completionRate = tasks.length === 0 ? 0 : Math.round(100 * tasks.filter((t) => t.completedAt).length / tasks.length);
    const overdue = tasks.filter((t) => !t.completedAt && t.due && t.due < now).length;
    const dueToday = tasks.filter((t) => !t.completedAt && t.due && t.due >= today.getTime() && t.due < endOfToday).length;
    // Streak: consecutive days ending today with at least one completion
    const days = new Set<string>();
    for (const t of tasks) {
      if (!t.completedAt) continue;
      days.add(new Date(t.completedAt).toISOString().slice(0, 10));
    }
    let streak = 0;
    for (let i = 0; ; i++) {
      const d = new Date(now - i * day);
      const iso = d.toISOString().slice(0, 10);
      if (days.has(iso)) streak++;
      else break;
      if (streak > 365) break;
    }
    return { done7, created7, completionRate, overdue, dueToday, streak };
  }, [tasks, today.getTime(), endOfToday]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return tasks
      .filter((t) => {
        if (filter === "all") return true;
        if (filter === "done") return !!t.completedAt;
        if (filter === "open") return !t.completedAt;
        if (filter === "today") return !t.completedAt && t.due && t.due >= today.getTime() && t.due < endOfToday;
        if (filter === "overdue") return !t.completedAt && t.due && t.due < now;
        return true;
      })
      .sort((a, b) => {
        if (!!a.completedAt !== !!b.completedAt) return a.completedAt ? 1 : -1;
        const ad = a.due ?? Infinity, bd = b.due ?? Infinity;
        if (ad !== bd) return ad - bd;
        const pr = { high: 0, med: 1, low: 2 } as const;
        return pr[a.priority] - pr[b.priority];
      });
  }, [tasks, filter, today.getTime(), endOfToday]);

  function save(t: Task) {
    update((p) => {
      const list = p.tasks ?? [];
      const exists = list.some((x) => x.id === t.id);
      return { ...p, tasks: exists ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t] };
    });
    setEditing(null);
  }
  function toggle(id: string) {
    update((p) => ({
      ...p,
      tasks: (p.tasks ?? []).map((t) => (t.id === id ? { ...t, completedAt: t.completedAt ? undefined : Date.now() } : t)),
    }));
  }
  function remove(id: string) {
    update((p) => ({ ...p, tasks: (p.tasks ?? []).filter((t) => t.id !== id) }));
  }

  const clientById = new Map(data.clients.map((c) => [c.id, c.company]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Completed (7d)" value={String(analytics.done7)} hint={`${analytics.created7} added in last 7d`} icon={TrendingUp} accent="oklch(.7 .18 150)" />
        <StatCard label="Completion rate" value={`${analytics.completionRate}%`} hint="All-time" icon={CheckCircle2} accent="var(--brand-violet)" />
        <StatCard label="Due today" value={String(analytics.dueToday)} hint={`${analytics.overdue} overdue`} icon={CalendarClock} accent="var(--brand-coral)" />
        <StatCard label="Daily streak" value={`${analytics.streak}d`} hint="Consecutive days with a done task" icon={Flame} accent="oklch(.66 .19 30)" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["open", "today", "overdue", "done", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
        <Btn className="ml-auto" onClick={() => setEditing(emptyTask())}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add task
        </Btn>
      </div>

      <Panel>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No tasks in this view.</p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {filtered.map((t) => {
              const overdue = !t.completedAt && t.due && t.due < Date.now();
              const p = PRIORITY_TONE[t.priority];
              return (
                <li key={t.id} className="flex items-start gap-3 py-3">
                  <button
                    onClick={() => toggle(t.id)}
                    aria-label={t.completedAt ? "Mark task as not done" : "Mark task as done"}
                    aria-pressed={!!t.completedAt}
                    className="mt-0.5 grid h-7 w-7 place-items-center rounded-full text-primary hover:bg-primary/10"
                  >
                    {t.completedAt ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <Circle className="h-5 w-5" aria-hidden="true" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${t.completedAt ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {t.title || "(no title)"}
                    </div>
                    {t.notes && <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{t.notes}</div>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[.68rem]">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold" style={{ background: p.bg, color: p.fg }}>
                        <Flag className="h-3 w-3" aria-hidden="true" /> {p.label}
                      </span>
                      {t.due && (
                        <span className={`inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                          <CalendarClock className="h-3 w-3" aria-hidden="true" /> {fmtDue(t.due)}
                        </span>
                      )}
                      {t.clientId && clientById.has(t.clientId) && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">{clientById.get(t.clientId)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(t)}
                      aria-label={`Edit task ${t.title}`}
                      className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(t.id)}
                      aria-label={`Delete task ${t.title}`}
                      className="grid h-7 w-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing && (data.tasks ?? []).some((t) => t.id === editing.id) ? "Edit task" : "Add task"}>
        {editing && (
          <div className="space-y-3">
            <Field label="Title">
              <input className={inputCls} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} autoFocus />
            </Field>
            <Field label="Notes">
              <textarea className={`${inputCls} min-h-[80px]`} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Due">
                <input
                  type="date"
                  className={inputCls}
                  value={editing.due ? new Date(editing.due).toISOString().slice(0, 10) : ""}
                  onChange={(e) => setEditing({ ...editing, due: e.target.value ? new Date(e.target.value).getTime() : undefined })}
                />
              </Field>
              <Field label="Priority">
                <select className={inputCls} value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value as Task["priority"] })}>
                  <option value="low">Low</option>
                  <option value="med">Medium</option>
                  <option value="high">High</option>
                </select>
              </Field>
            </div>
            <Field label="Client (optional)">
              <select className={inputCls} value={editing.clientId ?? ""} onChange={(e) => setEditing({ ...editing, clientId: e.target.value || undefined })}>
                <option value="">— None —</option>
                {data.clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
              </select>
            </Field>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn onClick={() => save(editing)}>Save task</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
