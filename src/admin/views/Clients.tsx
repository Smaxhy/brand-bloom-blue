import { useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Mail, Phone, MapPin, Camera, Image as ImageIcon, X, Loader2, TrendingUp } from "lucide-react";
import { type AdminData, type Client, type AdScan, type AdPlatform, uid, fmtEuro, claudeScanAdScreenshot } from "../store";
import { Panel, Modal, Field, inputCls, Btn } from "../ui";

const empty = (): Client => ({
  id: uid("c"),
  company: "",
  contact: "",
  email: "",
  phone: "",
  address: "",
  plan: "",
  monthly: 0,
  status: "active",
  notes: "",
  since: Date.now(),
});

const PLATFORM_LABEL: Record<AdPlatform, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  other: "Other",
};

function fmtNum(n?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function Clients({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const [editing, setEditing] = useState<Client | null>(null);
  const [scanFor, setScanFor] = useState<Client | null>(null);

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
    if (!confirm("Delete this client? This cannot be undone.")) return;
    update((p) => ({ ...p, clients: p.clients.filter((c) => c.id !== id) }));
  }

  const mrr = data.clients.filter((c) => c.status === "active").reduce((s, c) => s + c.monthly, 0);
  const scansByClient = useMemo(() => {
    const map = new Map<string, AdScan[]>();
    for (const s of data.adScans ?? []) {
      if (!s.clientId) continue;
      const list = map.get(s.clientId) ?? [];
      list.push(s);
      map.set(s.clientId, list);
    }
    return map;
  }, [data.adScans]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {data.clients.length} client{data.clients.length === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-foreground">{fmtEuro(mrr)}/mo</span> recurring
        </p>
        <Btn className="ml-auto" onClick={() => setEditing(empty())}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add client
        </Btn>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.clients.map((c) => {
          const scans = scansByClient.get(c.id) ?? [];
          const lastScan = scans.sort((a, b) => b.capturedAt - a.capturedAt)[0];
          return (
            <Panel key={c.id} className="flex flex-col">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] font-display text-lg font-bold text-white" aria-hidden="true">
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
                    background: c.status === "active" ? "color-mix(in oklab, oklch(.7 .18 150) 16%, transparent)" : c.status === "paused" ? "var(--secondary)" : "color-mix(in oklab, var(--destructive) 12%, transparent)",
                    color: c.status === "active" ? "oklch(.45 .15 150)" : c.status === "churned" ? "var(--destructive)" : "var(--muted-foreground)",
                  }}
                >
                  {c.status}
                </span>
              </div>

              <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                {c.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" aria-hidden="true" /> {c.email}</div>}
                {c.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" aria-hidden="true" /> {c.phone}</div>}
                {c.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {c.address}</div>}
              </div>

              {c.notes && <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">{c.notes}</p>}

              {lastScan && (
                <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Latest ad scan · {PLATFORM_LABEL[lastScan.platform]}
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-muted-foreground">
                    <div><span className="text-foreground font-semibold">{fmtNum(lastScan.metrics.spend)}</span><br/>Spend</div>
                    <div><span className="text-foreground font-semibold">{lastScan.metrics.ctr !== undefined ? `${lastScan.metrics.ctr}%` : "—"}</span><br/>CTR</div>
                    <div><span className="text-foreground font-semibold">{lastScan.metrics.roas !== undefined ? `${lastScan.metrics.roas}x` : "—"}</span><br/>ROAS</div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <div>
                  <div className="text-xs text-muted-foreground">{c.plan || "—"}</div>
                  <div className="font-display text-lg font-bold text-primary">{fmtEuro(c.monthly)}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setScanFor(c)}
                    aria-label={`Scan an ad screenshot for ${c.company}`}
                    className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"
                    title="Scan ad screenshot"
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setEditing(c)}
                    aria-label={`Edit ${c.company}`}
                    className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    aria-label={`Delete ${c.company}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </Panel>
          );
        })}
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

      <AdScanModal
        client={scanFor}
        allScans={data.adScans ?? []}
        onClose={() => setScanFor(null)}
        onSave={(scan) => update((p) => ({ ...p, adScans: [...(p.adScans ?? []), scan] }))}
        onDelete={(id) => update((p) => ({ ...p, adScans: (p.adScans ?? []).filter((s) => s.id !== id) }))}
      />
    </div>
  );
}

/* -------------------- ad screenshot scanner modal -------------------- */

function AdScanModal({
  client,
  allScans,
  onClose,
  onSave,
  onDelete,
}: {
  client: Client | null;
  allScans: AdScan[];
  onClose: () => void;
  onSave: (s: AdScan) => void;
  onDelete: (id: string) => void;
}) {
  const [platform, setPlatform] = useState<AdPlatform>("meta");
  const [label, setLabel] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!client) return null;
  const clientScans = allScans.filter((s) => s.clientId === client.id).sort((a, b) => b.capturedAt - a.capturedAt);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("That doesn't look like an image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image is over 5MB. Please compress it and try again.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      setPreview(dataUrl);
      const res = await claudeScanAdScreenshot({
        imageBase64: dataUrl,
        mediaType: file.type,
        platform,
        hint,
      });
      if (!res.ok || !res.metrics) {
        setError(res.error || "Claude couldn't read metrics from that screenshot.");
        return;
      }
      const scan: AdScan = {
        id: uid("ad"),
        clientId: client!.id,
        platform,
        capturedAt: Date.now(),
        label: label.trim() || file.name,
        metrics: res.metrics,
        raw: res.raw,
      };
      onSave(scan);
      setLabel("");
      setHint("");
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!client} onClose={onClose} title={`Ad screenshot scanner — ${client.company}`} wide>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload a screenshot of your ad dashboard and Claude will read the numbers for you. Works with Meta / Google / TikTok Ads Manager or any generic dashboard.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value as AdPlatform)}>
              <option value="meta">Meta Ads (Facebook / Instagram)</option>
              <option value="google">Google Ads</option>
              <option value="tiktok">TikTok Ads</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Label (optional)">
            <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Spring campaign — week 3" />
          </Field>
        </div>
        <Field label="Extra context / hint (optional)">
          <input className={inputCls} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. Aggregate totals across the last 30 days" />
        </Field>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/50 px-6 py-8 text-center text-sm text-muted-foreground hover:bg-secondary/40">
          <ImageIcon className="h-6 w-6" aria-hidden="true" />
          <span className="font-semibold text-foreground">{busy ? "Scanning with Claude…" : "Choose screenshot"}</span>
          <span className="text-xs">PNG / JPG / WebP · max 5MB</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Extracting metrics…
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</div>
        )}
        {preview && !busy && !error && (
          <img src={preview} alt="Screenshot preview" className="max-h-48 rounded-lg border border-border object-contain" />
        )}

        {clientScans.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-foreground">Previous scans</h4>
            <ul className="divide-y divide-border rounded-xl border border-border" role="list">
              {clientScans.map((s) => (
                <li key={s.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{s.label || PLATFORM_LABEL[s.platform]}</div>
                    <div className="text-xs text-muted-foreground">
                      {PLATFORM_LABEL[s.platform]} · {new Date(s.capturedAt).toLocaleDateString()}
                      {s.metrics.campaign ? ` · ${s.metrics.campaign}` : ""}
                      {s.metrics.dateRange ? ` · ${s.metrics.dateRange}` : ""}
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-[.7rem]">
                      <Metric l="Spend" v={fmtNum(s.metrics.spend)} />
                      <Metric l="Impressions" v={fmtNum(s.metrics.impressions)} />
                      <Metric l="Clicks" v={fmtNum(s.metrics.clicks)} />
                      <Metric l="CTR" v={s.metrics.ctr !== undefined ? `${s.metrics.ctr}%` : "—"} />
                      <Metric l="CPC" v={fmtNum(s.metrics.cpc)} />
                      <Metric l="Conv." v={fmtNum(s.metrics.conversions)} />
                      <Metric l="CPA" v={fmtNum(s.metrics.cpa)} />
                      <Metric l="ROAS" v={s.metrics.roas !== undefined ? `${s.metrics.roas}x` : "—"} />
                    </div>
                    {s.metrics.notes && <p className="mt-2 text-xs italic text-muted-foreground">{s.metrics.notes}</p>}
                  </div>
                  <button
                    onClick={() => onDelete(s.id)}
                    aria-label={`Delete scan ${s.label || s.id}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Metric({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-md bg-secondary px-2 py-1.5">
      <div className="font-semibold text-foreground">{v}</div>
      <div className="text-[.6rem] uppercase tracking-wide text-muted-foreground">{l}</div>
    </div>
  );
}
