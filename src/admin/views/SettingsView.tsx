import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Save,
  RotateCcw,
  Send,
  CheckCircle2,
  XCircle,
  Moon,
  Sun,
  Download,
  FileJson,
  FileSpreadsheet,
  Mail,
  Plus,
  Pause,
  Play,
  Trash2,
  Building2,
  Plug,
  Loader2,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { type AdminData, resetData, exportAccountJson, exportAccountCsvs } from "../store";
import {
  type Mailbox,
  type OutreachSettings,
  listMailboxes,
  updateMailbox,
  deleteMailbox,
  connectMailboxUrl,
  connectGhl,
  sendTestEmail,
  getOutreachSettings,
  saveOutreachSettings,
  integrationStatus,
  schedulerStatus,
  setScheduler,
  type SchedulerState,
} from "../outreach";
import { Panel, Field, inputCls, Btn, Modal } from "../ui";
import { useServerFn } from "@tanstack/react-start";
import { canConfigureIntegrations, saveIntegrationCredentials } from "@/lib/integration-settings.functions";
import { integrationFields, integrationInputSchema } from "@/lib/integration-settings-schema";

export function SettingsView({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const [s, setS] = useState(data.settings);
  const [saved, setSaved] = useState(false);
  const dark = s.theme === "dark";

  function save() {
    update((p) => ({ ...p, settings: s }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function reset() {
    if (
      confirm(
        "Reset all admin data back to the demo seed? This affects every signed-in device and cannot be undone.",
      )
    ) {
      const fresh = await resetData();
      update(() => fresh);
      setS(fresh.settings);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
            {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">Appearance</h3>
            <p className="text-xs text-muted-foreground">Choose your preferred admin theme.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const next = { ...s, theme: "light" as const };
              setS(next);
              update((p) => ({ ...p, settings: next }));
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              !dark
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Sun className="h-4 w-4" /> Light
          </button>
          <button
            onClick={() => {
              const next = { ...s, theme: "dark" as const };
              setS(next);
              update((p) => ({ ...p, settings: next }));
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              dark
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Moon className="h-4 w-4" /> Dark
          </button>
        </div>
      </Panel>

      <MailboxesPanel />
      <BackgroundTimerPanel />
      <SenderIdentityPanel />
      <IntegrationsPanel />
      <TwoFactorPanel />

      <Panel>
        <h3 className="font-display text-lg font-bold">Access</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Accounts are signed in through the backend. Each username opens that account's own data.
        </p>
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
            <Download className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">Export your account data</h3>
            <p className="text-xs text-muted-foreground">
              Download everything in your account, ready to import into any future CRM.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You own your data. Grab a full JSON snapshot for a perfect archive, or per-table CSVs that
          most CRMs (HubSpot, Pipedrive, Salesforce, GHL, Zoho…) can import directly. Includes
          clients, deals, leads, tasks, transactions, campaigns, templates and ad scans.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn onClick={() => exportAccountJson(data, "account")}>
            <FileJson className="h-4 w-4" aria-hidden="true" /> Download full JSON
          </Btn>
          <Btn variant="ghost" onClick={() => exportAccountCsvs(data, "account")}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Download CSVs
          </Btn>
        </div>
        <p className="mt-3 rounded-lg bg-secondary px-3 py-2.5 text-[.7rem] leading-relaxed text-muted-foreground">
          The JSON file is a full, machine-readable copy of your account. The CSV bundle exports one
          file per table so you can drop each one into your next CRM's import flow.
        </p>
      </Panel>

      <Panel>
        <h3 className="font-display text-lg font-bold">Data</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          All admin data is stored per account in the backend. Reset only affects the signed-in
          account.
        </p>
        <Btn variant="danger" onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset all data
        </Btn>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------ mailboxes */
const TIMEZONES = [
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "America/Phoenix",
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
];

/** Settings → Background timer: sending and scans continue with the app closed. */
function BackgroundTimerPanel() {
  const [st, setSt] = useState<SchedulerState | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => schedulerStatus().then(setSt).catch(() => setSt({ ok: false, error: "Could not read the timer state." })), []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);
  const ageMin = st?.last_tick_at ? (Date.now() - Date.parse(st.last_tick_at)) / 60000 : Infinity;
  const running = ageMin <= (st?.last_tick_source === "db" ? 7 : 3);
  const via =
    st?.last_tick_source === "db"
      ? "the database timer"
      : st?.last_tick_source === "cron"
        ? "the Cloudflare cron"
        : st?.last_tick_source === "external"
          ? "an outside timer"
          : "a timer";
  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      const r = await setScheduler(enabled);
      if (!r.ok) throw new Error(r.error || "Could not change the timer");
      toast.success(enabled ? "Background timer is on — it runs every five minutes." : "Background timer is off.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
          <Timer className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg font-bold">Background timer</h3>
          <p className="text-xs text-muted-foreground">
            Sends queued emails one by one and keeps background scans reading websites every five minutes —
            with this app and your computer closed.
          </p>
        </div>
      </div>
      {!st ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${running ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/50"}`} role="status">
            {running ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            <div>
              <div className="font-semibold">
                {running
                  ? `Running — ${via} last ran ${ageMin < 1 ? "just now" : `${Math.round(ageMin)} min ago`}.`
                  : st.last_tick_at
                    ? `Not running — last background run ${ageMin < 120 ? `${Math.round(ageMin)} min` : `${Math.round(ageMin / 60)} h`} ago.`
                    : "Not running yet."}
              </div>
              {!running && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Until it runs, emails and scans only move while an admin tab is open.
                </div>
              )}
            </div>
          </div>
          {st.ok === false && st.error && <p className="text-xs text-destructive">{st.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {st.enabled ? (
              <>
                <span className="text-xs text-muted-foreground">Database timer is on → {st.url}</span>
                <Btn variant="ghost" onClick={() => void toggle(false)} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Turn off
                </Btn>
                <Btn variant="ghost" onClick={() => void toggle(true)} disabled={busy} title="Create a fresh timer token and address">
                  <RotateCcw className="h-4 w-4" /> Renew
                </Btn>
              </>
            ) : (
              <Btn onClick={() => void toggle(true)} disabled={busy || st.migrated === false}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Turn on the database timer
              </Btn>
            )}
          </div>
          {st.migrated === false && (
            <p className="text-xs text-muted-foreground">
              Needs the database update <code className="rounded bg-secondary px-1">0016_background_scheduler</code> first.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Calls <code className="rounded bg-secondary px-1">{st.url || st.suggested_url}</code> every five minutes
            with a private token. If your Cloudflare cron already runs, both can stay on — they never send
            the same email twice.
          </p>
        </div>
      )}
    </Panel>
  );
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function MailboxesPanel() {
  const [rows, setRows] = useState<Mailbox[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testBusy, setTestBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    preview?: { subject: string; text: string };
  } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [ghlOpen, setGhlOpen] = useState(false);
  const [ghl, setGhl] = useState({
    apiKey: "",
    locationId: "",
    companyId: "",
    fromEmail: "",
    fromName: "",
  });
  const [ghlBusy, setGhlBusy] = useState(false);

  const load = useCallback(
    () =>
      listMailboxes()
        .then(setRows)
        .then(() => setErr(null))
        .catch((e) => setErr((e as Error).message)),
    [],
  );
  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search);
    if (q.get("mailbox") === "connected") {
      toast.success(
        `Connected ${q.get("email") ?? "mailbox"} — set its daily cap and hours below.`,
      );
      history.replaceState(null, "", window.location.pathname);
    } else if (q.get("mailbox") === "error") {
      toast.error(`Could not connect mailbox: ${q.get("reason") ?? "unknown error"}`);
      history.replaceState(null, "", window.location.pathname);
    }
  }, [load]);

  async function connect() {
    setConnecting(true);
    try {
      window.location.href = await connectMailboxUrl();
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  }
  async function patch(id: string, p: Partial<Mailbox>) {
    setRows((r) => r.map((m) => (m.id === id ? { ...m, ...p } : m)));
    try {
      await updateMailbox(id, p);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function test(m: Mailbox) {
    if (!testTo.includes("@")) return toast.error("Enter the address to send the test to.");
    setTestBusy(m.id);
    setTestResult(null);
    const r = await sendTestEmail(m.id, testTo.trim(), "US");
    setTestResult(r);
    setTestBusy(null);
    if (r.ok) toast.success(`Test sent from ${m.email}`);
  }

  return (
    <Panel>
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
          <Mail className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg font-bold">Sending mailboxes</h3>
          <p className="text-xs text-muted-foreground">
            Where outreach goes out from: Google Workspace mailboxes (best reply rates, ~40/day
            each) or a GoHighLevel sub-account (volume from day one). Sequences can use any mix.
          </p>
        </div>
        <Btn
          variant="ghost"
          onClick={() => setGhlOpen(true)}
          title="Send through a GoHighLevel sub-account instead of a Google mailbox"
        >
          <Plus className="h-4 w-4" /> Connect GoHighLevel
        </Btn>
        <Btn onClick={() => void connect()} disabled={connecting}>
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{" "}
          Connect Google mailbox
        </Btn>
      </div>
      {err && (
        <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {err}
        </p>
      )}
      {!rows.length && !err && (
        <p className="rounded-lg bg-secondary px-3 py-2.5 text-sm text-muted-foreground">
          No mailboxes yet. Use a <strong>secondary domain</strong> (e.g. getinspirova.com) with
          SPF, DKIM and DMARC set up in Google Workspace, so your main domain's reputation is never
          at risk.
        </p>
      )}
      <div className="space-y-3">
        {rows.map((m) => (
          <div key={m.id} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{m.email}</span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-px text-[.6rem] font-bold uppercase tracking-wide ${
                      m.provider === "ghl"
                        ? "bg-[oklch(.8_.16_80)]/25 text-[oklch(.45_.1_70)]"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {m.provider === "ghl" ? "GoHighLevel" : "Google"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {m.last_sync_at
                    ? `Inbox checked ${new Date(m.last_sync_at).toLocaleString()}`
                    : "Inbox not checked yet"}
                </div>
                {m.last_error && (
                  <div className="mt-0.5 text-xs text-destructive">{m.last_error}</div>
                )}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[.65rem] font-semibold uppercase ${m.status === "active" ? "bg-[oklch(.7_.18_150)]/15 text-[oklch(.4_.12_150)]" : m.status === "error" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}
              >
                {m.status}
              </span>
              <button
                aria-label={m.status === "active" ? "Pause mailbox" : "Resume mailbox"}
                onClick={() =>
                  void patch(m.id, {
                    status: m.status === "active" ? "paused" : "active",
                    last_error: null,
                  })
                }
                className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-secondary"
              >
                {m.status === "active" ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
              <button
                aria-label="Disconnect mailbox"
                onClick={() => {
                  if (
                    confirm(
                      `Disconnect ${m.email}? Queued emails assigned to it will move to the next free mailbox.`,
                    )
                  )
                    void deleteMailbox(m.id).then(load);
                }}
                className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
              <Field label="From name">
                <input
                  className={inputCls}
                  value={m.display_name}
                  onChange={(e) =>
                    setRows((r) =>
                      r.map((x) => (x.id === m.id ? { ...x, display_name: e.target.value } : x)),
                    )
                  }
                  onBlur={(e) => void patch(m.id, { display_name: e.target.value })}
                />
              </Field>
              <Field label="Daily cap">
                <input
                  type="number"
                  min={1}
                  max={300}
                  className={inputCls}
                  value={m.daily_cap}
                  onChange={(e) =>
                    void patch(m.id, { daily_cap: Math.max(1, Number(e.target.value)) })
                  }
                />
              </Field>
              <Field label="Timezone">
                <select
                  className={inputCls}
                  value={m.timezone}
                  onChange={(e) => void patch(m.id, { timezone: e.target.value })}
                >
                  {[m.timezone, ...TIMEZONES.filter((t) => t !== m.timezone)].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Send between">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    className={inputCls + " w-16"}
                    value={m.window_start}
                    onChange={(e) => void patch(m.id, { window_start: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground">and</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className={inputCls + " w-16"}
                    value={m.window_end}
                    onChange={(e) => void patch(m.id, { window_end: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground">o'clock</span>
                </div>
              </Field>
              <Field label="Days">
                <div className="flex gap-1">
                  {DAYS.map((d, i) => {
                    const on = m.send_days.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          void patch(m.id, {
                            send_days: on
                              ? m.send_days.filter((x) => x !== i)
                              : [...m.send_days, i].sort(),
                          })
                        }
                        className={`h-9 w-9 rounded-lg border text-xs font-semibold ${on ? "border-transparent bg-[var(--brand-violet)] text-white" : "border-border text-muted-foreground"}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Signature (added under every email)">
                <textarea
                  className={inputCls + " min-h-[64px]"}
                  value={m.signature}
                  onChange={(e) =>
                    setRows((r) =>
                      r.map((x) => (x.id === m.id ? { ...x, signature: e.target.value } : x)),
                    )
                  }
                  onBlur={(e) => void patch(m.id, { signature: e.target.value })}
                  placeholder={"Sam Peeters\nInspirova Marketing · +32 …"}
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <input
                type="email"
                className={inputCls + " max-w-xs"}
                placeholder="you@yourdomain.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <Btn variant="ghost" onClick={() => void test(m)} disabled={testBusy === m.id}>
                {testBusy === m.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}{" "}
                Send test from this mailbox
              </Btn>
            </div>
          </div>
        ))}
      </div>
      {testResult && (
        <div
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${testResult.ok ? "bg-[oklch(.7_.18_150)]/12 text-[oklch(.45_.15_150)]" : "bg-destructive/10 text-destructive"}`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4" />
          )}
          <div>
            {testResult.ok
              ? "Sent. Check the inbox (and spam) — the footer shows exactly what prospects will see."
              : testResult.error}
          </div>
        </div>
      )}
      <p className="mt-4 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <strong>One-time setup in Google Cloud:</strong> enable the Gmail API, set the OAuth consent
        screen to <em>Internal</em>, create a Web OAuth client with redirect URI{" "}
        <code>
          {typeof window !== "undefined" ? window.location.origin : ""}/api/google/oauth/callback
        </code>
        , then add <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code>{" "}
        as secrets. Emails go out one by one at each sequence's pace within the mailbox's hours,
        follow-ups reply in the same thread, and replies or bounces stop the sequence automatically.
      </p>
      <Modal open={ghlOpen} onClose={() => setGhlOpen(false)} title="Connect GoHighLevel">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sends go through your GHL sub-account's email (LC Email / Mailgun) instead of a Google
            mailbox. Replies and bounces are picked up every few minutes. Use a dedicated sending
            domain in GHL (Settings → Email Services) and start at 50–100 a day.
          </p>
          <Field label="Private Integration token (or Agency API key)">
            <input
              className={inputCls}
              value={ghl.apiKey}
              onChange={(e) => setGhl({ ...ghl, apiKey: e.target.value })}
              placeholder="pit-… or eyJ…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location ID (sub-account)">
              <input
                className={inputCls}
                value={ghl.locationId}
                onChange={(e) => setGhl({ ...ghl, locationId: e.target.value })}
              />
            </Field>
            <Field label="Company ID (only for Agency keys)">
              <input
                className={inputCls}
                value={ghl.companyId}
                onChange={(e) => setGhl({ ...ghl, companyId: e.target.value })}
                placeholder="optional"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From email (verified in GHL)">
              <input
                className={inputCls}
                value={ghl.fromEmail}
                onChange={(e) => setGhl({ ...ghl, fromEmail: e.target.value })}
                placeholder="sam@getinspirova.com"
              />
            </Field>
            <Field label="From name">
              <input
                className={inputCls}
                value={ghl.fromName}
                onChange={(e) => setGhl({ ...ghl, fromName: e.target.value })}
                placeholder="Sam at Inspirova"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Where to find these: GHL → Settings → Private Integrations (token); the Location ID is
            in Settings → Business Profile. Daily cap starts at 1000; change it under the mailbox once
            connected.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" onClick={() => setGhlOpen(false)}>
              Cancel
            </Btn>
            <Btn
              disabled={ghlBusy || !ghl.apiKey || !ghl.locationId || !ghl.fromEmail.includes("@")}
              onClick={async () => {
                setGhlBusy(true);
                const r = await connectGhl(ghl);
                setGhlBusy(false);
                if (!r.ok) return toast.error(r.error || "Could not connect");
                toast.success(`Connected GoHighLevel: ${r.location}`);
                setGhlOpen(false);
                setGhl({ apiKey: "", locationId: "", companyId: "", fromEmail: "", fromName: "" });
                void load();
              }}
            >
              {ghlBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}{" "}
              Connect
            </Btn>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}

/* ------------------------------------------------------- sender identity */
function SenderIdentityPanel() {
  const [s, setS] = useState<OutreachSettings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void getOutreachSettings()
      .then(setS)
      .catch(() => setS(null));
  }, []);
  if (!s) return null;
  async function save() {
    if (!s) return;
    try {
      await saveOutreachSettings(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <Panel>
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
          <Building2 className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Sender identity &amp; legal footer</h3>
          <p className="text-xs text-muted-foreground">
            Required by CAN-SPAM (US) and GDPR (EU). Added automatically under every outreach email.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name">
            <input
              className={inputCls}
              value={s.company_name}
              onChange={(e) => setS({ ...s, company_name: e.target.value })}
            />
          </Field>
          <Field label="Website">
            <input
              className={inputCls}
              value={s.website}
              onChange={(e) => setS({ ...s, website: e.target.value })}
              placeholder="inspirovamarketing.com"
            />
          </Field>
        </div>
        <Field label="Physical postal address (legally required in the US)">
          <input
            className={inputCls}
            value={s.postal_address}
            onChange={(e) => setS({ ...s, postal_address: e.target.value })}
            placeholder="Street, City, State/Postcode, Country"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email format">
            <select
              className={inputCls}
              value={s.plain_text === false ? "html" : "plain"}
              onChange={(e) => setS({ ...s, plain_text: e.target.value !== "html" })}
            >
              <option value="plain">Plain text only (recommended — lands in Primary)</option>
              <option value="html">Light HTML</option>
            </select>
          </Field>
          <Field label="Opt-out footer">
            <select
              className={inputCls}
              value={s.footer_style === "block" ? "block" : "sentence"}
              onChange={(e) =>
                setS({ ...s, footer_style: e.target.value === "block" ? "block" : "sentence" })
              }
            >
              <option value="sentence">One sentence: "reply no" + address (recommended)</option>
              <option value="block">Classic grey footer with Unsubscribe link</option>
            </select>
          </Field>
        </div>
        {(s.footer_style || "sentence") !== "block" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Opt-out sentence for US leads">
              <input
                className={inputCls}
                value={s.optout_line_us ?? ""}
                onChange={(e) => setS({ ...s, optout_line_us: e.target.value })}
                placeholder={"If this isn't relevant, just reply \"no\" and I won't write again."}
              />
            </Field>
            <Field label="Opt-out sentence for EU leads">
              <input
                className={inputCls}
                value={s.optout_line_eu ?? ""}
                onChange={(e) => setS({ ...s, optout_line_eu: e.target.value })}
                placeholder={'Niet relevant? Antwoord gewoon "nee" en ik mail je niet meer.'}
              />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Your company name and postal address are appended to this sentence. A reply of "no" /
              "nee" is detected by the inbox sync and suppresses the address; Gmail sends still
              carry the one-click List-Unsubscribe header invisibly.
            </p>
          </div>
        ) : null}
        <Field label="AI instructions — what we sell and how we sound">
          <textarea
            className={inputCls + " min-h-[160px] font-mono text-xs"}
            value={s.ai_instructions ?? ""}
            onChange={(e) => setS({ ...s, ai_instructions: e.target.value })}
            placeholder={`We are a small marketing agency for local service businesses.
What we sell: websites, Google Ads, Google Business Profile, review automation, online booking.
Tone: plain, warm, direct. No hype, no exclamation marks.
Length: first email under 90 words, follow-ups under 50.
Always mention one specific thing about their business ({{pitch}} / {{gap}}); one ask: a 10-minute call.
Never promise results or quote prices.`}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            This one text steers every AI prompt: <b>Write with AI</b> in the sequence editor, the{" "}
            <code>{"{{pitch}}"}</code> / <code>{"{{gap}}"}</code> lines written when a business is
            scanned, and the reply drafts in Outreach → Replies. Change it any time; leave it empty
            for the built-in default.
          </p>
        </Field>
        <Field label="Notice for US leads (classic footer only)">
          <textarea
            className={inputCls + " min-h-[60px]"}
            value={s.us_notice}
            onChange={(e) => setS({ ...s, us_notice: e.target.value })}
          />
        </Field>
        <Field label="Notice for EU leads (classic footer only)">
          <textarea
            className={inputCls + " min-h-[72px]"}
            value={s.eu_notice}
            onChange={(e) => setS({ ...s, eu_notice: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Btn onClick={() => void save()}>
          <Save className="h-4 w-4" /> Save
        </Btn>
        {saved && <span className="text-sm text-[oklch(.55_.15_150)]">Saved ✓</span>}
        {!s.postal_address && (
          <span className="text-xs text-destructive">
            Add a postal address before sending to US leads.
          </span>
        )}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------- integrations */
const INTEGRATIONS: {
  key: string;
  name: string;
  cost: string;
  need: "required" | "recommended" | "optional";
  how: string;
}[] = [
  {
    key: "db",
    name: "Server database access (SUPABASE_SERVICE_ROLE_KEY)",
    cost: "free",
    need: "required",
    how: "Lovable Cloud provides this automatically; the scheduler and mailbox connection need it.",
  },
  {
    key: "oauth",
    name: "Google OAuth client (GOOGLE_OAUTH_CLIENT_ID / _SECRET)",
    cost: "free",
    need: "required",
    how: "Google Cloud → OAuth consent screen (Internal) → Credentials → Web client.",
  },
  {
    key: "cronSecret",
    name: "CRON_SECRET",
    cost: "free",
    need: "required",
    how: "Any long random string. Protects the scheduler route and signs the mailbox sign-in.",
  },
  {
    key: "places",
    name: "Google Places API (GOOGLE_PLACES_API_KEY)",
    cost: "free tier ≈ 20,000 businesses/mo",
    need: "recommended",
    how: 'Google Cloud → enable "Places API (New)" → API key restricted to it. Billing must be attached.',
  },
  {
    key: "anthropic",
    name: "Anthropic (ANTHROPIC_API_KEY)",
    cost: "≈ ¢ per website",
    need: "recommended",
    how: "Claude Haiku reads each site to name the decision-maker.",
  },
  {
    key: "apify",
    name: "Apify (APIFY_TOKEN)",
    cost: "$5 free credit / mo, then ≈ $0.50–4 per 1,000 places",
    need: "optional",
    how: "Bulk Google Maps walk: hundreds of businesses per search instead of Google's 60. Turn on 'Apify bulk' in the scraper.",
  },
  {
    key: "serper",
    name: "Serper.dev (SERPER_API_KEY)",
    cost: "2,500 free, then $1 / 1,000",
    need: "optional",
    how: "Cheap Google / Maps backup and owner lookups.",
  },
  {
    key: "brave",
    name: "Brave Search (BRAVE_SEARCH_API_KEY)",
    cost: "≈ 2,000 free / mo",
    need: "optional",
    how: "Free website & email discovery that keeps working after Serper runs out. Get a key at api-dashboard.search.brave.com (Free plan).",
  },
  {
    key: "reoon",
    name: "Reoon verifier (REOON_API_KEY)",
    cost: "20 free/day, then $1.19 / 1,000",
    need: "optional",
    how: "Powers the automatic bounce check: every address is verified (real SMTP check) before its first email. Without it the check is MX-only.",
  },
  {
    key: "apollo",
    name: "Apollo.io (APOLLO_API_KEY)",
    cost: "paid credits",
    need: "optional",
    how: "Only used when 'paid fallback' is switched on in the scraper.",
  },
  {
    key: "hunter",
    name: "Hunter.io (HUNTER_API_KEY)",
    cost: "paid credits",
    need: "optional",
    how: "Same — paid fallback only.",
  },
];

function IntegrationsPanel() {
  const [st, setSt] = useState<Record<string, boolean> | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const checkPermission = useServerFn(canConfigureIntegrations);
  const saveCredentials = useServerFn(saveIntegrationCredentials);
  useEffect(() => {
    void checkPermission().then((r) => setAllowed(r.allowed)).catch(() => setAllowed(false));
  }, [checkPermission]);
  async function submitCredentials() {
    if (busy || !editing) return;
    const fields = integrationFields[editing] ?? [];
    if (fields.some((f) => !values[f.name]?.trim())) { setError("Enter all the details for this integration."); return; }
    const result = integrationInputSchema.safeParse({ values });
    if (!result.success) { setError("Check your details: remove spaces and enter a valid credential."); return; }
    setBusy(true);
    setError("");
    try {
      await saveCredentials({ data: result.data });
      setValues({});
      setEditing(null);
      toast.success("Integration details saved securely.");
      setSt(await integrationStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally { setBusy(false); }
  }
  useEffect(() => {
    void integrationStatus()
      .then(setSt)
      .catch(() => setSt({}));
  }, []);
  return (
    <Panel>
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
          <Plug className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Integrations &amp; keys</h3>
          <p className="text-xs text-muted-foreground">
            {allowed ? "Add or replace shared service credentials below. Saved keys are never displayed." : "Shared service credentials are managed by administrators."}
          </p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {INTEGRATIONS.map((i) => {
          const ok = st?.[i.key];
          return (
            <div key={i.key} className="flex items-start gap-3 py-2.5">
              {st === null ? (
                <span className="mt-1 h-3 w-3 rounded-full bg-secondary" />
              ) : ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(.55_.15_150)]" />
              ) : (
                <XCircle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${i.need === "required" ? "text-destructive" : "text-muted-foreground"}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {i.name}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[.6rem] font-semibold uppercase ${i.need === "required" ? "bg-destructive/10 text-destructive" : i.need === "recommended" ? "bg-[var(--brand-violet)]/12 text-[var(--brand-violet)]" : "bg-secondary text-muted-foreground"}`}
                  >
                    {i.need}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{i.cost}</span>
                </div>
                <div className="text-xs text-muted-foreground">{i.how}</div>
                {i.key === "db" || i.key === "cronSecret" ? (
                  <div className="mt-1 text-xs text-muted-foreground">Managed securely by the site; no entry needed here.</div>
                ) : allowed && (
                  <div className="mt-2">
                    {editing !== i.key ? (
                      <Btn variant="ghost" onClick={() => { setEditing(i.key); setValues({}); setError(""); }} disabled={busy}>
                        <Plug className="h-3.5 w-3.5" /> {ok ? "Replace details" : "Add details"}
                      </Btn>
                    ) : (
                      <form className="space-y-3" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void submitCredentials(); }}>
                        {(integrationFields[i.key] ?? []).map((f) => (
                          <div key={f.name}>
                            <label htmlFor={`integration-${f.name}`} className="mb-1 block text-xs font-medium">{f.label}</label>
                            <input id={`integration-${f.name}`} type="password" autoComplete="new-password" required maxLength={4096} className={inputCls} value={values[f.name] ?? ""} disabled={busy} onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))} />
                          </div>
                        ))}
                        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
                        <div className="flex flex-wrap gap-2">
                          <Btn type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {busy ? "Saving…" : "Save securely"}</Btn>
                          <Btn variant="ghost" disabled={busy} onClick={() => { setEditing(null); setValues({}); setError(""); }}>Cancel</Btn>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}


/* ------------------------------------------------------------------- 2FA */
function TwoFactorPanel() {
  const [factors, setFactors] = useState<
    { id: string; friendly_name?: string; status: string }[] | null
  >(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as { id: string; friendly_name?: string; status: string }[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      // Clean up abandoned enrolments first
      for (const f of factors ?? [])
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      });
      if (error || !data) throw error ?? new Error("Could not start enrolment");
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!enroll || code.length < 6) return;
    setBusy(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
      if (error) throw error;
      toast.success(
        "Two-factor authentication is on. You'll be asked for a code at every sign-in.",
      );
      setEnroll(null);
      setCode("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disable(id: string) {
    if (!window.confirm("Turn off two-factor authentication for this account?")) return;
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error(error.message);
    else {
      toast.success("Two-factor authentication turned off.");
      await load();
    }
  }

  const active = (factors ?? []).filter((f) => f.status === "verified");
  return (
    <Panel>
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg font-bold">Two-factor authentication</h3>
          <p className="text-xs text-muted-foreground">
            Protects the mailboxes and lead data behind a code from your phone. Each team member
            sets up their own.
          </p>
        </div>
        {active.length > 0 ? (
          <span className="rounded-full bg-[oklch(.7_.18_150)]/15 px-2.5 py-1 text-xs font-semibold text-[oklch(.4_.12_150)]">
            On
          </span>
        ) : (
          <Btn onClick={() => void start()} disabled={busy || !!enroll}>
            Turn on
          </Btn>
        )}
      </div>
      {active.map((f) => (
        <div
          key={f.id}
          className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
        >
          <span>{f.friendly_name || "Authenticator app"}</span>
          <Btn variant="ghost" onClick={() => void disable(f.id)}>
            Turn off
          </Btn>
        </div>
      ))}
      {enroll && (
        <div className="mt-2 grid gap-4 sm:grid-cols-[160px_1fr]">
          <img
            src={enroll.qr}
            alt="QR code for your authenticator app"
            className="h-40 w-40 rounded-lg border border-border bg-white p-2"
          />
          <div className="space-y-2 text-sm">
            <p>Scan with Google Authenticator, 1Password or Authy, then enter the 6-digit code.</p>
            <p className="text-xs text-muted-foreground">
              Can't scan? Key: <code className="rounded bg-secondary px-1">{enroll.secret}</code>
            </p>
            <div className="flex gap-2">
              <input
                className={inputCls + " max-w-[160px] text-center tracking-[.3em]"}
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
              />
              <Btn onClick={() => void confirm()} disabled={busy || code.length < 6}>
                Confirm
              </Btn>
              <Btn variant="ghost" onClick={() => setEnroll(null)}>
                Cancel
              </Btn>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
