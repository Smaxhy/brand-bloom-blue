import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getSendingStatus } from "@/lib/sending-status.functions";
type SendingStatus = Awaited<ReturnType<typeof getSendingStatus>>;
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Pencil,
  Mail,
  Inbox,
  Ban,
  RefreshCw,
  Users,
  Send,
  Reply,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
  Sparkles,
  Check,
  BriefcaseBusiness,
  ExternalLink,
  FlaskConical,
  Download,
  UserPlus,
  Wand2,
  Search,
} from "lucide-react";
import { type AdminData, type Deal, type RawBusiness, uid } from "../store";
import { csvCell } from "../outreach-people-utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Panel, StatCard, Modal, Field, inputCls, Btn } from "../ui";
import {
  type Mailbox,
  type Sequence,
  type SequenceStep,
  type Enrollment,
  type Message,
  type Suppression,
  listMailboxes,
  listSequences,
  listSteps,
  saveSequence,
  setSequenceStatus,
  deleteSequence,
  listEnrollments,
  enrollmentCounts,
  updateEnrollment,
  deleteEnrollment,
  listMessages,
  stepCounts,
  sentCounts,
  listSuppressions,
  addSuppression,
  removeSuppression,
  runDispatchNow,
  sendReply,
  markHandled,
  abStats,
  sequenceCounts,
  aiWriteStep,
  enrollLeads,
  sendNow,
  type DispatchSummary,
  type ReplyIntent,
} from "../outreach";

/** One toast that explains a dispatch report: what went out, what was held back and why. */
function toastDispatch(rep: DispatchSummary | undefined, prefix = "") {
  const sent = rep?.mailboxes?.reduce((a, m) => a + m.sent, 0) ?? 0;
  const blocked = rep?.mailboxes?.reduce((a, m) => a + (m.bounce_blocked ?? 0), 0) ?? 0;
  const skips = (rep?.mailboxes ?? [])
    .filter((m) => m.skipped)
    .map((m) => `${m.email}: ${m.skipped}`);
  const errs = (rep?.errors ?? []).filter((e) => !/^ran saved searches/.test(e));
  const parts = [
    `${prefix}Sent ${sent}`,
    blocked ? `${blocked} held back by the bounce check` : "",
    ...skips,
    ...errs.slice(0, 2),
  ].filter(Boolean);
  if (sent > 0) toast.success(parts.join(" · "), { duration: 8000 });
  else toast.warning(parts.join(" · "), { duration: 10000 });
}

type Tab = "overview" | "sequences" | "queue" | "inbox" | "suppressed";

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-secondary text-muted-foreground",
  active: "bg-[var(--brand-violet)]/12 text-[var(--brand-violet)]",
  completed: "bg-[oklch(.7_.18_150)]/15 text-[oklch(.4_.12_150)]",
  replied: "bg-[oklch(.7_.18_150)]/25 text-[oklch(.35_.12_150)]",
  bounced: "bg-destructive/10 text-destructive",
  unsubscribed: "bg-destructive/10 text-destructive",
  paused: "bg-[oklch(.8_.16_80)]/25 text-[oklch(.45_.1_70)]",
  failed: "bg-destructive/10 text-destructive",
  skipped: "bg-secondary text-muted-foreground",
};

function Pill({ s }: { s: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[.65rem] font-semibold uppercase tracking-wide ${STATUS_STYLE[s] ?? "bg-secondary"}`}
    >
      {s}
    </span>
  );
}

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export function Outreach({
  go,
  data,
  update,
}: {
  go?: (v: "settings" | "raw" | "pipeline") => void;
  data?: AdminData;
  update?: (fn: (prev: AdminData) => AdminData) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [seqCounts, setSeqCounts] = useState<Record<string, Record<string, number>>>({});
  const [queueSeq, setQueueSeq] = useState<string>("");
  const [series, setSeries] = useState<{ day: string; sent: number; replies: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [m, s, c, d, sc] = await Promise.all([
        listMailboxes(),
        listSequences(),
        enrollmentCounts(),
        sentCounts(14),
        sequenceCounts().catch(() => ({}) as Record<string, Record<string, number>>),
      ]);
      setMailboxes(m);
      setSequences(s);
      setCounts(c);
      setSeries(d);
      setSeqCounts(sc);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runNow(syncOnly = false) {
    setBusy(true);
    const r = await runDispatchNow(syncOnly);
    setBusy(false);
    if (!r.ok) return toast.error(r.error || "Dispatch failed");
    const rep = r.report as DispatchSummary | undefined;
    const replies =
      (rep?.mailboxes as { synced?: { replies: number } }[] | undefined)?.reduce(
        (a, m) => a + (m.synced?.replies ?? 0),
        0,
      ) ?? 0;
    if (syncOnly)
      toast.success(`Inbox sync done · ${replies} new repl${replies === 1 ? "y" : "ies"}`);
    else toastDispatch(rep);
  }

  const sentTotal = series.reduce((a, d) => a + d.sent, 0);
  const replyTotal = series.reduce((a, d) => a + d.replies, 0);
  const activeMailboxes = mailboxes.filter((m) => m.status === "active");
  const capToday = activeMailboxes.reduce((a, m) => a + m.daily_cap, 0);

  if (err && /relation .* does not exist|schema cache/i.test(err)) {
    return (
      <Panel>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-[oklch(.6_.16_60)]" />
          <div>
            <h3 className="font-display text-lg font-bold">Database tables not created yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Run the migration{" "}
              <code className="rounded bg-secondary px-1">
                supabase/migrations/20261102120000_outreach_engine.sql
              </code>{" "}
              (Lovable applies migrations on publish, or run it in the Supabase SQL editor). Then
              reload this page.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{err}</p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="In sequences"
          value={String((counts.queued ?? 0) + (counts.active ?? 0))}
          hint={`${counts.total ?? 0} enrolled all-time`}
          icon={Users}
        />
        <StatCard
          label="Sent · 14 days"
          value={String(sentTotal)}
          hint={`Capacity ${capToday}/day across ${activeMailboxes.length} mailbox${activeMailboxes.length === 1 ? "" : "es"}`}
          icon={Send}
          accent="var(--brand-coral)"
        />
        <StatCard
          label="Replies · 14 days"
          value={String(replyTotal)}
          hint={sentTotal ? `${((replyTotal / sentTotal) * 100).toFixed(1)}% reply rate` : "—"}
          icon={Reply}
          accent="oklch(.55 .15 150)"
        />
        <StatCard
          label="Bounced / opted out"
          value={String((counts.bounced ?? 0) + (counts.unsubscribed ?? 0))}
          hint="Automatically suppressed"
          icon={Ban}
          accent="oklch(.55 .2 25)"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-border bg-background p-1">
          {(
            [
              ["overview", "Overview", Clock],
              ["sequences", "Sequences", Mail],
              ["queue", "People", Users],
              ["inbox", "Replies", Inbox],
              ["suppressed", "Suppressed", Ban],
            ] as [Tab, string, React.ElementType][]
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Btn variant="ghost" onClick={() => void runNow(true)} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}{" "}
            Check inboxes
          </Btn>
          <Btn onClick={() => void runNow(false)} disabled={busy}>
            <Play className="h-4 w-4" /> Send due emails now
          </Btn>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {tab === "overview" && (
        <Overview
          mailboxes={mailboxes}
          sequences={sequences}
          series={series}
          counts={counts}
          go={go}
          setTab={setTab}
        />
      )}
      {tab === "sequences" && (
        <Sequences
          sequences={sequences}
          mailboxes={mailboxes}
          refresh={refresh}
          counts={seqCounts}
          data={data}
          update={update}
          showPeople={(id) => {
            setQueueSeq(id);
            setTab("queue");
          }}
          go={go}
        />
      )}
      {tab === "queue" && <Queue sequences={sequences} refresh={refresh} initialSeqId={queueSeq} />}
      {tab === "inbox" && <InboxView data={data} update={update} go={go} />}
      {tab === "suppressed" && <Suppressed />}
    </div>
  );
}

/* ------------------------------------------------------------ overview */
function Overview({
  mailboxes,
  sequences,
  series,
  counts,
  go,
  setTab,
}: {
  mailboxes: Mailbox[];
  sequences: Sequence[];
  series: { day: string; sent: number; replies: number }[];
  counts: Record<string, number>;
  go?: (v: "settings" | "raw") => void;
  setTab: (t: Tab) => void;
}) {
  const max = Math.max(1, ...series.map((d) => d.sent));
  const noMailbox = mailboxes.length === 0;
  const noSequence = sequences.length === 0;
  const nothingQueued = !(counts.queued || counts.active);
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="lg:col-span-2"><SendingStatusPanel /></div>
      <Panel>
        <h3 className="font-display text-lg font-bold">Sent per day</h3>
        <p className="text-xs text-muted-foreground">
          Last 14 days · bars are emails sent, dots are replies
        </p>
        <div className="mt-4 flex h-40 items-end gap-1.5">
          {series.map((d) => (
            <div
              key={d.day}
              className="group relative flex flex-1 flex-col items-center justify-end"
              title={`${d.day}: ${d.sent} sent, ${d.replies} replies`}
            >
              {d.replies > 0 && (
                <span className="mb-1 h-2 w-2 rounded-full bg-[oklch(.55_.15_150)]" />
              )}
              <div
                className="w-full rounded-t-md bg-[var(--brand-violet)]/80 transition-all group-hover:bg-[var(--brand-violet)]"
                style={{ height: `${Math.max(3, (d.sent / max) * 100)}%` }}
              />
              <span className="mt-1 text-[.55rem] text-muted-foreground">{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <h3 className="font-display text-lg font-bold">Getting started</h3>
        <ol className="mt-3 space-y-2 text-sm">
          <Step
            done={!noMailbox}
            label="Connect a Google Workspace mailbox"
            sub="Settings → Mailboxes"
            onClick={() => go?.("settings")}
          />
          <Step
            done={!noSequence}
            label="Write a sequence (first email + follow-ups)"
            sub="Sequences tab"
            onClick={() => setTab("sequences")}
          />
          <Step
            done={!nothingQueued}
            label="Add people to the sequence"
            sub="Sequences tab → Add people (picks from your scraped businesses)"
            onClick={() => setTab("sequences")}
          />
          <Step
            done={
              (counts.total ?? 0) > 0 &&
              !nothingQueued &&
              sequences.some((s) => s.status === "active")
            }
            label="Set the sequence to Active"
            sub="Emails then go out every 10 minutes within each mailbox's hours and daily cap"
            onClick={() => setTab("sequences")}
          />
        </ol>
        <div className="mt-4 space-y-2">
          {mailboxes.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{m.email}</div>
                <div className="text-xs text-muted-foreground">
                  {m.daily_cap}/day · {m.window_start}:00–{m.window_end}:00{" "}
                  {m.timezone.split("/")[1]?.replace("_", " ")} ·{" "}
                  {m.last_sync_at ? `synced ${fmt(m.last_sync_at)}` : "not synced yet"}
                </div>
                {m.last_error && (
                  <div className="mt-0.5 truncate text-xs text-destructive">{m.last_error}</div>
                )}
              </div>
              <Pill s={m.status} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Step({
  done,
  label,
  sub,
  onClick,
}: {
  done: boolean;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-secondary"
      >
        {done ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(.55_.15_150)]" />
        ) : (
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-border" />
        )}
        <span className="min-w-0">
          <span className={`block ${done ? "text-muted-foreground line-through" : "font-medium"}`}>
            {label}
          </span>
          <span className="block text-xs text-muted-foreground">{sub}</span>
        </span>
        <ChevronRight className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/* ----------------------------------------------------------- sequences */
const SAMPLE_STEPS: SequenceStep[] = [
  {
    position: 0,
    delay_days: 0,
    subject: "{{company}} — quick idea",
    body: "Hi {{first_name|there}},\n\nI came across {{company}} while looking at {{industry|local}} businesses in {{city}}. {{pitch|I had a couple of ideas for getting you more jobs this season without raising your ad spend.}}\n\nWorth a 10-minute call this week?",
  },
  {
    position: 1,
    delay_days: 3,
    subject: "",
    body: "Hi {{first_name}}, bumping this up in case it got buried. Happy to send the two ideas over in writing if that's easier.",
  },
  {
    position: 2,
    delay_days: 5,
    subject: "",
    body: "Last note from me, {{first_name}} — if growing {{company}} isn't a priority right now, no problem at all. If it is, I'm one reply away.",
  },
];

function AbStrip({ sequenceId }: { sequenceId: string }) {
  const [st, setSt] = useState<Record<"A" | "B", { sent: number; replied: number }> | null>(null);
  useEffect(() => {
    abStats(sequenceId)
      .then(setSt)
      .catch(() => setSt(null));
  }, [sequenceId]);
  if (!st || st.A.sent + st.B.sent === 0) return null;
  const pct = (v: { sent: number; replied: number }) =>
    v.sent ? `${Math.round((v.replied / v.sent) * 100)}%` : "—";
  const lead =
    st.A.sent && st.B.sent
      ? st.A.replied / st.A.sent >= st.B.replied / st.B.sent
        ? "A"
        : "B"
      : null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[.7rem]">
      <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
      {(["A", "B"] as const).map((v) => (
        <span
          key={v}
          className={`rounded-full px-2 py-0.5 font-semibold tabular-nums ${lead === v ? "bg-[oklch(.7_.18_150)]/15 text-[oklch(.4_.12_150)]" : "bg-secondary text-muted-foreground"}`}
          title={`Subject ${v}: ${st[v].replied} replies from ${st[v].sent} sent`}
        >
          {v} · {pct(st[v])} reply · {st[v].sent} sent
        </span>
      ))}
    </div>
  );
}

function Sequences({
  sequences,
  mailboxes,
  refresh,
  counts,
  data,
  update,
  showPeople,
  go,
}: {
  sequences: Sequence[];
  mailboxes: Mailbox[];
  refresh: () => Promise<void>;
  counts: Record<string, Record<string, number>>;
  data?: AdminData;
  update?: (fn: (prev: AdminData) => AdminData) => void;
  showPeople: (sequenceId: string) => void;
  go?: (v: "settings" | "raw" | "pipeline") => void;
}) {
  const [editing, setEditing] = useState<{ seq: Partial<Sequence>; steps: SequenceStep[] } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<Sequence | null>(null);
  const [deleting, setDeleting] = useState<Sequence | null>(null);
  // "Write with AI"
  const [audience, setAudience] = useState("");
  const [extra, setExtra] = useState("");
  const [writing, setWriting] = useState<number | null>(null);

  async function writeWithAi(i: number) {
    if (!editing) return;
    setWriting(i);
    try {
      const st = await aiWriteStep({
        sequenceName: editing.seq.name || "Outreach",
        audience: audience || undefined,
        index: i,
        previous: editing.steps.slice(0, i).map((x) => ({ subject: x.subject, body: x.body })),
        current: editing.steps[i]?.body?.trim() ? editing.steps[i] : undefined,
        extra: extra || undefined,
      });
      setEditing((ed) =>
        ed
          ? {
              ...ed,
              steps: ed.steps.map((x, j) =>
                j === i
                  ? {
                      ...x,
                      subject: i === 0 ? st.subject : st.subject || "",
                      subject_b: i === 0 ? st.subject_b || x.subject_b : x.subject_b,
                      body: st.body,
                    }
                  : x,
              ),
            }
          : ed,
      );
      toast.success(
        i === 0 ? "First email written — edit anything you like" : `Follow-up ${i} written`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWriting(null);
    }
  }

  async function openEdit(seq?: Sequence) {
    if (!seq)
      return setEditing({
        seq: {
          name: "",
          status: "draft",
          mailbox_ids: mailboxes.filter((m) => m.status === "active").map((m) => m.id),
          stop_on_reply: true,
          gap_min_sec: 45,
          gap_max_sec: 180,
          send_anytime: true,
        },
        steps: SAMPLE_STEPS.map((s) => ({ ...s })),
      });
    const steps = await listSteps(seq.id);
    setEditing({
      seq,
      steps: steps.length ? steps : [{ position: 0, delay_days: 0, subject: "", body: "" }],
    });
  }
  async function save() {
    if (!editing) return;
    if (!editing.seq.name?.trim()) return toast.error("Give the sequence a name.");
    if (!editing.steps.length || !editing.steps[0].body.trim())
      return toast.error("The first email needs a body.");
    if (!editing.steps[0].subject.trim()) return toast.error("The first email needs a subject.");
    setSaving(true);
    try {
      await saveSequence(editing.seq, editing.steps);
      toast.success("Sequence saved");
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function toggle(seq: Sequence) {
    if (seq.status !== "active" && !seq.mailbox_ids.length)
      return toast.error("Pick at least one mailbox first.");
    const starting = seq.status !== "active";
    await setSequenceStatus(seq.id, starting ? "active" : "paused");
    await refresh();
    if (starting) {
      // Pressing play sends the first batch right now; the scheduler takes it from there.
      toast.message("Sequence started — sending the first batch…");
      const r = await sendNow({ sequenceId: seq.id });
      if (r.ok) toastDispatch(r.report, `"${seq.name}": `);
      else toast.error(r.error || "Could not send");
      await refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          A sequence is the first email plus timed follow-ups. Follow-ups with no subject are sent
          as replies in the same thread, which is what gets read.
        </p>
        <Btn onClick={() => void openEdit()}>
          <Plus className="h-4 w-4" /> New sequence
        </Btn>
      </div>
      {!sequences.length && (
        <Panel className="text-center text-sm text-muted-foreground">
          No sequences yet. Start with the sample 3-step sequence and edit the copy.
        </Panel>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {sequences.map((s) => (
          <Panel key={s.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-display text-base font-bold">{s.name}</h3>
                  <Pill s={s.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.mailbox_ids.length} mailbox{s.mailbox_ids.length === 1 ? "" : "es"} ·{" "}
                  {s.stop_on_reply ? "stops on reply" : "continues after reply"} · {s.gap_min_sec}–
                  {s.gap_max_sec}s between sends ·{" "}
                  {s.send_anytime ? "sends any time" : "business hours only"}
                </p>
                <AbStrip sequenceId={s.id} />
                <SeqPeople c={counts[s.id]} onClick={() => showPeople(s.id)} />
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  aria-label="Add people"
                  title="Add people from your scraped businesses"
                  onClick={() => setAdding(s)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-secondary"
                >
                  <UserPlus className="h-4 w-4" /> Add people
                </button>
                <button
                  aria-label="Edit sequence"
                  onClick={() => void openEdit(s)}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-secondary"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  aria-label="Delete sequence"
                  title="Delete this sequence"
                  onClick={() => setDeleting(s)}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  aria-label={s.status === "active" ? "Pause sequence" : "Activate sequence"}
                  onClick={() => void toggle(s)}
                  className={`grid h-9 w-9 place-items-center rounded-lg border ${s.status === "active" ? "border-border hover:bg-secondary" : "border-transparent bg-primary text-primary-foreground"}`}
                >
                  {s.status === "active" ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.seq.id ? "Edit sequence" : "New sequence"}
        wide
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Name">
              <input
                className={inputCls}
                value={editing.seq.name ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, seq: { ...editing.seq, name: e.target.value } })
                }
                placeholder="Roofers · Denver · Nov"
              />
            </Field>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Send from (round-robin)
              </span>
              <div className="flex flex-wrap gap-2">
                {mailboxes.map((m) => {
                  const on = editing.seq.mailbox_ids?.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          seq: {
                            ...editing.seq,
                            mailbox_ids: on
                              ? editing.seq.mailbox_ids!.filter((x) => x !== m.id)
                              : [...(editing.seq.mailbox_ids ?? []), m.id],
                          },
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? "border-transparent bg-[var(--brand-violet)] text-white" : "border-border text-muted-foreground"}`}
                    >
                      {m.email}
                    </button>
                  );
                })}
                {!mailboxes.length && (
                  <span className="text-xs text-muted-foreground">
                    No mailboxes connected yet (Settings → Mailboxes).
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Gap between sends (s)">
                <input
                  type="number"
                  className={inputCls}
                  value={editing.seq.gap_min_sec ?? 45}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      seq: { ...editing.seq, gap_min_sec: Number(e.target.value) },
                    })
                  }
                />
              </Field>
              <Field label="to (s)">
                <input
                  type="number"
                  className={inputCls}
                  value={editing.seq.gap_max_sec ?? 180}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      seq: { ...editing.seq, gap_max_sec: Number(e.target.value) },
                    })
                  }
                />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.seq.stop_on_reply ?? true}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      seq: { ...editing.seq, stop_on_reply: e.target.checked },
                    })
                  }
                  className="accent-[var(--brand-violet)]"
                />{" "}
                Stop when they reply
              </label>
            </div>
            <label className="flex items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={editing.seq.send_anytime ?? true}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    seq: { ...editing.seq, send_anytime: e.target.checked },
                  })
                }
                className="mt-0.5 accent-[var(--brand-violet)]"
              />
              <span>
                <b>Send any time.</b>{" "}
                <span className="text-muted-foreground">
                  Ignore the mailbox's sending hours and days. Pressing ▶ or adding people sends the
                  first batch immediately; follow-ups go out exactly N days later. Untick to keep
                  sends inside business hours (slightly better open rates).
                </span>
              </span>
            </label>

            <div className="rounded-xl border border-dashed border-[var(--brand-violet)]/40 bg-[var(--brand-violet)]/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Wand2 className="h-4 w-4 text-[var(--brand-violet)]" /> Write with AI
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className={inputCls}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Who is this for? e.g. roofers in Denver who have no online booking"
                />
                <input
                  className={inputCls}
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder="Any direction for this one? e.g. shorter, mention the snow season"
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Press <b>Write</b> on any email below. It follows your{" "}
                <button type="button" className="underline" onClick={() => go?.("settings")}>
                  AI instructions
                </button>{" "}
                (Settings) and rewrites what's already in the box if there is something.
              </p>
            </div>

            <div className="space-y-3">
              {editing.steps.map((st, i) => (
                <div key={i} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      {i === 0 ? "Email 1" : `Follow-up ${i}`}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void writeWithAi(i)}
                        disabled={writing !== null}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--brand-violet)] px-2.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {writing === i ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5" />
                        )}
                        {writing === i ? "Writing…" : st.body?.trim() ? "Rewrite" : "Write"}
                      </button>
                      {i > 0 && (
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          after{" "}
                          <input
                            type="number"
                            min={1}
                            className={inputCls + " w-16 py-1"}
                            value={st.delay_days}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                steps: editing.steps.map((x, j) =>
                                  j === i ? { ...x, delay_days: Number(e.target.value) } : x,
                                ),
                              })
                            }
                          />{" "}
                          days
                        </label>
                      )}
                      {i > 0 && (
                        <button
                          aria-label="Remove step"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              steps: editing.steps.filter((_, j) => j !== i),
                            })
                          }
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    className={inputCls + " mb-2"}
                    value={st.subject}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        steps: editing.steps.map((x, j) =>
                          j === i ? { ...x, subject: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder={
                      i === 0 ? "Subject A" : "Subject (leave blank to reply in the same thread)"
                    }
                  />
                  {i === 0 && (
                    <div className="mb-2 flex items-center gap-2">
                      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <input
                        className={inputCls}
                        value={st.subject_b ?? ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            steps: editing.steps.map((x, j) =>
                              j === i ? { ...x, subject_b: e.target.value } : x,
                            ),
                          })
                        }
                        placeholder="Subject B (optional) — half the leads get this one; reply rates show per variant"
                      />
                    </div>
                  )}
                  <textarea
                    className={inputCls + " min-h-[110px]"}
                    value={st.body}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        steps: editing.steps.map((x, j) =>
                          j === i ? { ...x, body: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <Btn
                variant="ghost"
                onClick={() =>
                  setEditing({
                    ...editing,
                    steps: [
                      ...editing.steps,
                      { position: editing.steps.length, delay_days: 3, subject: "", body: "" },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4" /> Add follow-up
              </Btn>
            </div>
            <p className="text-xs text-muted-foreground">
              Variables: <code>{"{{first_name}}"}</code> <code>{"{{company}}"}</code>{" "}
              <code>{"{{city}}"}</code> <code>{"{{industry}}"}</code> <code>{"{{website}}"}</code>{" "}
              <code>{"{{sender_name}}"}</code> <code>{"{{pitch}}"}</code> <code>{"{{gap}}"}</code>.
              Fallbacks: <code>{"{{first_name|there}}"}</code>. <code>{"{{pitch}}"}</code> is the
              one-line angle the AI wrote for that business when it was scanned;{" "}
              <code>{"{{gap}}"}</code> its biggest gap (e.g. "no online booking"). The legal footer
              and unsubscribe link are added automatically.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Btn>
              <Btn onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save sequence"}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Delete "${deleting.name}"?` : "Delete sequence?"}
        description={`${
          counts[deleting?.id ?? ""]?.total
            ? `${counts[deleting!.id].total} people are in it — they will get no further emails, and their send history for this sequence is removed. `
            : ""
        }Suppressions (opt-outs, bounces) are kept. This cannot be undone.`}
        confirmLabel="Delete sequence"
        destructive
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          void deleteSequence(target.id)
            .then(async () => {
              toast.success(`"${target.name}" deleted`);
              await refresh();
            })
            .catch((e) => toast.error((e as Error).message));
        }}
      />

      <AddPeople
        seq={adding}
        data={data}
        update={update}
        onClose={() => setAdding(null)}
        onDone={async (seqId, activate) => {
          if (activate) {
            const sq = sequences.find((x) => x.id === seqId);
            if (sq && sq.status !== "active" && sq.mailbox_ids.length)
              await setSequenceStatus(seqId, "active");
            const r = await sendNow({ sequenceId: seqId });
            if (r.ok) toastDispatch(r.report);
          }
          await refresh();
        }}
        go={go}
      />
    </div>
  );
}

/** "Is it sending right now, and if not, why?" — the dispatcher's own checks, in words. */
function SendingStatusPanel() {
  const checkStatus = useServerFn(getSendingStatus);
  const checking = useRef(false);
  const [st, setSt] = useState<SendingStatus | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    try {
      setSt(await checkStatus());
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      checking.current = false;
      setBusy(false);
    }
  }, [checkStatus]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const allGood = st && st.blockers.length === 0 && st.mailboxes.some((m) => m.can_send_now);
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">Is it sending?</h3>
          
        </div>
        <Btn variant="ghost" onClick={() => void load()} disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Re-check
        </Btn>
      </div>
      {err && <p className="mt-3 text-sm text-destructive">Could not check: {err}</p>}
      {st && (
        <div className="mt-3 space-y-3" aria-live="polite">
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              allGood
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-secondary/50"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {allGood ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              )}
              {allGood
                ? "At least one mailbox is eligible to send now."
                : "Sending may be waiting. Check the details below:"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{st.scheduler.note}</div>
            {st.blockers.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {st.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {st.mailboxes.map((m) => (
              <div key={m.email} className="rounded-lg border border-border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 break-all font-mono text-sm font-semibold">{m.email}</div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[.65rem] font-semibold ${
                      m.can_send_now
                        ? "bg-primary/10 text-primary"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {m.can_send_now ? "can send now" : "waiting"}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span>
                    sent today <b className="text-foreground">{m.sent_today}</b> / {m.daily_cap}
                  </span>
                  <span>
                    due now <b className="text-foreground">{m.due_now}</b> · waiting{" "}
                    <b className="text-foreground">{m.waiting_total}</b>
                  </span>
                  <span>
                    hours {m.hours} · now {m.local_time}
                  </span>
                  <span>
                    {m.provider === "ghl" ? "GoHighLevel" : "Google"} ·{" "}
                    {m.sequences.length ? m.sequences.join(", ") : "no active sequence"}
                  </span>
                </div>
                {m.reasons.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {m.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Small per-sequence summary of who is in it. */
function SeqPeople({ c, onClick }: { c?: Record<string, number>; onClick: () => void }) {
  const total = c?.total ?? 0;
  const waiting = (c?.queued ?? 0) + (c?.active ?? 0);
  const done = c?.completed ?? 0;
  const replied = c?.replied ?? 0;
  const bad = (c?.bounced ?? 0) + (c?.unsubscribed ?? 0);
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[.7rem] hover:bg-secondary"
      title="See everyone in this sequence"
    >
      <Users className="h-3.5 w-3.5 text-muted-foreground" />
      <b>{total}</b> {total === 1 ? "person" : "people"}
      {total > 0 && (
        <>
          <span className="text-muted-foreground">·</span>
          <span>{waiting} waiting</span>
          <span className="text-muted-foreground">·</span>
          <span>{done} finished</span>
          {replied > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-[oklch(.45_.15_150)]">{replied} replied</span>
            </>
          )}
          {bad > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-destructive">{bad} bounced/opted out</span>
            </>
          )}
        </>
      )}
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

/** Pick people from the scraped businesses (Raw Data) and enrol them in one go. */
function AddPeople({
  seq,
  data,
  update,
  onClose,
  onDone,
  go,
}: {
  seq: Sequence | null;
  data?: AdminData;
  update?: (fn: (prev: AdminData) => AdminData) => void;
  onClose: () => void;
  onDone: (sequenceId: string, activate: boolean) => Promise<void>;
  go?: (v: "settings" | "raw" | "pipeline") => void;
}) {
  const [q, setQ] = useState("");
  const [hideEmailed, setHideEmailed] = useState(true);
  const [onlyAccepted, setOnlyAccepted] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [activate, setActivate] = useState(true);
  const [result, setResult] = useState<{
    enrolled: number;
    skipped: { email: string; reason: string }[];
  } | null>(null);

  useEffect(() => {
    if (!seq) return;
    setSel(new Set());
    setResult(null);
    setQ("");
  }, [seq]);

  const rows = useMemo(() => {
    const all = (data?.raw ?? []).filter((r) => r.email && r.status !== "rejected");
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => !hideEmailed || !r.lastEmailedAt)
      .filter((r) => !onlyAccepted || r.status === "accepted")
      .filter(
        (r) =>
          !needle ||
          [r.business, r.email, r.city, r.industry, r.contactName]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [data?.raw, q, hideEmailed, onlyAccepted]);

  const allShown = rows.length > 0 && rows.every((r) => sel.has(r.id));
  function toggleAll() {
    setSel(allShown ? new Set() : new Set(rows.map((r) => r.id)));
  }

  async function add() {
    if (!seq) return;
    const picked = rows.filter((r) => sel.has(r.id));
    if (!picked.length) return toast.error("Tick at least one person.");
    setBusy(true);
    try {
      const res = await enrollLeads(seq.id, picked.map(rawToEnroll));
      if (!res.ok) throw new Error(res.error || "Could not add people");
      setResult({ enrolled: res.enrolled, skipped: res.skipped });
      if (res.enrolled) {
        update?.((p) => ({
          ...p,
          raw: p.raw.map((r) =>
            sel.has(r.id)
              ? { ...r, status: "accepted" as const, lastEmailedAt: r.lastEmailedAt ?? Date.now() }
              : r,
          ),
        }));
        toast.success(
          `${res.enrolled} ${res.enrolled === 1 ? "person" : "people"} added to "${seq.name}"${
            activate ? " — sequence is live" : ""
          }`,
        );
        await onDone(seq.id, activate);
      }
      setSel(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!seq} onClose={onClose} title={seq ? `Add people to "${seq.name}"` : ""} wide>
      {seq && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Everyone below came from the Data Scraper and has an email address. Tick who should get
            this sequence; people already on the suppression list or already in this sequence are
            skipped automatically.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={inputCls + " pl-9"}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search business, city, niche…"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={hideEmailed}
                onChange={(e) => setHideEmailed(e.target.checked)}
                className="accent-[var(--brand-violet)]"
              />
              Hide already emailed
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={onlyAccepted}
                onChange={(e) => setOnlyAccepted(e.target.checked)}
                className="accent-[var(--brand-violet)]"
              />
              Only "accepted"
            </label>
            <Btn variant="ghost" onClick={toggleAll}>
              {allShown ? "Clear" : `Select all ${rows.length}`}
            </Btn>
          </div>

          <div className="max-h-[46vh] overflow-auto rounded-xl border border-border">
            {!rows.length ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nothing to show.{" "}
                {(data?.raw ?? []).length === 0 ? (
                  <>
                    Run the{" "}
                    <button className="underline" onClick={() => go?.("raw")}>
                      Data Scraper
                    </button>{" "}
                    first and save the businesses.
                  </>
                ) : (
                  "Try clearing the filters."
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-secondary text-left text-[.65rem] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allShown}
                        onChange={toggleAll}
                        className="accent-[var(--brand-violet)]"
                      />
                    </th>
                    <th className="px-2 py-2">Business</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Where</th>
                    <th className="px-2 py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 400).map((r) => (
                    <tr
                      key={r.id}
                      className={`cursor-pointer border-t border-border ${sel.has(r.id) ? "bg-[var(--brand-violet)]/5" : "hover:bg-secondary/60"}`}
                      onClick={() =>
                        setSel((p) => {
                          const n = new Set(p);
                          if (n.has(r.id)) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })
                      }
                    >
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={sel.has(r.id)}
                          readOnly
                          className="accent-[var(--brand-violet)]"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{r.business}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.contactName || ""}
                          {r.contactName && r.industry ? " · " : ""}
                          {r.industry || ""}
                          {r.lastEmailedAt ? " · emailed before" : ""}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs">{r.email}</td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.city}</td>
                      <td className="px-2 py-1.5 text-right text-xs">{r.score ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {rows.length > 400 && (
            <p className="text-xs text-muted-foreground">
              Showing the first 400 — narrow with the search box to reach the rest.
            </p>
          )}

          {result && (
            <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs">
              <b>{result.enrolled}</b> added
              {result.skipped.length > 0 && (
                <>
                  {" "}
                  · {result.skipped.length} skipped:{" "}
                  {result.skipped
                    .slice(0, 6)
                    .map((x) => `${x.email} (${x.reason})`)
                    .join(", ")}
                  {result.skipped.length > 6 ? "…" : ""}
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={activate}
                onChange={(e) => setActivate(e.target.checked)}
                className="accent-[var(--brand-violet)]"
              />
              Start sending right away (sets the sequence to Active)
            </label>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={onClose}>
                Close
              </Btn>
              <Btn onClick={() => void add()} disabled={busy || !sel.size}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Adding…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Add {sel.size || ""}{" "}
                    {sel.size === 1 ? "person" : "people"}
                  </>
                )}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function rawToEnroll(r: RawBusiness) {
  return {
    company: r.business,
    website: r.website,
    contactName: r.contactName,
    contactTitle: r.contactTitle,
    email: r.email,
    emailSource: r.emailSource || r.source,
    emailGuessed: r.emailSource ? r.emailSource === "Guess" : /guess/i.test(r.source || ""),
    score: r.score,
    scoreReasons: r.scoreWhy,
    ai: r.ai ?? null,
    phone: r.phone,
    linkedin: r.linkedin,
    city: r.city,
    industry: r.industry,
    source: r.source,
    rawId: r.id,
  };
}

/* --------------------------------------------------------------- queue */
function Queue({
  sequences,
  refresh,
  initialSeqId,
}: {
  sequences: Sequence[];
  refresh: () => Promise<void>;
  initialSeqId?: string;
}) {
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [seqId, setSeqId] = useState(initialSeqId ?? "");
  useEffect(() => {
    setSeqId(initialSeqId ?? "");
  }, [initialSeqId]);
  const [status, setStatus] = useState("");
  const [mailbox, setMailbox] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Enrollment | null>(null);
  const [steps, setSteps] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, Message[]>>({});
  const [sending, setSending] = useState<string | null>(null); // enrollment id or "all"

  async function sendNowFor(
    target: { enrollmentIds?: string[]; sequenceId?: string },
    key: string,
  ) {
    setSending(key);
    try {
      const r = await sendNow(target);
      if (!r.ok) throw new Error(r.error || "Could not send");
      toastDispatch(r.report);
      await Promise.all([load(), refresh()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, sc] = await Promise.all([
        listEnrollments({
          sequenceId: seqId || undefined,
          status: status || undefined,
          limit: 500,
        }),
        stepCounts().catch(() => ({}) as Record<string, number>),
      ]);
      setRows(r);
      setSteps(sc);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [seqId, status]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(e: Enrollment, patch: Partial<Enrollment>) {
    await updateEnrollment(e.id, patch);
    await Promise.all([load(), refresh()]);
  }
  async function toggle(e: Enrollment) {
    const next = open === e.id ? null : e.id;
    setOpen(next);
    if (next && !history[e.id]) {
      try {
        const m = await listMessages({ enrollmentId: e.id, limit: 50 });
        setHistory((h) => ({ ...h, [e.id]: m }));
      } catch {
        setHistory((h) => ({ ...h, [e.id]: [] }));
      }
    }
  }

  const mailboxes = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.mailboxes?.email).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((e) => {
      if (mailbox && (e.mailboxes?.email || "") !== mailbox) return false;
      if (!needle) return true;
      return `${e.leads?.email || ""} ${e.leads?.company || ""} ${e.leads?.contact_name || ""} ${e.sequences?.name || ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, mailbox, q]);
  const counts = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
        {} as Record<string, number>,
      ),
    [rows],
  );

  function exportCsv() {
    const header = [
      "Email",
      "Name",
      "Company",
      "Sequence",
      "Mailbox",
      "Status",
      "Sent",
      "Of",
      "Next send",
      "Replied",
      "Last error",
    ];
    const lines = visible.map((e) =>
      [
        e.leads?.email || "",
        e.leads?.contact_name || "",
        e.leads?.company || "",
        e.sequences?.name || "",
        e.mailboxes?.email || "",
        e.status,
        String(e.current_step),
        String(steps[e.sequence_id] ?? ""),
        e.status === "queued" || e.status === "active" ? e.next_send_at : "",
        e.replied_at || "",
        e.last_error || "",
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outreach-people-${visible.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const Progress = ({ e }: { e: Enrollment }) => {
    const total = steps[e.sequence_id] ?? 0;
    const sent = Math.min(e.current_step, total || e.current_step);
    return (
      <div className="flex items-center gap-1.5" title={`${sent} of ${total || "?"} emails sent`}>
        <div className="flex gap-0.5">
          {Array.from({ length: Math.max(total, sent, 1) }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-3 rounded-sm ${
                i < sent
                  ? e.status === "bounced" || e.status === "failed"
                    ? "bg-destructive"
                    : "bg-[oklch(.62_.17_150)]"
                  : "bg-secondary"
              }`}
            />
          ))}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {sent}/{total || "?"}
        </span>
      </div>
    );
  };

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className={inputCls.replace("w-full", "") + " w-[260px]"}
          placeholder="Search email, name, company…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={inputCls.replace("w-full", "") + " w-auto"}
          value={seqId}
          onChange={(e) => setSeqId(e.target.value)}
        >
          <option value="">All sequences</option>
          {sequences.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className={inputCls.replace("w-full", "") + " w-auto"}
          value={mailbox}
          onChange={(e) => setMailbox(e.target.value)}
        >
          <option value="">All mailboxes</option>
          {mailboxes.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select
          className={inputCls.replace("w-full", "") + " w-auto"}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Any status</option>
          {[
            "queued",
            "active",
            "completed",
            "replied",
            "bounced",
            "unsubscribed",
            "paused",
            "failed",
            "skipped",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Btn
          variant="ghost"
          onClick={exportCsv}
          disabled={!visible.length}
          title="Download what's shown as CSV"
        >
          <Download className="h-4 w-4" />
        </Btn>
        {seqId && (counts.queued || counts.active || counts.paused) ? (
          <Btn
            onClick={() => void sendNowFor({ sequenceId: seqId }, "all")}
            disabled={sending !== null}
            title="Ignore the schedule and mailbox hours; the daily cap still applies. Up to 20 per click."
          >
            {sending === "all" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send now to everyone waiting
          </Btn>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length} shown
          {Object.keys(counts).length ? " · " : ""}
          {["queued", "active", "replied", "completed", "bounced"]
            .filter((k) => counts[k])
            .map((k) => `${counts[k]} ${k}`)
            .join(" · ")}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Everyone enrolled in a sequence, which mailbox sends to them, how many of the emails have
        gone out, and what's next. Click a row for the exact emails sent and any replies.
      </p>
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      ) : !visible.length ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Nothing here. Add leads from Raw Data → select → "Add to sequence".
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-medium">Who</th>
                <th className="px-2 py-2 font-medium">Email</th>
                <th className="px-2 py-2 font-medium">Sequence</th>
                <th className="px-2 py-2 font-medium">From mailbox</th>
                <th className="px-2 py-2 font-medium">Sent</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Next / last</th>
                <th className="w-24 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const isOpen = open === e.id;
                const h = history[e.id];
                return (
                  <Fragment key={e.id}>
                    <tr
                      className={`cursor-pointer border-b border-border/70 align-top hover:bg-secondary/40 ${isOpen ? "bg-secondary/40" : ""}`}
                      onClick={() => void toggle(e)}
                    >
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <ChevronRight
                            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                          />
                          <div>
                            <div className="font-medium">
                              {e.leads?.contact_name || e.leads?.company || "—"}
                            </div>
                            {e.leads?.contact_name && (
                              <div className="text-xs text-muted-foreground">{e.leads.company}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="font-mono text-xs">{e.leads?.email}</span>
                        {e.leads?.email_guessed && (
                          <span className="ml-1 rounded bg-[oklch(.8_.16_80)]/30 px-1 text-[.6rem] font-semibold uppercase text-[oklch(.45_.1_70)]">
                            guessed
                          </span>
                        )}
                        {e.leads?.email_verified === "invalid" && (
                          <span className="ml-1 rounded bg-destructive/10 px-1 text-[.6rem] font-semibold uppercase text-destructive">
                            invalid
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-xs">{e.sequences?.name || "—"}</td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">
                        {e.mailboxes?.email || <span className="italic">next free mailbox</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <Progress e={e} />
                      </td>
                      <td className="px-2 py-2.5">
                        <Pill s={e.status} />
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">
                        {e.status === "queued" || e.status === "active"
                          ? `next ${fmt(e.next_send_at)}`
                          : e.replied_at
                            ? `replied ${fmt(e.replied_at)}`
                            : e.completed_at
                              ? `done ${fmt(e.completed_at)}`
                              : fmt(e.updated_at)}
                        {e.last_error && (
                          <div className="truncate text-destructive">{e.last_error}</div>
                        )}
                      </td>
                      <td className="px-2 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {(e.status === "queued" ||
                            e.status === "active" ||
                            e.status === "paused") && (
                            <button
                              aria-label="Send now"
                              title="Send the next email right now (ignores the schedule and mailbox hours)"
                              disabled={sending !== null}
                              onClick={() => void sendNowFor({ enrollmentIds: [e.id] }, e.id)}
                              className="grid h-7 w-7 place-items-center rounded-md border border-transparent bg-[var(--brand-violet)] text-white hover:opacity-90 disabled:opacity-50"
                            >
                              {sending === e.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          {(e.status === "queued" || e.status === "active") && (
                            <button
                              aria-label="Pause"
                              onClick={() => void act(e, { status: "paused" })}
                              className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-secondary"
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {e.status === "paused" && (
                            <button
                              aria-label="Resume"
                              onClick={() =>
                                void act(e, {
                                  status: e.current_step ? "active" : "queued",
                                  next_send_at: new Date().toISOString(),
                                })
                              }
                              className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-secondary"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            aria-label="Remove from sequence"
                            onClick={() => setConfirm(e)}
                            className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border/70 bg-secondary/30">
                        <td colSpan={8} className="px-4 py-3">
                          {!h ? (
                            <div className="text-xs text-muted-foreground">Loading history…</div>
                          ) : !h.length ? (
                            <div className="text-xs text-muted-foreground">
                              Nothing sent yet — first email goes out {fmt(e.next_send_at)} from{" "}
                              {e.mailboxes?.email || "the next free mailbox"}.
                            </div>
                          ) : (
                            <ul className="space-y-1.5 text-xs">
                              {[...h]
                                .sort(
                                  (a, b) =>
                                    new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
                                )
                                .map((m) => (
                                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[.6rem] font-semibold uppercase ${
                                        m.direction === "in"
                                          ? m.kind === "bounce"
                                            ? "bg-destructive/10 text-destructive"
                                            : "bg-[oklch(.7_.18_150)]/20 text-[oklch(.35_.12_150)]"
                                          : m.status === "sent"
                                            ? "bg-secondary text-muted-foreground"
                                            : "bg-destructive/10 text-destructive"
                                      }`}
                                    >
                                      {m.direction === "in"
                                        ? m.kind === "bounce"
                                          ? "bounced"
                                          : m.kind === "auto_reply"
                                            ? "auto-reply"
                                            : "replied"
                                        : m.status === "sent"
                                          ? `sent · email ${(m.step_position ?? 0) + 1}`
                                          : `failed · email ${(m.step_position ?? 0) + 1}`}
                                    </span>
                                    <span className="text-muted-foreground">{fmt(m.sent_at)}</span>
                                    <span className="font-medium">{m.subject}</span>
                                    {m.mailboxes?.email && (
                                      <span className="text-muted-foreground">
                                        from {m.mailboxes.email}
                                      </span>
                                    )}
                                    {m.error && <span className="text-destructive">{m.error}</span>}
                                    {m.direction === "in" && m.snippet && (
                                      <span className="w-full text-muted-foreground">
                                        “{m.snippet}”
                                      </span>
                                    )}
                                  </li>
                                ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        title="Remove from sequence?"
        description={`${confirm?.leads?.email ?? "This lead"} will get no further emails from this sequence. Already-sent emails stay in the log.`}
        confirmLabel="Remove"
        destructive
        onOpenChange={(o) => !o && setConfirm(null)}
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (!target) return;
          void deleteEnrollment(target.id).then(() => Promise.all([load(), refresh()]));
        }}
      />
    </Panel>
  );
}

/* --------------------------------------------------------------- inbox */
const INTENT_STYLE: Record<string, { label: string; cls: string }> = {
  interested: { label: "Interested", cls: "bg-[oklch(.7_.18_150)]/20 text-[oklch(.35_.12_150)]" },
  question: { label: "Question", cls: "bg-[oklch(.7_.15_250)]/20 text-[oklch(.4_.12_250)]" },
  later: { label: "Later", cls: "bg-[oklch(.8_.16_80)]/25 text-[oklch(.45_.1_70)]" },
  not_interested: { label: "Not interested", cls: "bg-destructive/10 text-destructive" },
  wrong_person: { label: "Wrong person", cls: "bg-secondary text-muted-foreground" },
  auto: { label: "Auto-reply", cls: "bg-secondary text-muted-foreground" },
  unknown: { label: "Reply", cls: "bg-secondary text-muted-foreground" },
};
const INTENT_ORDER: ReplyIntent[] = [
  "interested",
  "question",
  "later",
  "unknown",
  "wrong_person",
  "not_interested",
  "auto",
];

function InboxView({
  data,
  update,
  go,
}: {
  data?: AdminData;
  update?: (fn: (prev: AdminData) => AdminData) => void;
  go?: (v: "settings" | "raw" | "pipeline") => void;
}) {
  const [rows, setRows] = useState<Message[]>([]);
  const [kind, setKind] = useState<"reply" | "bounce" | "all">("reply");
  const [showHandled, setShowHandled] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(
    () =>
      listMessages({ direction: "in", kind: kind === "all" ? undefined : kind, limit: 150 })
        .then(setRows)
        .catch((e) => toast.error((e as Error).message)),
    [kind],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const list = rows.filter((m) => showHandled || !m.handled_at);
    if (kind !== "reply") return list;
    return [...list].sort((a, b) => {
      const ia = INTENT_ORDER.indexOf((a.intent as ReplyIntent) || "unknown");
      const ib = INTENT_ORDER.indexOf((b.intent as ReplyIntent) || "unknown");
      if (ia !== ib) return ia - ib;
      return new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime();
    });
  }, [rows, showHandled, kind]);

  const counts = useMemo(
    () =>
      rows
        .filter((m) => !m.handled_at && m.kind === "reply")
        .reduce(
          (a, m) => ({ ...a, [m.intent || "unknown"]: (a[m.intent || "unknown"] ?? 0) + 1 }),
          {} as Record<string, number>,
        ),
    [rows],
  );

  function draftFor(m: Message) {
    return drafts[m.id] ?? m.draft_reply ?? "";
  }

  async function send(m: Message) {
    const text = draftFor(m).trim();
    if (!text) return toast.error("Write a reply first.");
    setSending(m.id);
    const r = await sendReply(m.id, text);
    setSending(null);
    if (!r.ok) return toast.error(r.error || "Could not send");
    toast.success("Reply sent in the same thread");
    setOpenId(null);
    void load();
  }

  async function handled(m: Message, v = true) {
    await markHandled(m.id, v);
    void load();
  }

  const inPipeline = (m: Message) =>
    !!data &&
    !!m.leads?.email &&
    data.deals.some((d) => d.email.toLowerCase() === (m.leads?.email || "").toLowerCase());

  function createDeal(m: Message) {
    if (!update || !m.leads) return;
    const L = m.leads;
    if (inPipeline(m)) return toast.message("Already in the pipeline");
    const deal: Deal = {
      id: uid("d"),
      name: L.company || L.contact_name || L.email || "Lead",
      contact: L.contact_name || "",
      email: L.email || "",
      phone: L.phone || "",
      value: 0,
      stage: m.intent === "interested" ? "qualified" : "contacted",
      source: "Cold Outreach",
      template: "",
      notes: `Replied ${fmt(m.sent_at)} · ${INTENT_STYLE[m.intent || "unknown"]?.label || "reply"}${m.snippet ? ` · "${m.snippet.slice(0, 140)}"` : ""}${L.city ? ` · ${L.city}` : ""}${L.industry ? ` · ${L.industry}` : ""}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    update((p) => ({ ...p, deals: [...p.deals, deal] }));
    toast.success(`${deal.name} added to the pipeline as ${deal.stage}`);
    void markHandled(m.id, true).then(load);
  }

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["reply", "bounce", "all"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${kind === k ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
          >
            {k === "all" ? "Everything" : k === "reply" ? "Replies" : "Bounces"}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showHandled}
            onChange={(e) => setShowHandled(e.target.checked)}
            className="accent-[var(--brand-violet)]"
          />
          show handled
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {INTENT_ORDER.filter((i) => counts[i]).map((i) => (
            <span
              key={i}
              className={`rounded-full px-2 py-0.5 text-[.62rem] font-semibold uppercase tracking-wide ${INTENT_STYLE[i].cls}`}
            >
              {counts[i]} {INTENT_STYLE[i].label}
            </span>
          ))}
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Every reply is read by Claude when it lands: it labels the intent, stops the sequence, and
        writes the answer you would send. Edit the draft, hit send, and it goes out in the same
        Gmail thread from the same mailbox.
      </p>
      {!visible.length ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {rows.length && !showHandled
            ? "Inbox zero — everything here is handled."
            : `No ${kind === "all" ? "incoming mail" : kind === "reply" ? "replies" : "bounces"} recorded yet.`}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visible.map((m) => {
            const it =
              INTENT_STYLE[
                m.kind === "bounce"
                  ? "not_interested"
                  : m.kind === "auto_reply"
                    ? "auto"
                    : m.intent || "unknown"
              ];
            const open = openId === m.id;
            const gmail =
              m.gmail_thread_id && m.mailboxes?.email
                ? `https://mail.google.com/mail/u/${m.mailboxes.email}/#all/${m.gmail_thread_id}`
                : undefined;
            return (
              <div key={m.id} className={`py-3 ${m.handled_at ? "opacity-60" : ""}`}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : m.id)}
                  className="flex w-full flex-wrap items-center gap-2 text-left text-sm"
                >
                  <span className="font-medium">
                    {m.leads?.contact_name || m.leads?.company || m.from_header || "Unknown sender"}
                  </span>
                  {m.leads?.company && m.leads?.contact_name && (
                    <span className="text-muted-foreground">· {m.leads.company}</span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[.6rem] font-semibold uppercase ${m.kind === "bounce" ? "bg-destructive/10 text-destructive" : it.cls}`}
                  >
                    {m.kind === "bounce" ? "bounce" : it.label}
                  </span>
                  {m.handled_at && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[.6rem] font-semibold uppercase text-muted-foreground">
                      handled
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{fmt(m.sent_at)}</span>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                  />
                </button>
                <div className="mt-0.5 text-sm">{m.subject}</div>
                {!open && <div className="truncate text-xs text-muted-foreground">{m.snippet}</div>}

                {open && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-secondary/40 p-3">
                      <div className="mb-1 text-[.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                        They wrote
                      </div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm">
                        {m.body_text || m.snippet || "(no text)"}
                      </pre>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" /> {m.leads?.email}
                        {gmail && (
                          <a
                            href={gmail}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            Open in Gmail <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    {m.kind === "reply" ? (
                      <div className="rounded-xl border border-border p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-[.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-[var(--brand-violet)]" /> Suggested
                          reply
                          {m.mailboxes?.email && (
                            <span className="ml-auto normal-case tracking-normal">
                              from {m.mailboxes.email}
                            </span>
                          )}
                        </div>
                        <textarea
                          className={inputCls + " min-h-[150px]"}
                          value={draftFor(m)}
                          onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                          placeholder={
                            m.draft_reply
                              ? ""
                              : "No draft yet (add ANTHROPIC_API_KEY to get one). Write your reply here."
                          }
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Btn
                            onClick={() => void send(m)}
                            disabled={sending === m.id || !draftFor(m).trim()}
                          >
                            {sending === m.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}{" "}
                            Send reply
                          </Btn>
                          {update && m.leads && (
                            <Btn
                              variant="soft"
                              onClick={() => createDeal(m)}
                              disabled={inPipeline(m)}
                              title="Add this lead to the sales pipeline"
                            >
                              <BriefcaseBusiness className="h-4 w-4" />{" "}
                              {inPipeline(m) ? "In pipeline" : "Create deal"}
                            </Btn>
                          )}
                          {inPipeline(m) && go && (
                            <button
                              onClick={() => go("pipeline")}
                              className="text-xs font-semibold text-primary hover:underline"
                            >
                              Open pipeline →
                            </button>
                          )}
                          <Btn
                            variant="ghost"
                            onClick={() => void handled(m, !m.handled_at)}
                            className="ml-auto"
                          >
                            <Check className="h-4 w-4" />{" "}
                            {m.handled_at ? "Unhandle" : "Mark handled"}
                          </Btn>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
                        {m.kind === "bounce"
                          ? "The address bounced. It has been added to the suppression list and the sequence stopped."
                          : "Automatic reply (out of office). The sequence continues as planned."}
                        <div className="mt-3">
                          <Btn variant="ghost" onClick={() => void handled(m, !m.handled_at)}>
                            <Check className="h-4 w-4" />{" "}
                            {m.handled_at ? "Unhandle" : "Mark handled"}
                          </Btn>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------- suppressed */
function Suppressed() {
  const [rows, setRows] = useState<Suppression[]>([]);
  const [email, setEmail] = useState("");
  const load = useCallback(
    () =>
      listSuppressions()
        .then(setRows)
        .catch((e) => toast.error((e as Error).message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const grouped = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({ ...a, [r.reason]: (a[r.reason] ?? 0) + 1 }),
        {} as Record<string, number>,
      ),
    [rows],
  );
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className={inputCls + " max-w-xs"}
          placeholder="Add an email to never contact"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Btn
          variant="ghost"
          onClick={async () => {
            if (!email.includes("@")) return;
            await addSuppression(email);
            setEmail("");
            toast.success("Added");
            void load();
          }}
        >
          <Plus className="h-4 w-4" /> Add
        </Btn>
        <span className="ml-auto text-xs text-muted-foreground">
          {Object.entries(grouped)
            .map(([k, v]) => `${v} ${k.replace("_", " ")}`)
            .join(" · ") || "Empty"}
        </span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="font-medium">{r.email ?? `*@${r.domain}`}</span>
            <Pill s={r.reason === "bounce" || r.reason === "unsubscribed" ? "bounced" : "paused"} />
            <span className="truncate text-xs text-muted-foreground">{r.note}</span>
            <span className="ml-auto text-xs text-muted-foreground">{fmt(r.created_at)}</span>
            <button
              aria-label="Remove"
              onClick={async () => {
                await removeSuppression(r.id);
                void load();
              }}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
