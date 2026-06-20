import { useState } from "react";
import { Plus, Pencil, Trash2, Mail, Phone, MapPin } from "lucide-react";
import { type AdminData, type Client, SERVICES, totalsForServices, uid, fmtEuro } from "../store";
import { Panel, Modal, Field, inputCls, Btn } from "../ui";

const empty = (): Client => ({
  id: uid("c"),
  company: "",
  contact: "",
  email: "",
  phone: "",
  address: "",
  plan: "",
  services: [],
  monthly: 0,
  setupFee: 0,
  status: "active",
  notes: "",
  since: Date.now(),
});

function toggleClientService(c: Client, id: string): Client {
  const services = c.services.includes(id) ? c.services.filter((s) => s !== id) : [...c.services, id];
  const t = totalsForServices(services);
  return { ...c, services, monthly: t.monthly, setupFee: t.setup };
}

export function Clients({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const [editing, setEditing] = useState<Client | null>(null);

  function save(c: Client) {
    update((p) => {
      const exists = p.clients.some((x) => x.id === c.id);
      return {
        ...p,
        clients: exists ? p.clients.map((x) => (x.id === c.id ? c : x)) : [...p.clients, c],
      };
    });
    setEditing(null);
  }
  function remove(id: string) {
    update((p) => ({ ...p, clients: p.clients.filter((c) => c.id !== id) }));
  }

  const mrr = data.clients.filter((c) => c.status === "active").reduce((s, c) => s + c.monthly, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {data.clients.length} client{data.clients.length === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-foreground">{fmtEuro(mrr)}/mo</span> recurring
        </p>
        <Btn className="ml-auto" onClick={() => setEditing(empty())}>
          <Plus className="h-4 w-4" /> Add client
        </Btn>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.clients.map((c) => (
          <Panel key={c.id} className="flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] font-display text-lg font-bold text-white">
                  {c.company.slice(0, 1) || "?"}
                </div>
                <div>
                  <div className="font-semibold leading-tight">{c.company}</div>
                  <div className="text-xs text-muted-foreground">{c.contact}</div>
                </div>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-[.65rem] font-semibold capitalize"
                style={{
                  background: c.status === "active" ? "color-mix(in oklab, var(--brand-violet) 16%, transparent)" : c.status === "paused" ? "var(--secondary)" : "color-mix(in oklab, var(--destructive) 12%, transparent)",
                  color: c.status === "active" ? "var(--brand-violet)" : c.status === "churned" ? "var(--destructive)" : "var(--muted-foreground)",
                }}
              >
                {c.status}
              </span>
            </div>

            <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              {c.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {c.email}</div>}
              {c.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {c.phone}</div>}
              {c.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {c.address}</div>}
            </div>

            {c.notes && <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">{c.notes}</p>}

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <div>
                <div className="text-xs text-muted-foreground">{c.plan || "—"}</div>
                <div className="font-display text-lg font-bold text-primary">{fmtEuro(c.monthly)}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(c)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(c.id)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </Panel>
        ))}
        {data.clients.length === 0 && (
          <Panel className="md:col-span-2 xl:col-span-3 text-center text-sm text-muted-foreground">No clients yet. Add your first one.</Panel>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing && data.clients.some((c) => c.id === editing.id) ? "Edit client" : "Add client"} wide>
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company"><input className={inputCls} value={editing.company} onChange={(e) => setEditing({ ...editing, company: e.target.value })} /></Field>
              <Field label="Contact"><input className={inputCls} value={editing.contact} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} /></Field>
              <Field label="Email"><input className={inputCls} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
              <Field label="Phone"><input className={inputCls} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="Plan"><input className={inputCls} value={editing.plan} onChange={(e) => setEditing({ ...editing, plan: e.target.value })} /></Field>
              <Field label="Monthly (€)"><input type="number" className={inputCls} value={editing.monthly} onChange={(e) => setEditing({ ...editing, monthly: Number(e.target.value) })} /></Field>
              <Field label="Status">
                <select className={inputCls} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Client["status"] })}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="churned">Churned</option>
                </select>
              </Field>
            </div>
            <Field label="Address"><input className={inputCls} value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
            <Field label="Notes"><textarea className={`${inputCls} min-h-[72px]`} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn onClick={() => save(editing)}>Save client</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
