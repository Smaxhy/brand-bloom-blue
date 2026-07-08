import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Image as ImageIcon, Loader2, Plus, Save, Trash2, TrendingUp, TrendingDown, Camera, SlidersHorizontal, Pencil, Check, X, LineChart, AreaChart, Hash } from "lucide-react";
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

const PRESETS_STORAGE_KEY = "insp.stats.presets.v2";

type ChartType = "number" | "line" | "area" | "bar";
const CHART_TYPES: { key: ChartType; label: string; icon: React.ElementType }[] = [
  { key: "number", label: "Numbers only", icon: Hash },
  { key: "line", label: "Line", icon: LineChart },
  { key: "area", label: "Area", icon: AreaChart },
  { key: "bar", label: "Bar", icon: BarChart3 },
];

interface ClientPreset {
  visible: MetricKey[];
  chartType: ChartType;
  chartOverrides: Record<string, ChartType>;
  platform?: AdPlatform | "all";
  period?: PeriodKey;
}

type PeriodKey = "today" | "yesterday" | "7d" | "30d" | "90d" | "all";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

function periodRange(key: PeriodKey): { from: number; to: number } | null {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (key === "all") return null;
  if (key === "today") return { from: startOfToday, to: startOfToday + day };
  if (key === "yesterday") return { from: startOfToday - day, to: startOfToday };
  if (key === "7d") return { from: startOfToday - 7 * day, to: now.getTime() };
  if (key === "30d") return { from: startOfToday - 30 * day, to: now.getTime() };
  if (key === "90d") return { from: startOfToday - 90 * day, to: now.getTime() };
  return null;
}

const DEFAULT_PRESET: ClientPreset = {
  visible: METRICS.map((m) => m.key),
  chartType: "line",
  chartOverrides: {},
  platform: "all",
  period: "all",
};

function loadPresets(): Record<string, ClientPreset> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ClientPreset>;
  } catch {
    return {};
  }
}

function presetFor(all: Record<string, ClientPreset>, id: string): ClientPreset {
  const p = all[id];
  if (!p) return { ...DEFAULT_PRESET };
  return {
    visible: (p.visible ?? DEFAULT_PRESET.visible).filter((k): k is MetricKey => METRICS.some((m) => m.key === k)),
    chartType: CHART_TYPES.some((c) => c.key === p.chartType) ? p.chartType : DEFAULT_PRESET.chartType,
    chartOverrides: p.chartOverrides ?? {},
    platform: p.platform ?? "all",
    period: PERIODS.some((x) => x.key === p.period) ? (p.period as PeriodKey) : "all",
  };
}

export function Statistics({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const [presets, setPresets] = useState<Record<string, ClientPreset>>(() => loadPresets());
  const [clientId, setClientId] = useState<string>("all");
  const initial = presetFor(presets, "all");
  const [platform, setPlatform] = useState<AdPlatform | "all">(initial.platform ?? "all");
  const [period, setPeriod] = useState<PeriodKey>(initial.period ?? "all");
  const [entryOpen, setEntryOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visible, setVisible] = useState<Set<MetricKey>>(() => new Set(initial.visible));
  const [chartType, setChartType] = useState<ChartType>(initial.chartType);
  const [chartOverrides, setChartOverrides] = useState<Record<string, ChartType>>(initial.chartOverrides);
  const [savedFlash, setSavedFlash] = useState(false);
  const skipSaveRef = useRef(false);

  // Load preset when client changes
  useEffect(() => {
    const p = presetFor(presets, clientId);
    skipSaveRef.current = true;
    setVisible(new Set(p.visible));
    setChartType(p.chartType);
    setChartOverrides(p.chartOverrides);
    setPlatform(p.platform ?? "all");
    setPeriod(p.period ?? "all");
  }, [clientId]);

  // Auto-save preset for current client whenever config changes
  useEffect(() => {
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    setPresets((prev) => {
      const next = {
        ...prev,
        [clientId]: {
          visible: [...visible],
          chartType,
          chartOverrides,
          platform,
        },
      };
      try { window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 1200);
    return () => clearTimeout(t);
  }, [visible, chartType, chartOverrides, platform, clientId]);

  function cycleOverride(key: MetricKey) {
    setChartOverrides((prev) => {
      const current = prev[key] ?? chartType;
      const idx = CHART_TYPES.findIndex((c) => c.key === current);
      const next = CHART_TYPES[(idx + 1) % CHART_TYPES.length].key;
      return { ...prev, [key]: next };
    });
  }

  function applyGlobalChartType(next: ChartType) {
    setChartType(next);
    setChartOverrides({});
  }

  function resetPresetForCurrentClient() {
    if (!confirm("Reset saved view for this client to defaults?")) return;
    skipSaveRef.current = true;
    setVisible(new Set(DEFAULT_PRESET.visible));
    setChartType(DEFAULT_PRESET.chartType);
    setChartOverrides({});
    setPlatform("all");
    setPresets((prev) => {
      const next = { ...prev };
      delete next[clientId];
      try { window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

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

          <Field label="Chart style">
            <div className="inline-flex rounded-xl border border-border bg-secondary/50 p-0.5" role="group" aria-label="Chart style">
              {CHART_TYPES.map((c) => {
                const Icon = c.icon;
                const active = chartType === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => applyGlobalChartType(c.key)}
                    aria-pressed={active}
                    title={c.label}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{c.label.replace(" only", "")}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span
              aria-live="polite"
              className={`text-xs transition-opacity ${savedFlash ? "opacity-100 text-emerald-600" : "opacity-60 text-muted-foreground"}`}
            >
              {savedFlash ? "Saved" : `View saved for ${activeClient ? activeClient.company : "All clients"}`}
            </span>
            <Btn variant="ghost" onClick={resetPresetForCurrentClient}>
              Reset preset
            </Btn>
            <Btn variant="ghost" onClick={() => { setChartOverrides({}); }}>
              Reset per-card
            </Btn>
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
                chartType={chartOverrides[m.key] ?? chartType}
                onCycleChart={() => cycleOverride(m.key)}
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

      <CustomizeModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        visible={visible}
        onChange={setVisible}
      />
    </div>
  );
}

/* -------------------------- metric card + chart -------------------------- */

function Sparkline({ points, goodDirection, variant }: { points: number[]; goodDirection: "up" | "down"; variant: "line" | "area" | "bar" }) {
  if (points.length === 0) {
    return (
      <div className="mt-3 h-12 rounded-md bg-secondary/50 grid place-items-center text-[.65rem] text-muted-foreground">
        Add a snapshot to see a chart
      </div>
    );
  }
  const chartPoints = points.length === 1 ? [points[0], points[0]] : points;
  const w = 200;
  const h = 48;
  const min = Math.min(...chartPoints, 0);
  const max = Math.max(...chartPoints);
  const span = max - min || 1;
  const first = chartPoints[0];
  const last = chartPoints[chartPoints.length - 1];
  const trendingUp = last >= first;
  const isGood = goodDirection === "up" ? trendingUp : !trendingUp;
  const stroke = isGood ? "var(--brand-violet)" : "oklch(.62 .22 25)";

  // Scoped keyframes for chart animations (draw, grow, bob)
  const anim = (
    <style>{`
      @keyframes insp-draw { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
      @keyframes insp-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes insp-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      @keyframes insp-bob-up   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
      @keyframes insp-bob-down { 0%,100% { transform: translateY(0); } 50% { transform: translateY( 2px); } }
      @keyframes insp-pulse { 0%,100% { r: var(--r); opacity: 1; } 50% { r: calc(var(--r) * 1.6); opacity: .6; } }
      .insp-line { stroke-dasharray: var(--len); animation: insp-draw 900ms ease-out both; }
      .insp-area { animation: insp-fade 700ms ease-out 200ms both; }
      .insp-dot  { animation: insp-fade 400ms ease-out both; }
      .insp-last { transform-box: fill-box; transform-origin: center; animation: insp-pulse 1.8s ease-in-out infinite; }
      .insp-bar  { transform-box: fill-box; transform-origin: bottom; animation: insp-grow 600ms cubic-bezier(.2,.7,.2,1) both; }
      .insp-bob-up   { transform-box: fill-box; transform-origin: center; animation: insp-bob-up   2.4s ease-in-out infinite; }
      .insp-bob-down { transform-box: fill-box; transform-origin: center; animation: insp-bob-down 2.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .insp-line, .insp-area, .insp-dot, .insp-last, .insp-bar, .insp-bob-up, .insp-bob-down { animation: none !important; }
      }
    `}</style>
  );

  if (variant === "bar") {
    const gap = 2;
    const bw = Math.max(2, (w - gap * (chartPoints.length - 1)) / chartPoints.length);
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 h-12 w-full" role="img" aria-label="Trend bars">
        {anim}
        {chartPoints.map((v, i) => {
          const barH = Math.max(6, ((v - min) / span) * (h - 4));
          const x = i * (bw + gap);
          const y = h - barH;
          const isLast = i === chartPoints.length - 1;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={bw}
              height={barH}
              rx="1.5"
              fill={stroke}
              fillOpacity={isLast ? 1 : 0.55}
              className={`insp-bar ${isLast ? (trendingUp ? "insp-bob-up" : "insp-bob-down") : ""}`}
              style={{ animationDelay: `${i * 40}ms` }}
            />
          );
        })}
      </svg>
    );
  }

  const step = w / (chartPoints.length - 1);
  const coords = chartPoints.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * (h - 6) - 3;
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w.toFixed(1)},${h} L0,${h} Z`;
  // Rough path length for draw animation
  let pathLen = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    pathLen += Math.hypot(dx, dy);
  }
  const lenStr = String(Math.max(1, Math.round(pathLen)));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 h-12 w-full" role="img" aria-label="Trend sparkline">
      {anim}
      {variant === "area" && <path className="insp-area" d={area} fill={stroke} fillOpacity="0.18" />}
      <path
        className="insp-line"
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ ["--len" as string]: lenStr }}
      />
      {coords.map(([x, y], i) => {
        const isLast = i === coords.length - 1;
        const r = isLast ? 2.5 : 1.5;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={r}
            fill={stroke}
            className={`insp-dot ${isLast ? "insp-last " + (trendingUp ? "insp-bob-up" : "insp-bob-down") : ""}`}
            style={{ animationDelay: `${600 + i * 20}ms`, ["--r" as string]: String(r) }}
          />
        );
      })}
    </svg>
  );
}

function MetricCard({
  metric, value, delta, good, currency, points, chartType, onCycleChart, canEdit, onSave,
}: {
  metric: MetricDef;
  value: number | undefined;
  delta: number | undefined;
  good: boolean | null;
  currency: string;
  points: number[];
  chartType: ChartType;
  onCycleChart: () => void;
  canEdit: boolean;
  onSave: (v: number | undefined) => void;
}) {
  const ChartIcon = CHART_TYPES.find((c) => c.key === chartType)?.icon ?? LineChart;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value === undefined ? "" : String(value));

  useEffect(() => {
    if (!editing) setDraft(value === undefined ? "" : String(value));
  }, [value, editing]);

  function commit() {
    if (draft.trim() === "") {
      onSave(undefined);
    } else {
      const num = Number(draft);
      if (!Number.isNaN(num)) onSave(num);
    }
    setEditing(false);
  }

  return (
    <Panel className="relative">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[.68rem] font-semibold uppercase tracking-[.12em] text-muted-foreground">{metric.label}</div>
            <div className="flex items-center gap-1">
              <button
                onClick={onCycleChart}
                aria-label={`Change chart style for ${metric.label}`}
                title={`Chart: ${CHART_TYPES.find((c) => c.key === chartType)?.label ?? "Line"} (click to change)`}
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <ChartIcon className="h-3 w-3" aria-hidden="true" />
              </button>
              {canEdit && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  aria-label={`Edit ${metric.label}`}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          {editing ? (
            <div className="mt-2 flex items-center gap-1">
              <input
                autoFocus
                type="number"
                step="any"
                className={`${inputCls} py-1.5 text-base font-semibold`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") { setEditing(false); setDraft(value === undefined ? "" : String(value)); }
                }}
              />
              <button onClick={commit} aria-label="Save" className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
                <Check className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(value === undefined ? "" : String(value)); }}
                aria-label="Cancel"
                className="grid h-8 w-8 place-items-center rounded-md border border-border"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="mt-2 font-display text-2xl font-bold tracking-tight">
              {fmt(value, metric.kind, currency)}
            </div>
          )}
          {metric.hint && !editing && <div className="mt-1 text-xs text-muted-foreground">{metric.hint}</div>}
        </div>
        {delta !== undefined && !editing && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[.7rem] font-semibold ${
              good
                ? "bg-[oklch(.95_.05_150)] text-[oklch(.42_.15_150)] dark:bg-[oklch(.25_.08_150)] dark:text-[oklch(.82_.15_150)]"
                : "bg-[oklch(.95_.05_25)] text-[oklch(.5_.2_25)] dark:bg-[oklch(.25_.08_25)] dark:text-[oklch(.82_.15_25)]"
            }`}
            title="Change vs previous snapshot"
          >
            {good ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
      </div>
      {chartType !== "number" && <Sparkline points={points} goodDirection={metric.goodDirection} variant={chartType} />}
    </Panel>
  );
}

function CustomizeModal({
  open, onClose, visible, onChange,
}: {
  open: boolean;
  onClose: () => void;
  visible: Set<MetricKey>;
  onChange: (next: Set<MetricKey>) => void;
}) {
  function toggle(key: MetricKey) {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  }
  return (
    <Modal open={open} onClose={onClose} title="Customize metric cards" wide>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pick which metrics show up on the Statistics dashboard. Your choice is remembered on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={() => onChange(new Set(METRICS.map((m) => m.key)))}>Show all</Btn>
          <Btn variant="ghost" onClick={() => onChange(new Set())}>Hide all</Btn>
          <Btn
            variant="ghost"
            onClick={() =>
              onChange(new Set(["sales", "spend", "roas", "clicks", "ctr", "cpc", "conversions", "cpa"] as MetricKey[]))
            }
          >
            Ads essentials
          </Btn>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {METRICS.map((m) => {
            const on = visible.has(m.key);
            return (
              <label
                key={m.key}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  on ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-secondary/60"
                }`}
              >
                <div className="min-w-0">
                  <div className="font-semibold">{m.label}</div>
                  {m.hint && <div className="text-[.7rem] text-muted-foreground">{m.hint}</div>}
                </div>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(m.key)}
                  className="h-4 w-4 accent-[var(--brand-violet)]"
                  aria-label={`Toggle ${m.label}`}
                />
              </label>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Btn onClick={onClose}>Done</Btn>
        </div>
      </div>
    </Modal>
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
