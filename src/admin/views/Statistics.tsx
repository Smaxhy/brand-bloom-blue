import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Image as ImageIcon, Loader2, Plus, Save, Trash2, TrendingUp, TrendingDown, Camera, SlidersHorizontal, Pencil, Check, X } from "lucide-react";
import { type AdminData, type AdScan, type AdPlatform, uid, claudeScanAdScreenshot } from "../store";
import { Panel, Modal, Field, inputCls, Btn } from "../ui";


/* ============================================================
   Statistics view — Shopify-style analytics tab
   - Client selector + optional platform
   - Grid of stat cards fed by manual entry and/or Claude ad-scan
   - Snapshot history with delta vs previous
   ============================================================ */

type MetricKey =
  | "sales"
  | "revenue"
  | "spend"
  | "roas"
  | "orders"
  | "aov"
  | "conversionRate"
  | "sessions"
  | "visitors"
  | "returningRate"
  | "impressions"
  | "reach"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "conversions"
  | "cpa"
  | "leads"
  | "bookings"
  | "showRate"
  | "avgTicket";

type MetricKind = "currency" | "number" | "percent" | "multiplier";

interface MetricDef {
  key: MetricKey;
  label: string;
  hint?: string;
  kind: MetricKind;
  goodDirection: "up" | "down";
}

const METRICS: MetricDef[] = [
  { key: "sales", label: "Total sales", hint: "Gross sales in the period", kind: "currency", goodDirection: "up" },
  { key: "revenue", label: "Revenue attributed", kind: "currency", goodDirection: "up" },
  { key: "spend", label: "Amount spent", hint: "Ad spend", kind: "currency", goodDirection: "down" },
  { key: "roas", label: "ROAS", kind: "multiplier", goodDirection: "up" },
  { key: "orders", label: "Total orders", kind: "number", goodDirection: "up" },
  { key: "aov", label: "Avg order value", kind: "currency", goodDirection: "up" },
  { key: "conversionRate", label: "Conversion rate", kind: "percent", goodDirection: "up" },
  { key: "sessions", label: "Sessions", kind: "number", goodDirection: "up" },
  { key: "visitors", label: "Visitors", kind: "number", goodDirection: "up" },
  { key: "returningRate", label: "Returning customer rate", kind: "percent", goodDirection: "up" },
  { key: "impressions", label: "Impressions", kind: "number", goodDirection: "up" },
  { key: "reach", label: "Reach", kind: "number", goodDirection: "up" },
  { key: "clicks", label: "Clicks", kind: "number", goodDirection: "up" },
  { key: "ctr", label: "CTR", kind: "percent", goodDirection: "up" },
  { key: "cpc", label: "CPC", kind: "currency", goodDirection: "down" },
  { key: "cpm", label: "CPM", kind: "currency", goodDirection: "down" },
  { key: "conversions", label: "Conversions", kind: "number", goodDirection: "up" },
  { key: "cpa", label: "CPA", kind: "currency", goodDirection: "down" },
  { key: "leads", label: "Leads", kind: "number", goodDirection: "up" },
  { key: "bookings", label: "Bookings", kind: "number", goodDirection: "up" },
  { key: "showRate", label: "Show-up rate", kind: "percent", goodDirection: "up" },
  { key: "avgTicket", label: "Avg ticket / deal", kind: "currency", goodDirection: "up" },
];

const PLATFORM_LABEL: Record<AdPlatform, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  other: "Other / Generic",
};

function fmt(value: number | undefined, kind: MetricKind, currency = "€"): string {
  if (value === undefined || value === null || Number.isNaN(value) || value === 0) return "—";
  if (kind === "currency") return `${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (kind === "percent") return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  if (kind === "multiplier") return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const VISIBLE_STORAGE_KEY = "insp.stats.visibleMetrics.v1";

function loadVisible(): Set<MetricKey> {
  if (typeof window === "undefined") return new Set(METRICS.map((m) => m.key));
  try {
    const raw = window.localStorage.getItem(VISIBLE_STORAGE_KEY);
    if (!raw) return new Set(METRICS.map((m) => m.key));
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.filter((k): k is MetricKey => METRICS.some((m) => m.key === k)));
  } catch {
    return new Set(METRICS.map((m) => m.key));
  }
}

export function Statistics({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const [clientId, setClientId] = useState<string>("all");
  const [platform, setPlatform] = useState<AdPlatform | "all">("all");
  const [entryOpen, setEntryOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visible, setVisible] = useState<Set<MetricKey>>(() => loadVisible());

  useEffect(() => {
    try {
      window.localStorage.setItem(VISIBLE_STORAGE_KEY, JSON.stringify([...visible]));
    } catch { /* ignore */ }
  }, [visible]);

  const scans = useMemo(() => {
    const list = data.adScans ?? [];
    return list
      .filter((s) => (clientId === "all" ? true : s.clientId === clientId))
      .filter((s) => (platform === "all" ? true : s.platform === platform))
      .sort((a, b) => b.capturedAt - a.capturedAt);
  }, [data.adScans, clientId, platform]);

  // Oldest -> newest for the sparkline
  const series = useMemo(() => [...scans].reverse(), [scans]);
  const latest = scans[0];
  const previous = scans[1];

  function saveScan(scan: AdScan) {
    update((p) => ({ ...p, adScans: [...(p.adScans ?? []), scan] }));
  }
  function deleteScan(id: string) {
    if (!confirm("Delete this snapshot?")) return;
    update((p) => ({ ...p, adScans: (p.adScans ?? []).filter((s) => s.id !== id) }));
  }

  function updateLatestMetric(key: MetricKey, value: number | undefined) {
    if (!latest) return;
    update((p) => ({
      ...p,
      adScans: (p.adScans ?? []).map((s) =>
        s.id === latest.id ? { ...s, metrics: { ...s.metrics, [key]: value } } : s,
      ),
    }));
  }

  const currency = latest?.metrics.currency || "€";
  const activeClient = data.clients.find((c) => c.id === clientId);
  const visibleList = METRICS.filter((m) => visible.has(m.key));

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="font-display text-lg font-bold leading-tight">Analytics snapshots</div>
              <div className="text-xs text-muted-foreground">
                {scans.length} snapshot{scans.length === 1 ? "" : "s"}
                {activeClient ? ` · ${activeClient.company}` : " · all clients"}
                {" · "}{visibleList.length}/{METRICS.length} metrics shown
              </div>
            </div>
          </div>

          <Field label="Client">
            <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="all">All clients</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company}</option>
              ))}
            </select>
          </Field>
          <Field label="Platform">
            <select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value as AdPlatform | "all")}>
              <option value="all">All platforms</option>
              <option value="meta">Meta Ads</option>
              <option value="google">Google Ads</option>
              <option value="tiktok">TikTok Ads</option>
              <option value="other">Other / Generic</option>
            </select>
          </Field>

          <div className="ml-auto flex flex-wrap gap-2">
            <Btn variant="ghost" onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Customize
            </Btn>
            <Btn variant="ghost" onClick={() => setScanOpen(true)}>
              <Camera className="h-4 w-4" aria-hidden="true" /> Scan screenshot
            </Btn>
            <Btn onClick={() => setEntryOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New snapshot
            </Btn>
          </div>
        </div>
      </Panel>

      {/* Stat grid */}
      {visibleList.length === 0 ? (
        <Panel className="text-center text-sm text-muted-foreground">
          No metrics visible. Click <span className="font-semibold text-foreground">Customize</span> to pick which cards to show.
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleList.map((m) => {
            const value = latest?.metrics[m.key] as number | undefined;
            const prev = previous?.metrics[m.key] as number | undefined;
            const delta = value !== undefined && value !== 0 && prev !== undefined && prev !== 0
              ? ((value - prev) / prev) * 100
              : undefined;
            const good =
              delta === undefined
                ? null
                : m.goodDirection === "up"
                  ? delta >= 0
                  : delta <= 0;
            const points = series
              .map((s) => s.metrics[m.key] as number | undefined)
              .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
            return (
              <MetricCard
                key={m.key}
                metric={m}
                value={value}
                delta={delta}
                good={good}
                currency={currency}
                points={points}
                canEdit={!!latest}
                onSave={(v) => updateLatestMetric(m.key, v)}
              />
            );
          })}
        </div>
      )}


      {/* Snapshot history */}
      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">Snapshot history</h3>
          <span className="text-xs text-muted-foreground">Most recent first</span>
        </div>
        {scans.length === 0 ? (
          <p className="rounded-lg bg-secondary p-4 text-sm text-muted-foreground">
            No snapshots yet. Upload an ad or analytics screenshot, or add one manually.
          </p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {scans.map((s) => {
              const client = data.clients.find((c) => c.id === s.clientId);
              return (
                <li key={s.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {s.label || PLATFORM_LABEL[s.platform]}
                      {client ? <span className="ml-2 text-xs font-normal text-muted-foreground">· {client.company}</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {PLATFORM_LABEL[s.platform]} · {new Date(s.capturedAt).toLocaleString()}
                      {s.metrics.dateRange ? ` · ${s.metrics.dateRange}` : ""}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[.7rem] sm:grid-cols-4">
                      {METRICS.filter((m) => {
                        const v = s.metrics[m.key] as number | undefined;
                        return v !== undefined && v !== null && v !== 0;
                      }).slice(0, 8).map((m) => (
                        <MiniMetric
                          key={m.key}
                          label={m.label}
                          value={fmt(s.metrics[m.key] as number | undefined, m.kind, s.metrics.currency || "€")}
                        />
                      ))}
                    </div>
                    {s.metrics.notes && <p className="mt-2 text-xs italic text-muted-foreground">{s.metrics.notes}</p>}
                  </div>
                  <button
                    onClick={() => deleteScan(s.id)}
                    aria-label="Delete snapshot"
                    className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <ManualEntryModal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        clients={data.clients}
        defaultClientId={clientId === "all" ? "" : clientId}
        defaultPlatform={platform === "all" ? "other" : platform}
        onSave={(s) => { saveScan(s); setEntryOpen(false); }}
      />

      <ScanUploadModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        clients={data.clients}
        defaultClientId={clientId === "all" ? "" : clientId}
        defaultPlatform={platform === "all" ? "other" : platform}
        onSave={(s) => { saveScan(s); setScanOpen(false); }}
      />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary px-2 py-1.5">
      <div className="font-semibold text-foreground">{value}</div>
      <div className="text-[.6rem] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

/* ------------------------------- modals ------------------------------- */

function ManualEntryModal({
  open, onClose, clients, defaultClientId, defaultPlatform, onSave,
}: {
  open: boolean;
  onClose: () => void;
  clients: AdminData["clients"];
  defaultClientId: string;
  defaultPlatform: AdPlatform;
  onSave: (s: AdScan) => void;
}) {
  const [clientId, setClientId] = useState(defaultClientId);
  const [platform, setPlatform] = useState<AdPlatform>(defaultPlatform);
  const [label, setLabel] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [currency, setCurrency] = useState("€");
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  function setVal(k: string, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function submit() {
    const metrics: AdScan["metrics"] = { currency, dateRange, notes };
    for (const m of METRICS) {
      const raw = values[m.key];
      if (raw === undefined || raw === "") continue;
      const num = Number(raw);
      if (!Number.isNaN(num)) (metrics as Record<string, unknown>)[m.key] = num;
    }
    const scan: AdScan = {
      id: uid("ad"),
      clientId: clientId || undefined,
      platform,
      capturedAt: Date.now(),
      label: label.trim() || undefined,
      metrics,
    };
    onSave(scan);
    setValues({});
    setLabel("");
    setDateRange("");
    setNotes("");
  }

  return (
    <Modal open={open} onClose={onClose} title="New analytics snapshot" wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— None —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </select>
          </Field>
          <Field label="Platform / source">
            <select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value as AdPlatform)}>
              <option value="meta">Meta Ads</option>
              <option value="google">Google Ads</option>
              <option value="tiktok">TikTok Ads</option>
              <option value="other">Other / Generic</option>
            </select>
          </Field>
          <Field label="Label"><input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. November totals" /></Field>
          <Field label="Date range"><input className={inputCls} value={dateRange} onChange={(e) => setDateRange(e.target.value)} placeholder="Nov 1 - Nov 30" /></Field>
          <Field label="Currency"><input className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)} /></Field>
        </div>

        <div className="rounded-xl border border-border p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metrics</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METRICS.map((m) => (
              <label key={m.key} className="block">
                <span className="mb-1 block text-[.7rem] font-medium text-muted-foreground">{m.label}</span>
                <input
                  type="number"
                  step="any"
                  className={inputCls}
                  value={values[m.key] ?? ""}
                  onChange={(e) => setVal(m.key, e.target.value)}
                  placeholder="0"
                />
              </label>
            ))}
          </div>
        </div>

        <Field label="Notes"><textarea className={`${inputCls} min-h-[60px]`} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit}><Save className="h-4 w-4" aria-hidden="true" /> Save snapshot</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ScanUploadModal({
  open, onClose, clients, defaultClientId, defaultPlatform, onSave,
}: {
  open: boolean;
  onClose: () => void;
  clients: AdminData["clients"];
  defaultClientId: string;
  defaultPlatform: AdPlatform;
  onSave: (s: AdScan) => void;
}) {
  const [clientId, setClientId] = useState(defaultClientId);
  const [platform, setPlatform] = useState<AdPlatform>(defaultPlatform);
  const [label, setLabel] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdScan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { setError("That doesn't look like an image."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Image is over 5MB. Please compress it."); return; }
    setError("");
    setBusy(true);
    setDraft(null);
    try {
      const dataUrl = await readAsDataUrl(file);
      setPreview(dataUrl);
      const res = await claudeScanAdScreenshot({ imageBase64: dataUrl, mediaType: file.type, platform, hint });
      if (!res.ok || !res.metrics) { setError(res.error || "Claude couldn't read metrics."); return; }
      setDraft({
        id: uid("ad"),
        clientId: clientId || undefined,
        platform,
        capturedAt: Date.now(),
        label: label.trim() || file.name,
        metrics: res.metrics,
        raw: res.raw,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function confirmSave() {
    if (!draft) return;
    onSave(draft);
    setDraft(null);
    setPreview(null);
    setLabel("");
    setHint("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function updateDraftMetric(k: MetricKey, v: string) {
    if (!draft) return;
    const num = v === "" ? undefined : Number(v);
    setDraft({
      ...draft,
      metrics: { ...draft.metrics, [k]: Number.isNaN(num as number) ? undefined : num },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Scan analytics screenshot" wide>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload any analytics dashboard (Meta / Google / TikTok / Shopify / GA / custom) and Claude will read the numbers. Review, edit, then save as a snapshot.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— None —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </select>
          </Field>
          <Field label="Platform">
            <select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value as AdPlatform)}>
              <option value="meta">Meta Ads</option>
              <option value="google">Google Ads</option>
              <option value="tiktok">TikTok Ads</option>
              <option value="other">Other / Generic</option>
            </select>
          </Field>
          <Field label="Label (optional)"><input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Shopify Nov overview" /></Field>
          <Field label="Hint (optional)"><input className={inputCls} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. Read the totals row only" /></Field>
        </div>

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
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
        </label>

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Extracting metrics…
          </div>
        )}
        {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</div>}

        {preview && !busy && (
          <img src={preview} alt="Preview" className="max-h-48 rounded-lg border border-border object-contain" />
        )}

        {draft && !busy && (
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review extracted metrics</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {METRICS.map((m) => (
                <label key={m.key} className="block">
                  <span className="mb-1 block text-[.7rem] font-medium text-muted-foreground">{m.label}</span>
                  <input
                    type="number"
                    step="any"
                    className={inputCls}
                    value={(draft.metrics[m.key] as number | undefined) ?? ""}
                    onChange={(e) => updateDraftMetric(m.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDraft(null)}>Discard</Btn>
              <Btn onClick={confirmSave}><Save className="h-4 w-4" aria-hidden="true" /> Save snapshot</Btn>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
