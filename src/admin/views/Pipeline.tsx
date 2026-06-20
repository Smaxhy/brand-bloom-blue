import { useState } from "react";
import { Plus, GripVertical, Pencil, Trash2, Euro } from "lucide-react";
import {
  type AdminData,
  type Deal,
  type StageId,
  STAGES,
  DEAL_TEMPLATES,
  SERVICES,
  getService,
  totalsForServices,
  fmtEuro,
  uid,
} from "../store";
import { Modal, Field, inputCls, Btn } from "../ui";

const empty = (): Deal => ({
  id: uid("d"),
  name: "",
  contact: "",
  email: "",
  phone: "",
  value: 0,
  stage: "new",
  source: "",
  services: [],
  template: "",
  notes: "",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export function Pipeline({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const [editing, setEditing] = useState<Deal | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<StageId | null>(null);

  function openNew(stage: StageId = "new") {
    const d = empty();
    d.stage = stage;
    setEditing(d);
  }

  function applyTemplate(d: Deal, name: string): Deal {
    const t = DEAL_TEMPLATES[name];
    if (!t) return { ...d, template: "" };
    const totals = totalsForServices(t.services);
    return { ...d, template: name, services: t.services, value: totals.total, source: t.source ?? d.source, notes: t.notes ?? d.notes };
  }

  function toggleService(d: Deal, id: string): Deal {
    const services = d.services.includes(id) ? d.services.filter((s) => s !== id) : [...d.services, id];
    return { ...d, services, value: totalsForServices(services).total };
  }


  function save(d: Deal) {
    update((p) => {
      const exists = p.deals.some((x) => x.id === d.id);
      const deals = exists
        ? p.deals.map((x) => (x.id === d.id ? { ...d, updatedAt: Date.now() } : x))
        : [...p.deals, { ...d, updatedAt: Date.now() }];
      return { ...p, deals };
    });
    setEditing(null);
  }

  function remove(id: string) {
    update((p) => ({ ...p, deals: p.deals.filter((d) => d.id !== id) }));
  }

  function drop(stage: StageId) {
    if (!dragId) return;
    update((p) => ({
      ...p,
      deals: p.deals.map((d) => (d.id === dragId ? { ...d, stage, updatedAt: Date.now() } : d)),
    }));
    setDragId(null);
    setOverStage(null);
  }

  const total = data.deals.filter((d) => d.stage !== "lost").reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Drag cards between stages. Weighted pipeline value:{" "}
          <span className="font-semibold text-foreground">{fmtEuro(total)}</span>
        </p>
        <Btn className="ml-auto" onClick={() => openNew()}>
          <Plus className="h-4 w-4" /> New deal
        </Btn>
      </div>

      <div className="grid grid-flow-col gap-4 overflow-x-auto pb-4 [grid-auto-columns:minmax(260px,1fr)]">
        {STAGES.map((stage) => {
          const deals = data.deals.filter((d) => d.stage === stage.id);
          const val = deals.reduce((s, d) => s + d.value, 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDrop={() => drop(stage.id)}
              className={`flex min-h-[200px] flex-col rounded-2xl border bg-card p-3 transition-colors ${
                overStage === stage.id ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.tone }} />
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{deals.length}</span>
              </div>
              <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">{fmtEuro(val)}</div>

              <div className="flex-1 space-y-2.5">
                {deals.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={() => setDragId(d.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    className={`group cursor-grab rounded-xl border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${
                      dragId === d.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{d.name || "Untitled"}</div>
                        <div className="truncate text-xs text-muted-foreground">{d.contact}</div>
                        {d.template && (
                          <span className="mt-1.5 inline-block rounded-full bg-secondary px-2 py-0.5 text-[.65rem] font-medium">
                            {d.template}
                          </span>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="flex items-center text-sm font-bold text-primary">
                            <Euro className="h-3.5 w-3.5" />
                            {d.value.toLocaleString("nl-BE")}
                          </span>
                          <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button onClick={() => setEditing(d)} className="grid h-6 w-6 place-items-center rounded-md hover:bg-secondary" aria-label="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => remove(d.id)} className="grid h-6 w-6 place-items-center rounded-md text-destructive hover:bg-destructive/10" aria-label="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => openNew(stage.id)}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          );
        })}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing && data.deals.some((d) => d.id === editing.id) ? "Edit deal" : "New deal"} wide>
        {editing && (
          <div className="space-y-3">
            <Field label="Start from a template">
              <select
                value={editing.template || ""}
                onChange={(e) => setEditing(applyTemplate(editing, e.target.value))}
                className={inputCls}
              >
                <option value="">— Blank deal —</option>
                {Object.keys(DEAL_TEMPLATES).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            <Field label="Services">
              <div className="grid gap-2 sm:grid-cols-2">
                {SERVICES.map((s) => {
                  const checked = editing.services.includes(s.id);
                  return (
                    <label key={s.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors ${checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                      <input type="checkbox" className="mt-0.5" checked={checked} onChange={() => setEditing(toggleService(editing, s.id))} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{s.name}</span>
                          <span className="font-display text-sm font-bold text-primary">{fmtEuro(s.price)}<span className="text-[.65rem] font-normal text-muted-foreground">{s.billing === "monthly" ? "/mo" : " setup"}</span></span>
                        </div>
                        <div className="text-xs text-muted-foreground">{s.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {editing.services.length > 0 && (() => {
                const t = totalsForServices(editing.services);
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-secondary px-3 py-2 text-xs">
                    <span><span className="text-muted-foreground">Monthly:</span> <strong>{fmtEuro(t.monthly)}/mo</strong></span>
                    <span><span className="text-muted-foreground">Setup:</span> <strong>{fmtEuro(t.setup)}</strong></span>
                    <span className="ml-auto"><span className="text-muted-foreground">First-month total:</span> <strong className="text-primary">{fmtEuro(t.total)}</strong></span>
                  </div>
                );
              })()}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Company"><input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Contact"><input className={inputCls} value={editing.contact} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} /></Field>
              <Field label="Email"><input className={inputCls} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
              <Field label="Phone"><input className={inputCls} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="Deal value (€)"><input type="number" className={inputCls} value={editing.value} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} /></Field>
              <Field label="Source"><input className={inputCls} value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value })} /></Field>
              <Field label="Stage">
                <select className={inputCls} value={editing.stage} onChange={(e) => setEditing({ ...editing, stage: e.target.value as StageId })}>
                  {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes"><textarea className={`${inputCls} min-h-[72px]`} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>

            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn onClick={() => save(editing)}>Save deal</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
