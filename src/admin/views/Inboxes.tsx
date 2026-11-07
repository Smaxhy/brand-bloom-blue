import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, RefreshCw, Send, Reply, ArrowLeft, Search } from "lucide-react";
import { readGhlInbox, type InboxConversation } from "@/lib/ghl-inbox.functions";
import { replyState, type InboxEmail } from "@/lib/ghl-inbox";
import { listMailboxes, type Mailbox } from "../outreach";
import { Btn, inputCls } from "../ui";

export function Inboxes() {
  const read = useServerFn(readGhlInbox);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailboxId, setMailboxId] = useState("");
  const [rows, setRows] = useState<InboxConversation[]>([]);
  const [selected, setSelected] = useState<InboxConversation | null>(null);
  const [messages, setMessages] = useState<InboxEmail[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [cursor, setCursor] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [historyPartial, setHistoryPartial] = useState(false);
  const [checked, setChecked] = useState("");
  const generation = useRef(0);

  useEffect(() => { void listMailboxes().then((all) => { const ghl = all.filter((m) => m.provider === "ghl"); setMailboxes(ghl); setMailboxId(ghl[0]?.id || ""); }).catch((e) => setError(e instanceof Error ? e.message : "Inboxes could not be loaded.")); }, []);
  useEffect(() => { setSelected(null); setMessages([]); setRows([]); if (mailboxId) void load(); }, [mailboxId]);
  useEffect(() => {
    if (!mailboxId) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || busy) return;
      if (selected) void open(selected); else void load();
    }, 60000);
    return () => clearInterval(timer);
  }, [mailboxId, selected, busy]);
  async function load(append = false) {
    const run = ++generation.current;
    setBusy(true); setError("");
    try {
      const result = await read({ data: { mailboxId, cursor: append && cursor ? cursor : undefined } });
      if (run !== generation.current) return;
      setRows((old) => append ? [...old, ...result.conversations.filter((c) => !old.some((p) => p.id === c.id))] : result.conversations);
      setCursor(result.nextCursor); setMore(result.hasMore && result.nextCursor !== cursor); setChecked(new Date().toLocaleTimeString());
    } catch (e) { if (run === generation.current) setError(e instanceof Error ? e.message : "Inbox could not be read."); }
    finally { if (run === generation.current) setBusy(false); }
  }
  async function open(conversation: InboxConversation) {
    const run = ++generation.current;
    setSelected(conversation); setMessages([]); setBusy(true); setError(""); setHistoryPartial(false);
    try {
      const result = await read({ data: { mailboxId, conversationId: conversation.id } });
      if (run !== generation.current) return;
      setMessages(result.messages); setHistoryPartial(result.hasMore);
    } catch (e) { if (run === generation.current) setError(e instanceof Error ? e.message : "Conversation could not be read."); }
    finally { if (run === generation.current) setBusy(false); }
  }
  const visible = rows.filter((c) => (filter !== "replies" || c.lastMessageDirection === "inbound") && (filter !== "sent" || c.lastMessageDirection === "outbound") && [c.contactName, c.fullName, c.email, c.lastMessageBody].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <Inbox className="h-5 w-5 text-primary" />
      <select aria-label="GoHighLevel inbox" className={`${inputCls} max-w-sm`} value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>{mailboxes.map((m) => <option key={m.id} value={m.id}>{m.display_name || m.email} · {m.email}</option>)}</select>
      <Btn variant="ghost" disabled={busy || !mailboxId} onClick={() => { if (selected) void open(selected); else void load(); }}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh</Btn>
      {checked && <span className="text-xs text-muted-foreground">Checked {checked}</span>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!mailboxes.length && !error && <p className="py-12 text-center text-muted-foreground">No GoHighLevel inbox connected.</p>}
    {!!mailboxId && <>
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <Search className="h-4 w-4 text-muted-foreground" /><input aria-label="Search conversations" placeholder="Search name or email" className={`${inputCls} max-w-xs`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Conversation filter" className={`${inputCls} max-w-xs`} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All email conversations</option><option value="replies">Latest message: reply</option><option value="sent">Latest message: sent</option></select>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(250px,360px)_minmax(0,1fr)]">
        <div className={`${selected ? "hidden lg:block" : ""} min-w-0 divide-y divide-border`}>
          {!visible.length && <p className="py-12 text-center text-sm text-muted-foreground">{busy ? "Loading conversations…" : "No matching email conversations."}</p>}
          {visible.map((c) => <Btn key={c.id} variant="soft" className={`my-2 w-full flex-col items-start rounded-lg p-4 text-left ${selected?.id === c.id ? "ring-1 ring-primary" : ""}`} onClick={() => void open(c)}>
            <span className="max-w-full break-words font-semibold">{c.contactName || c.fullName || c.email || "Contact"}</span>
            {c.email && <span className="max-w-full break-all text-xs text-muted-foreground">{c.email}</span>}
            <span className="flex items-center gap-1 text-xs text-primary">{c.lastMessageDirection === "inbound" ? <Reply className="h-3 w-3" /> : <Send className="h-3 w-3" />}{c.lastMessageDirection === "inbound" ? "Latest: reply" : "Latest: sent"}</span>
            <span className="line-clamp-2 max-w-full break-words text-xs text-muted-foreground">{c.lastMessageBody}</span>
          </Btn>)}
          {more && <Btn variant="ghost" disabled={busy} onClick={() => void load(true)}>Load older conversations</Btn>}
        </div>
        <section className={`${selected ? "" : "hidden lg:block"} min-w-0`}>
          {!selected ? <p className="py-16 text-center text-muted-foreground">Select an email conversation.</p> : <>
            <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-border pb-4"><Btn variant="ghost" aria-label="Back to conversations" onClick={() => { generation.current++; setSelected(null); setBusy(false); }}><ArrowLeft className="h-4 w-4" /></Btn><div className="min-w-0 flex-1"><h2 className="break-words text-lg font-semibold">{selected.contactName || selected.fullName || selected.email || "Conversation"}</h2><p className="break-all text-sm text-muted-foreground">{selected.email}</p></div>{!busy && !error && <span className="text-sm text-primary">{replyState(messages)}</span>}</div>
            {busy && <p className="text-sm text-muted-foreground">Loading email history…</p>}
            {historyPartial && <p className="mb-4 text-xs text-muted-foreground">Showing the latest 100 messages. Older history remains in GoHighLevel.</p>}
            {!busy && !error && !messages.length && <p className="text-sm text-muted-foreground">No email messages in this conversation.</p>}
            <div className="divide-y divide-border">{messages.map((m) => <article key={m.id} className="min-w-0 py-5"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{m.direction === "inbound" ? <Reply className="h-4 w-4 text-primary" /> : <Send className="h-4 w-4" />}<strong className="text-foreground">{m.direction === "inbound" ? "Received reply" : "Sent email"}</strong><time>{new Date(m.dateAdded).toLocaleString()}</time>{m.status && <span>{m.status}</span>}</div>{m.subject && <h3 className="mb-3 break-words font-semibold">{m.subject}</h3>}<p className="whitespace-pre-wrap break-words text-sm">{m.body || "Message body not supplied by GoHighLevel."}</p></article>)}</div>
          </>}
        </section>
      </div>
    </>}
  </div>;
}