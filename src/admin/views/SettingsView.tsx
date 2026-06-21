import { useState } from "react";
import { Save, RotateCcw, KeyRound, Radar, Globe, Send, CheckCircle2, XCircle } from "lucide-react";
import { type AdminData, type GhlSendDetail, resetData, ghlSendEmail } from "../store";
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
  const [testTo, setTestTo] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; details: GhlSendDetail[] } | null>(null);

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

  async function sendTest() {
    if (!testTo.trim()) return;
    setTestBusy(true);
    setTestResult(null);
    const res = await ghlSendEmail({
      apiKey: s.ghlApiKey,
      locationId: s.ghlLocationId,
      to: [{ name: "Test", email: testTo.trim() }],
      subject: "Inspirova GHL test email ✅",
      body:
        "This is a test email sent from the Inspirova admin panel via your GoHighLevel integration.\n\nIf you received this in your inbox, your GHL setup is working end-to-end.",
      fromName: s.fromName,
      fromEmail: s.fromEmail,
    });
    setTestResult(res);
    setTestBusy(false);
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
          <Field label="API Key (optional — server already has one configured)"><input className={inputCls} value={s.ghlApiKey} onChange={(e) => setS({ ...s, ghlApiKey: e.target.value })} placeholder="pit-… (leave blank to use server key)" /></Field>
          <Field label="Location ID"><input className={inputCls} value={s.ghlLocationId} onChange={(e) => setS({ ...s, ghlLocationId: e.target.value })} placeholder="e.g. abc123…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From name"><input className={inputCls} value={s.fromName} onChange={(e) => setS({ ...s, fromName: e.target.value })} /></Field>
            <Field label="From email (must be verified inside GHL)"><input className={inputCls} value={s.fromEmail} onChange={(e) => setS({ ...s, fromEmail: e.target.value })} /></Field>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Btn onClick={save}><Save className="h-4 w-4" /> Save settings</Btn>
          {saved && <span className="text-sm text-[oklch(.55_.15_150)]">Saved ✓</span>}
        </div>

        <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Send className="h-4 w-4" /> Send a test email
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Sends one real email through GoHighLevel using the settings above. Use your own inbox to confirm it lands. If GHL rejects it, you'll see the exact reason here.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              className={inputCls}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@yourdomain.com"
            />
            <Btn onClick={sendTest} >
              {testBusy ? "Sending…" : <><Send className="h-4 w-4" /> Send test</>}
            </Btn>
          </div>
          {testResult && (
            <div className="mt-3 space-y-2">
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${testResult.ok ? "bg-[oklch(.7_.18_150)]/12 text-[oklch(.45_.15_150)]" : "bg-destructive/10 text-destructive"}`}>
                {testResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.message}
              </div>
              {testResult.details.map((d, i) => (
                <div key={i} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  <div className="font-semibold">{d.email}</div>
                  {d.ok ? (
                    <div className="text-[oklch(.55_.15_150)]">{d.simulated ? "Simulated (no server key)" : `Accepted by GHL (HTTP ${d.status ?? 200})`}</div>
                  ) : (
                    <div className="text-destructive">
                      {d.status ? `HTTP ${d.status} — ` : ""}{d.error || "Unknown error"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-4 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <strong>What GHL sends are these?</strong> Real transactional emails routed through your GoHighLevel sub-account — same engine as 1-to-1 emails from inside GHL, not bulk marketing blasts. Deliverability depends on your <strong>From email's domain being verified in GHL</strong> (Settings → Email Services → Dedicated Domain). You do <strong>not</strong> need to add DNS records on this site; GHL handles SPF/DKIM on their side.
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
          The map uses free OpenStreetMap geocoding (no key). Pulling records draws from your
          monthly <strong>export credits</strong> (≈2,000 on Professional); revealing emails uses
          email credits (unlimited under fair use); revealing phones uses <strong>mobile credits</strong>
          (≈100/mo on Professional), so use phones sparingly. EU contacts' personal emails may stay
          hidden under GDPR. Keep outreach to B2B legitimate-interest contacts with an easy opt-out.
        </p>
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[var(--brand-coral)] to-[var(--brand-violet)] text-white"><Globe className="h-4 w-4" /></div>
          <div>
            <h3 className="font-display text-lg font-bold">More sources (web search)</h3>
            <p className="text-xs text-muted-foreground">Widen email coverage beyond Apollo.</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reveal waterfalls across sources so you get the widest coverage: <strong>Apollo</strong> →
          <strong> Hunter.io</strong> → <strong>Google</strong>. Each extra source is optional — add
          its key as a Worker secret (same way you set the Apollo key) and redeploy.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="rounded-lg bg-secondary px-3 py-2.5">
            <strong>Hunter.io</strong> — searches the public web (78M+ domains) for emails at a
            company's domain. Secret:{" "}
            <code className="rounded bg-background px-1.5 py-0.5 text-xs">HUNTER_API_KEY</code>{" "}
            (free key at hunter.io → API).
          </li>
          <li className="rounded-lg bg-secondary px-3 py-2.5">
            <strong>Google</strong> — searches the whole web for a contact's email via{" "}
            <strong>SerpAPI</strong> (real Google results). Secret:{" "}
            <code className="rounded bg-background px-1.5 py-0.5 text-xs">SERPAPI_API_KEY</code>{" "}
            (get a key at serpapi.com).
          </li>
        </ul>
        <p className="mt-3 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Google results are public web snippets, so email matches are best-effort and should be
          verified before bulk outreach. Keep all outreach to B2B legitimate-interest contacts with
          an easy opt-out (GDPR).
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
