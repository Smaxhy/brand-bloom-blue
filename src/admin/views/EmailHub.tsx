import { useState } from "react";
import { Plus, Send, Pencil, Trash2, Mail, Users, FileText, CheckCircle2 } from "lucide-react";
import {
  type AdminData,
  type EmailTemplate,
  type GhlSendDetail,
  uid,
  ghlSendEmail,
  fillTemplate,
} from "../store";
import { Panel, StatCard, Modal, Field, inputCls, Btn } from "../ui";

const emptyTpl = (): EmailTemplate => ({ id: uid("tpl"), name: "", subject: "", body: "" });

export function EmailHub({
  data,
  update,
}: {
  data: AdminData;
  update: (fn: (p: AdminData) => AdminData) => void;
}) {
  const [tab, setTab] = useState<"campaign" | "templates" | "sent">("campaign");
  const [editTpl, setEditTpl] = useState<EmailTemplate | null>(null);

  // campaign builder state
  const accepted = data.raw.filter((r) => r.status === "accepted");
  const pending = accepted.filter((r) => !r.lastEmailedAt);
  const sentList = data.raw.filter((r) => r.lastEmailedAt);
  const [selected, setSelected] = useState<string[]>(pending.map((r) => r.id));
  const [tplId, setTplId] = useState(data.templates[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [result, setResult] = useState<{ ok: boolean; message: string; details: GhlSendDetail[] } | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{ ids: string[]; templateId: string; templateName: string } | null>(null);

  function markAttemptedAsSent() {
    if (!lastAttempt || lastAttempt.ids.length === 0) return;
    const sentAt = Date.now();
    update((p) => ({
      ...p,
      raw: p.raw.map((r) => (lastAttempt.ids.includes(r.id) ? { ...r, lastEmailedAt: sentAt } : r)),
      campaigns: [
        { id: uid("cmp"), name: lastAttempt.templateName, templateId: lastAttempt.templateId, recipientIds: lastAttempt.ids, status: "sent", sentAt, createdAt: sentAt },
        ...p.campaigns,
      ],
    }));
    setSelected((s) => s.filter((id) => !lastAttempt.ids.includes(id)));
    setLastAttempt(null);
  }

  const tpl = data.templates.find((t) => t.id === tplId);
  const recipients = pending.filter((r) => selected.includes(r.id));

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function send() {
    if (!tpl || recipients.length === 0) return;
    setSending(true);
    setResult(null);
    setLastAttempt({ ids: recipients.map((r) => r.id), templateId: tpl.id, templateName: tpl.name });
    setProgress({ done: 0, total: recipients.length });

    // Chunk client-side so we can show live progress and stay well under GHL's
    // per-second cap — the server also retries on 429, so this is belt-and-braces.
    const CHUNK = 5;
    const allDetails: GhlSendDetail[] = [];
    let anyOk = false;
    let lastMessage = "";
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const slice = recipients.slice(i, i + CHUNK);
      const res = await ghlSendEmail({
        apiKey: data.settings.ghlApiKey,
        companyId: data.settings.ghlCompanyId,
        locationId: data.settings.ghlLocationId,
        to: slice.map((r) => ({ name: r.business, email: r.email })),
        subject: tpl.subject,
        body: tpl.body,
        fromName: data.settings.fromName,
        fromEmail: data.settings.fromEmail,
      });
      allDetails.push(...res.details);
      if (res.ok) anyOk = true;
      lastMessage = res.message;
      setProgress({ done: Math.min(i + slice.length, recipients.length), total: recipients.length });
    }

    const rateLimited = allDetails.filter((d) => !d.ok && d.status === 429).length;
    const sentCount = allDetails.filter((d) => d.ok).length;
    const message =
      rateLimited > 0
        ? `GoHighLevel rate limit hit — delivered ${sentCount}/${allDetails.length}. Wait a minute and re-send the rest.`
        : sentCount === allDetails.length && allDetails.length > 0
          ? `Delivered to all ${sentCount} recipient(s) via GoHighLevel.`
          : lastMessage || `Delivered ${sentCount}/${allDetails.length} — see details below.`;
    const res = { ok: anyOk, message, details: allDetails };
    setResult(res);
    const okEmails = new Set(
      res.details.length
        ? res.details.filter((d) => d.ok).map((d) => d.email.toLowerCase())
        : res.ok
          ? recipients.map((r) => r.email.toLowerCase())
          : [],
    );

    const sentIds = recipients.filter((r) => okEmails.has(r.email.toLowerCase())).map((r) => r.id);
    if (sentIds.length > 0) {
      const sentAt = Date.now();
      update((p) => ({
        ...p,
        raw: p.raw.map((r) => (sentIds.includes(r.id) ? { ...r, lastEmailedAt: sentAt } : r)),
        campaigns: [
          { id: uid("cmp"), name: tpl.name, templateId: tpl.id, recipientIds: sentIds, status: "sent", sentAt, createdAt: sentAt },
          ...p.campaigns,
        ],
      }));
      setSelected((s) => s.filter((id) => !sentIds.includes(id)));
    }
    setSending(false);
    setProgress(null);

  }


  function saveTpl(t: EmailTemplate) {
    update((p) => {
      const exists = p.templates.some((x) => x.id === t.id);
      return { ...p, templates: exists ? p.templates.map((x) => (x.id === t.id ? t : x)) : [...p.templates, t] };
    });
    setEditTpl(null);
  }
  function removeTpl(id: string) {
    update((p) => ({ ...p, templates: p.templates.filter((t) => t.id !== id) }));
  }

  const previewVars = recipients[0]
    ? { business: recipients[0].business, contact: recipients[0].business, city: recipients[0].city, industry: recipients[0].industry }
    : { business: "Acme", contact: "there", city: "Gent", industry: "Real Estate" };

  const liveMode = !!(data.settings.ghlApiKey && data.settings.ghlLocationId);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Accepted Recipients" value={String(accepted.length)} hint="From Raw Data" icon={Users} accent="var(--brand-violet)" />
        <StatCard label="Templates" value={String(data.templates.length)} icon={FileText} accent="var(--brand-coral)" />
        <StatCard label="Campaigns Sent" value={String(data.campaigns.length)} icon={Send} accent="oklch(.7 .18 150)" />
      </div>

      <div
        className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"
        style={{
          borderColor: liveMode ? "color-mix(in oklab, oklch(.7 .18 150) 40%, transparent)" : "var(--border)",
          background: liveMode ? "color-mix(in oklab, oklch(.7 .18 150) 8%, transparent)" : "var(--secondary)",
        }}
      >
        <CheckCircle2 className="h-4 w-4" style={{ color: liveMode ? "oklch(.55 .15 150)" : "var(--muted-foreground)" }} />
        {liveMode
          ? "GoHighLevel is connected. Campaigns send through your GHL location."
          : "Demo mode — add your GoHighLevel API key in Settings to send live emails. Until then, sends are simulated."}
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {(["campaign", "templates", "sent"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
            {t === "campaign" ? "New campaign" : t === "templates" ? "Templates" : `Sent (${sentList.length})`}
          </button>
        ))}
      </div>

      {tab === "campaign" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <h3 className="mb-3 font-display text-lg font-bold">Recipients</h3>
            <p className="mb-2 text-xs text-muted-foreground">Already-emailed contacts are hidden — see the Sent tab.</p>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {accepted.length === 0
                  ? "No accepted leads yet. Accept some businesses in the Raw Data tab first."
                  : "Every accepted lead has already received an email. Accept more leads to keep sending."}
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {pending.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-secondary/50">
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 cursor-pointer accent-[var(--brand-violet)]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{r.business}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelected((s) => s.filter((x) => x !== r.id));
                        update((p) => ({ ...p, raw: p.raw.map((x) => (x.id === r.id ? { ...x, lastEmailedAt: Date.now() } : x)) }));
                      }}
                      className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                      title="Move to Sent tab"
                    >
                      Move to sent
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm(`Delete ${r.business}?`)) return;
                        setSelected((s) => s.filter((x) => x !== r.id));
                        update((p) => ({ ...p, raw: p.raw.filter((x) => x.id !== r.id) }));
                      }}
                      className="grid h-7 w-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
                      title="Delete contact"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 text-xs text-muted-foreground">{recipients.length} selected</div>
          </Panel>


          <Panel className="flex flex-col">
            <h3 className="mb-3 font-display text-lg font-bold">Message</h3>
            <Field label="Template">
              <select className={inputCls} value={tplId} onChange={(e) => setTplId(e.target.value)}>
                {data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>

            {tpl && (
              <div className="mt-4 flex-1 rounded-xl border border-border bg-secondary/40 p-4">
                <div className="text-[.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Preview</div>
                <div className="mt-1 text-sm font-bold">{fillTemplate(tpl.subject, previewVars)}</div>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{fillTemplate(tpl.body, previewVars)}</pre>
              </div>
            )}

            {result && (
              <div className="mt-3 space-y-2">
                <div className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-[oklch(.7_.18_150)]/12 text-[oklch(.45_.15_150)]" : "bg-destructive/10 text-destructive"}`}>
                  {result.message}
                </div>
                {result.details.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
                    {result.details.map((d, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 text-xs">
                        <span className="truncate font-mono">{d.email}</span>
                        {d.ok ? (
                          <span className="shrink-0 text-[oklch(.55_.15_150)]">✓ {d.simulated ? "simulated" : "sent"}</span>
                        ) : (
                          <span className="shrink-0 text-destructive truncate max-w-[60%]" title={d.error}>
                            ✗ {d.status ? `HTTP ${d.status}` : ""} {d.error?.slice(0, 80)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {lastAttempt && lastAttempt.ids.length > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      Email arrived but not marked sent? Move all {lastAttempt.ids.length} attempted recipient(s) into the Sent tab.
                    </span>
                    <button
                      type="button"
                      onClick={markAttemptedAsSent}
                      className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      Move to Sent
                    </button>
                  </div>
                )}
              </div>
            )}

            <Btn className="mt-4 w-full" onClick={send} >
              {sending
                ? progress
                  ? `Sending ${progress.done} / ${progress.total}…`
                  : "Sending…"
                : <><Send className="h-4 w-4" /> {liveMode ? "Send via GoHighLevel" : "Simulate send"} ({recipients.length})</>}

            </Btn>
          </Panel>
        </div>
      )}

      {tab === "templates" && (
        <div className="space-y-4">
          <Btn onClick={() => setEditTpl(emptyTpl())}><Plus className="h-4 w-4" /> New template</Btn>
          <div className="grid gap-4 md:grid-cols-2">
            {data.templates.map((t) => (
              <Panel key={t.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary"><Mail className="h-4 w-4" /></div>
                    <div>
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.subject}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditTpl(t)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => removeTpl(t.id)} className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <pre className="mt-3 max-h-32 overflow-hidden whitespace-pre-wrap font-sans text-xs text-muted-foreground">{t.body}</pre>
              </Panel>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Use <code>{"{{business}}"}</code>, <code>{"{{contact}}"}</code>, <code>{"{{city}}"}</code> and <code>{"{{industry}}"}</code> — they're filled per recipient when sending.
          </p>
        </div>
      )}

      {tab === "sent" && (
        <div className="space-y-5">
          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold">Mark accepted as already sent</h3>
                <p className="text-xs text-muted-foreground">Move accepted clients you've already contacted into the sent list.</p>
              </div>
              {pending.length > 0 && (
                <Btn
                  variant="ghost"
                  onClick={() => {
                    const sentAt = Date.now();
                    const ids = pending.map((r) => r.id);
                    update((p) => ({
                      ...p,
                      raw: p.raw.map((r) => (ids.includes(r.id) ? { ...r, lastEmailedAt: sentAt } : r)),
                    }));
                  }}
                >
                  Mark all ({pending.length})
                </Btn>
              )}
            </div>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accepted clients left to mark — all caught up.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {pending.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{r.business}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                    </div>
                    <Btn
                      variant="ghost"
                      onClick={() =>
                        update((p) => ({
                          ...p,
                          raw: p.raw.map((x) => (x.id === r.id ? { ...x, lastEmailedAt: Date.now() } : x)),
                        }))
                      }
                    >
                      <Plus className="h-4 w-4" /> Add to sent
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="p-0 overflow-x-auto">
            {sentList.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No emails sent yet. Send your first campaign from the New campaign tab.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Business</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="hidden px-4 py-3 font-semibold md:table-cell">City</th>
                    <th className="px-4 py-3 font-semibold">Sent</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sentList
                    .slice()
                    .sort((a, b) => (b.lastEmailedAt ?? 0) - (a.lastEmailedAt ?? 0))
                    .map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-semibold">{r.business}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{r.city}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(r.lastEmailedAt!).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() =>
                                update((p) => ({
                                  ...p,
                                  raw: p.raw.map((x) => (x.id === r.id ? { ...x, lastEmailedAt: undefined } : x)),
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                              title="Move back to recipients"
                            >
                              Move back
                            </button>
                            <button
                              onClick={() => {
                                if (!confirm(`Delete ${r.business}?`)) return;
                                update((p) => ({ ...p, raw: p.raw.filter((x) => x.id !== r.id) }));
                              }}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                              title="Delete contact"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}


      <Modal open={!!editTpl} onClose={() => setEditTpl(null)} title="Email template" wide>
        {editTpl && (
          <div className="space-y-3">
            <Field label="Name"><input className={inputCls} value={editTpl.name} onChange={(e) => setEditTpl({ ...editTpl, name: e.target.value })} /></Field>
            <Field label="Subject"><input className={inputCls} value={editTpl.subject} onChange={(e) => setEditTpl({ ...editTpl, subject: e.target.value })} /></Field>
            <Field label="Body"><textarea className={`${inputCls} min-h-[180px] font-mono text-xs`} value={editTpl.body} onChange={(e) => setEditTpl({ ...editTpl, body: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setEditTpl(null)}>Cancel</Btn>
              <Btn onClick={() => saveTpl(editTpl)}>Save template</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
