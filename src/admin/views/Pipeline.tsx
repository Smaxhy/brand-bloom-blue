import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listWebsiteRequests } from "@/lib/website-requests.functions";
import { mergeWebsiteRequests, type WebsiteRequest } from "../pipeline-merge";
import { Plus, GripVertical, Pencil, Trash2, Euro } from "lucide-react";
import {
  type AdminData,
  type Deal,
  type StageId,
  STAGES,
  DEAL_TEMPLATES,
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
  const [requests, setRequests] = useState<WebsiteRequest[]>([]);
  const [requestError, setRequestError] = useState("");
  const [loadingRequests, setLoadingRequests] = useState(false);
  const readRequests = useServerFn(listWebsiteRequests);
  const visibleDeals = mergeWebsiteRequests(data.deals, requests);

  async function refreshRequests() {
    setLoadingRequests(true);
    try {
      const result = await readRequests();
      setRequests(result.requests);
      setRequestError(result.truncated ? "Showing the latest 2,000 website requests. Older requests remain stored." : "");
    } catch (error) { setRequestError(error instanceof Error ? error.message : "Website requests could not be loaded."); }
    finally { setLoadingRequests(false); }
  }
  useEffect(() => {
    void refreshRequests();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refreshRequests(); }, 30000);
    return () => clearInterval(timer);
  }, []);

  function openNew(stage: StageId = "new") {
    const d = empty();
    d.stage = stage;
    setEditing(d);
  }

  function applyTemplate(d: Deal, name: string): Deal {
    const t = DEAL_TEMPLATES[name];
    if (!t) return { ...d, template: "" };
    return { ...d, template: name, value: t.value ?? d.value, source: t.source ?? d.source, notes: t.notes ?? d.notes };
  }

  function save(d: Deal) {
    update((p) => {
      const current = mergeWebsiteRequests(p.deals, requests);
      const exists = current.some((x) => x.id === d.id);
      const deals = exists
        ? current.map((x) => (x.id === d.id ? { ...d, updatedAt: Date.now() } : x))
        : [...current, { ...d, updatedAt: Date.now() }];
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
      deals: mergeWebsiteRequests(p.deals, requests).map((d) => (d.id === dragId ? { ...d, stage, updatedAt: Date.now() } : d)),
    }));
    setDragId(null);
    setOverStage(null);
  }

  const total = visibleDeals.filter((d) => d.stage !== "lost").reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-5">
      {requestError && <p role="alert" className="text-sm text-destructive">{requestError}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Drag cards between stages. Weighted pipeline value:{" "}
          <span className="font-semibold text-foreground">{fmtEuro(total)}</span>
        </p>
        <Btn variant="ghost" disabled={loadingRequests} onClick={() => void refreshRequests()}>{loadingRequests ? "Loading requests…" : "Refresh requests"}</Btn>
        <Btn className="ml-auto" onClick={() => openNew()}>
          <Plus className="h-4 w-4" /> New deal
        </Btn>
      </div>

      <div className="grid grid-flow-col gap-4 overflow-x-auto pb-4 [grid-auto-columns:minmax(260px,1fr)]">
        {STAGES.map((stage) => {
          const deals = visibleDeals.filter((d) => d.stage === stage.id);
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
                        {d.email && <a href={`mailto:${d.email}`} className="mt-1 block break-all text-xs text-primary">{d.email}</a>}
                        {!!d.requests?.length && <div className="mt-2 space-y-1 text-xs text-muted-foreground"><div className="font-semibold text-foreground">Website {d.requests.some((r) => r.kind === "quote") ? "quote" : "contact"} · {d.requests.length} request{d.requests.length === 1 ? "" : "s"}</div><div className="break-words">{d.requests.flatMap((r) => r.services.map((s) => s.name)).filter((name, index, names) => names.indexOf(name) === index).join(", ")}</div></div>}
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
                            <Btn variant="ghost" onClick={() => setEditing(d)} className="h-6 w-6 p-0" aria-label={`Edit ${d.name}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Btn>
                            {!d.requests?.length && <Btn variant="ghost" onClick={() => remove(d.id)} className="h-6 w-6 p-0 text-destructive" aria-label="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Btn>}
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

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing && visibleDeals.some((d) => d.id === editing.id) ? "Edit deal" : "New deal"} wide>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Company"><input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Contact"><input className={inputCls} value={editing.contact} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} /></Field>
              <Field label="Email"><input className={inputCls} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
              <Field label="Phone"><input className={inputCls} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="Value (€)"><input type="number" className={inputCls} value={editing.value} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} /></Field>
              <Field label="Source"><input className={inputCls} value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value })} /></Field>
              <Field label="Stage">
                <select className={inputCls} value={editing.stage} onChange={(e) => setEditing({ ...editing, stage: e.target.value as StageId })}>
                  {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes"><textarea className={`${inputCls} min-h-[72px]`} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            {!!editing.requests?.length && <section className="space-y-4 border-t border-border pt-4"><h3 className="text-sm font-semibold">Original website requests</h3>{[...editing.requests].reverse().map((r) => <div key={r.id} className="space-y-2 border-b border-border pb-4 text-sm"><div className="flex flex-wrap justify-between gap-2 font-semibold"><span>{r.kind === "quote" ? "Quote request" : "Contact message"}</span><time className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</time></div><p className="break-words">{r.name} · {r.company}</p><p className="break-all"><a className="text-primary" href={`mailto:${r.email}`}>{r.email}</a>{r.phone && <> · {r.phone}</>}</p>{r.services.map((s) => <p key={s.id}>{s.name} — {fmtEuro(s.price)} {s.billing === "monthly" ? "/ month" : "one-time"}</p>)}{r.estimates && <p>Estimate only · Monthly {fmtEuro(r.estimates.monthly)} · One-time {fmtEuro(r.estimates.upfront)} · First month {fmtEuro(r.estimates.total)}</p>}{r.personal_message && <div><h4 className="font-semibold">Personal message</h4><p className="whitespace-pre-wrap break-words">{r.personal_message}</p></div>}<details><summary className="cursor-pointer text-muted-foreground">Full original message</summary><p className="mt-2 whitespace-pre-wrap break-words">{r.message}</p></details>{(r.attribution.source || r.attribution.medium || r.attribution.campaign) && <p className="break-words text-xs text-muted-foreground">Source: {r.attribution.source || "Not supplied"} · Medium: {r.attribution.medium || "Not supplied"} · Campaign: {r.attribution.campaign || "Not supplied"}</p>}<p className="text-xs text-muted-foreground">Contact consent: {r.consent ? "Confirmed" : "Not recorded"}</p></div>)}</section>}
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
