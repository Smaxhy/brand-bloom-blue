import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailMessages, type InboxEmail } from "./ghl-inbox";

const input = z.object({ mailboxId: z.string().uuid(), conversationId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(), cursor: z.number().finite().positive().optional() });
export interface InboxConversation {
  id: string; contactId: string; contactName?: string; fullName?: string; email?: string; lastMessageBody?: string;
  lastMessageDate?: string | number; lastMessageDirection?: string; lastMessageType?: string; locationId?: string;
}
export const readGhlInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.input<typeof input>) => input.parse(data))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const { data: role, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "ceo"]).limit(1).maybeSingle();
    if (roleError || !role) throw new Error("Only administrators can read GoHighLevel inboxes.");
    const { data: mailbox, error: mailboxError } = await context.supabase.from("mailboxes").select("id,provider").eq("id", data.mailboxId).eq("provider", "ghl").maybeSingle();
    if (mailboxError || !mailbox) throw new Error("This GoHighLevel inbox is not available.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed, error: limitError } = await supabaseAdmin.rpc("check_rate_limit", { _key: `ghl-inbox:${context.userId}`, _max: 20, _window_seconds: 60 });
    if (limitError || allowed !== true) throw new Error("Please wait a minute before checking this inbox again.");
    const { data: credentials, error: credentialError } = await supabaseAdmin.from("mailbox_tokens").select("ghl_api_key,ghl_location_id,ghl_company_id").eq("mailbox_id", mailbox.id).maybeSingle();
    if (credentialError || !credentials?.ghl_api_key || !credentials.ghl_location_id) throw new Error("Connect this GoHighLevel inbox in Settings first.");
    const { ghlToken, ghlPlainText } = await import("./ghl");
    let token: string;
    try { token = await ghlToken({ apiKey: credentials.ghl_api_key, locationId: credentials.ghl_location_id, companyId: credentials.ghl_company_id || undefined }); }
    catch { throw new Error("GoHighLevel could not authorize this inbox. Check its connection in Settings."); }
    const signal = AbortSignal.timeout(20000);
    async function read<T>(path: string): Promise<T> {
      let response: Response;
      try { response = await fetch(`https://services.leadconnectorhq.com${path}`, { signal, headers: { Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json" } }); }
      catch { throw new Error("GoHighLevel did not respond in time. Please try again."); }
      if (!response.ok) throw new Error(`GoHighLevel inbox could not be read (${response.status}). Check conversation-read permissions in Settings.`);
      return await response.json() as T;
    }
    if (data.conversationId) {
      const conversation = await read<InboxConversation>(`/conversations/${encodeURIComponent(data.conversationId)}`);
      if (conversation.locationId !== credentials.ghl_location_id) throw new Error("This conversation is not part of the selected inbox.");
      const response = await read<{ messages?: { messages?: InboxEmail[]; nextPage?: boolean; lastMessageId?: string } | InboxEmail[] }>(`/conversations/${encodeURIComponent(data.conversationId)}/messages?limit=100`);
      const raw = Array.isArray(response.messages) ? response.messages : response.messages?.messages ?? [];
      return { conversations: [] as InboxConversation[], messages: emailMessages(raw).map((m) => ({ ...m, body: ghlPlainText(m.body || "").slice(0, 30000) })), hasMore: raw.length === 100, nextCursor: null as number | null };
    }
    const params = new URLSearchParams({ locationId: credentials.ghl_location_id, limit: "30", sort: "desc", sortBy: "last_message_date", lastMessageType: "TYPE_EMAIL" });
    if (data.cursor) params.set("startAfterDate", String(data.cursor));
    const response = await read<{ conversations?: InboxConversation[] }>(`/conversations/search?${params}`);
    const conversations = (response.conversations ?? []).map((c) => ({ ...c, lastMessageBody: ghlPlainText(c.lastMessageBody || "").slice(0, 500) }));
    const last = conversations.at(-1)?.lastMessageDate;
    const cursor = typeof last === "number" ? last : Date.parse(String(last || ""));
    return { conversations, messages: [] as InboxEmail[], hasMore: conversations.length === 30, nextCursor: Number.isFinite(cursor) && cursor > 0 ? cursor : null };
  });