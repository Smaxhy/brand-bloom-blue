import { useState } from "react";
import { Save, RotateCcw, KeyRound, Radar } from "lucide-react";
import { type AdminData, resetData } from "../store";
import { Panel, Field, inputCls, Btn } from "../ui";

export function SettingsView({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const [s, setS] = useState(data.settings);
  const [saved, setSaved] = useState(false);

  function save() {
    update((p) => ({ ...p, settings: s }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function reset() {
    if (confirm("Reset all admin data back to the demo seed? This cannot be undone.")) {
      const fresh = resetData();
      update(() => fresh);
      setS(fresh.settings);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white"><KeyRound className="h-4 w-4" /></div>
          <div>
            <h3 className="font-display text-lg font-bold">GoHighLevel</h3>
            <p className="text-xs text-muted-foreground">Connect your GHL location to send live email campaigns.</p>
          </div>
        </div>
        <div className="space-y-3">
          <Field label="API Key (Private Integration token)"><input className={inputCls} value={s.ghlApiKey} onChange={(e) => setS({ ...s, ghlApiKey: e.target.value })} placeholder="pit-…" /></Field>
          <Field label="Location ID"><input className={inputCls} value={s.ghlLocationId} onChange={(e) => setS({ ...s, ghlLocationId: e.target.value })} placeholder="e.g. abc123…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From name"><input className={inputCls} value={s.fromName} onChange={(e) => setS({ ...s, fromName: e.target.value })} /></Field>
            <Field label="From email"><input className={inputCls} value={s.fromEmail} onChange={(e) => setS({ ...s, fromEmail: e.target.value })} /></Field>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Btn onClick={save}><Save className="h-4 w-4" /> Save settings</Btn>
          {saved && <span className="text-sm text-[var(--brand-violet)]">Saved ✓</span>}
        </div>
        <p className="mt-4 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          For security, GHL keys shouldn't sit in front-end code in production. The panel calls{" "}
          <code>/api/ghl/send</code> — deploy a small Cloudflare Worker route that forwards to
          GoHighLevel with your secret key, and live sending turns on automatically.
        </p>
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-violet)] to-[var(--brand-coral)] text-white"><Radar className="h-4 w-4" /></div>
          <div>
            <h3 className="font-display text-lg font-bold">Data Scraper (Apollo.io)</h3>
            <p className="text-xs text-muted-foreground">Pull decision-makers by location, with company, website, email & LinkedIn.</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The scraper calls Apollo through a same-origin proxy so your API key never touches the
          browser. To switch it from <strong>Demo</strong> to <strong>Live</strong>:
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Get a master API key in Apollo: <em>Settings → Integrations → API</em>.</li>
          <li>
            Set it as a Worker secret:{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">wrangler secret put APOLLO_API_KEY</code>
            {" "}— or add <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">APOLLO_API_KEY=…</code> to a{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">.dev.vars</code> file for local dev.
          </li>
          <li>Redeploy. The scraper detects the key and starts returning live results.</li>
        </ol>
        <p className="mt-3 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          The map uses free OpenStreetMap geocoding (no key). Emails that Apollo returns locked stay
          masked until you enrich them on your Apollo plan. Keep outreach GDPR-compliant: B2B
          legitimate-interest only, always include an easy opt-out.
        </p>
      </Panel>

      <Panel>
        <h3 className="font-display text-lg font-bold">Access</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Login is <code>InspirovaManagement</code> / <code>Kakapuma08</code>, defined in{" "}
          <code>src/admin/store.ts</code>. Change <code>ADMIN_USER</code> / <code>ADMIN_PASS</code> there. For real protection, move this behind server-side auth.
        </p>
      </Panel>

      <Panel>
        <h3 className="font-display text-lg font-bold">Data</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">All admin data is stored in your browser. Reset to the demo seed any time.</p>
        <Btn variant="danger" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset all data</Btn>
      </Panel>
    </div>
  );
}
