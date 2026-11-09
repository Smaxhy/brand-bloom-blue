/**
 * /api/outreach/*, /api/google/oauth/*, /api/cron/*, /api/unsub
 * Server routes for the outreach engine (mailboxes, enrolling, sending).
 */

import type { LeadAi } from "@/lib/lead-filters";
import { Db, enc, pgQuote } from "./db";
import { hasCronSecret, type ApiUser } from "./api-auth";
import { makeState, readState, consentUrl, exchangeCode, userEmail } from "./google-oauth";
import { sendVia } from "./channel";
import { ghlVerify } from "./ghl";
import { runDispatch, type Lead, type Mailbox, type OutreachSettings } from "./sequencer";
import { renderStep } from "./templates";
import { hasMx } from "./providers/free-enrich";
import { verifyEmail, addSuppression, looksLikeEmail } from "./bounce";
import { isCompanyDomain } from "./business-key";
import { companyAlreadyContacted } from "./company-contact";
import { canEnrollGuessedEmail } from "./guessed-email";
import { writeStep, DEFAULT_AI_INSTRUCTIONS } from "./email-ai";
import { runSavedSearch, type SavedSearch } from "./saved-searches";
import { runTick, keepAlive, lastServerTick, randomHex, sha256Hex, forgetSchedulerTokenCache, type WaitCtx } from "./tick";

type Env = Record<string, string | undefined>;
const env = (e: Env, k: string) => e[k] || process.env?.[k];
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

export async function handleOutreachRoute(
  path: string,
  request: Request,
  e: Env,
  user: ApiUser | null,
  ctx?: WaitCtx,
): Promise<Response | null> {
  const url = new URL(request.url);

  // ---- public ----------------------------------------------------------
  if (path === "/api/unsub") return unsubscribe(request, e);
  if (path === "/api/google/oauth/callback") return oauthCallback(request, e);

  // ---- cron (secret) or signed-in admin ---------------------------------
  if (path === "/api/cron/dispatch") {
    if (!Db.available(e))
      return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on the server." }, 500);
    // An outside pinger with the secret = a full background tick.
    if (hasCronSecret(request, e)) {
      const tick = await keepAlive(ctx, runTick(e, { trigger: "external", origin: url.origin }));
      return json({ ok: true, report: tick.dispatch ?? null, tick });
    }
    // The admin's "Send due emails now" / "Sync inbox" buttons: respects the
    // schedule, finishes inside the request's grace period.
    const report = await keepAlive(
      ctx,
      runDispatch(e, { origin: url.origin, syncOnly: url.searchParams.get("sync") === "1", source: "manual" }),
    );
    return json({ ok: true, report });
  }

  if (!user) return null; // everything below needs a user (gate already enforced upstream)

  if (path === "/api/google/oauth/start") {
    const state = await makeState(e, user.id);
    const u = consentUrl(e, request, state);
    if (!u)
      return json(
        {
          ok: false,
          error:
            "GOOGLE_OAUTH_CLIENT_ID is not set. Create an OAuth client in Google Cloud and add the secrets.",
        },
        400,
      );
    return json({ ok: true, url: u });
  }
  if (path === "/api/outreach/status") return status(e);
  if (path === "/api/outreach/ghl/connect") return ghlConnect(request, e);
  if (path === "/api/outreach/test-send") return testSend(request, e);
  if (path === "/api/outreach/enroll") return enroll(request, e, user);
  if (path === "/api/outreach/verify") return verifyEmails(request, e);
  if (path === "/api/outreach/reply") return sendReply(request, e);
  if (path === "/api/outreach/ai/write") return aiWrite(request, e);
  if (path === "/api/outreach/send-now") return sendNow(request, e, url.origin, ctx);
  if (path === "/api/outreach/tick") return browserTick(request, e, url.origin, ctx);
  if (path === "/api/outreach/scheduler") return scheduler(request, e, url.origin);
  if (path === "/api/outreach/search/run") return runSearchNow(request, e);
  return null;
}

/* ------------------------------------------------------------ reply send */
async function sendReply(request: Request, e: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!Db.available(e))
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on the server." }, 500);
  const body = (await request.json().catch(() => ({}))) as { messageId?: string; text?: string };
  if (!body.messageId || !body.text?.trim())
    return json({ ok: false, error: "messageId and text are required" }, 400);
  const db = new Db(e);
  const msg = await db.one<{
    id: string;
    enrollment_id: string | null;
    lead_id: string | null;
    mailbox_id: string | null;
    gmail_thread_id: string | null;
    rfc_message_id: string | null;
    subject: string;
    from_header: string | null;
  }>("messages", `id=eq.${enc(body.messageId)}&direction=eq.in&select=*`);
  if (!msg || !msg.mailbox_id) return json({ ok: false, error: "reply not found" }, 404);
  const mb = await db.one<Mailbox>("mailboxes", `id=eq.${msg.mailbox_id}&select=*`);
  const lead = msg.lead_id ? await db.one<Lead>("leads", `id=eq.${msg.lead_id}&select=*`) : null;
  const toEmail =
    lead?.email || (msg.from_header || "").match(/<([^>]+)>/)?.[1] || msg.from_header || "";
  if (!mb || !toEmail) return json({ ok: false, error: "no mailbox or recipient" }, 400);
  const settings = (await db.one<OutreachSettings>(
    "outreach_settings",
    "id=eq.singleton&select=*",
  )) ?? {
    company_name: "Inspirova Marketing",
    postal_address: "",
    website: "",
    eu_notice: "",
    us_notice: "",
  };
  const text = `${body.text.trim()}${mb.signature ? `\n\n${mb.signature}` : ""}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2328;max-width:620px">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`;
  const subject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`;
  try {
    const sent = await sendVia(
      e,
      db,
      { ...mb, display_name: mb.display_name || settings.company_name },
      {
        to: { name: lead?.contact_name || "", email: toEmail },
        subject,
        text,
        html,
        threadId: msg.gmail_thread_id || undefined,
        inReplyTo: msg.rfc_message_id || undefined,
        company: lead?.company,
        phone: lead?.phone,
      },
    );
    await db.insert("messages", {
      enrollment_id: msg.enrollment_id,
      lead_id: msg.lead_id,
      mailbox_id: mb.id,
      direction: "out",
      gmail_message_id: sent.id,
      gmail_thread_id: sent.threadId,
      subject,
      snippet: body.text.slice(0, 160),
      kind: "reply",
      status: "sent",
    });
    await db.update("messages", `id=eq.${msg.id}`, { handled_at: new Date().toISOString() });
    return json({ ok: true, id: sent.id });
  } catch (ex) {
    return json({ ok: false, error: (ex as Error).message });
  }
}

/* ------------------------------------------------------- run saved search */
async function runSearchNow(request: Request, e: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!Db.available(e))
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on the server." }, 500);
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return json({ ok: false, error: "id required" }, 400);
  const db = new Db(e);
  const ss = await db.one<SavedSearch>("saved_searches", `id=eq.${enc(body.id)}&select=*`);
  if (!ss) return json({ ok: false, error: "saved search not found" }, 404);
  const result = await runSavedSearch(e, db, ss);
  const next =
    ss.schedule === "off"
      ? null
      : new Date(Date.now() + (ss.schedule === "daily" ? 1 : 7) * 86_400_000).toISOString();
  await db.update("saved_searches", `id=eq.${ss.id}`, {
    last_run_at: result.ran_at,
    last_result: result,
    next_run_at: next,
  });
  return json({ ok: true, result });
}

/* ------------------------------------------------------------ GHL channel */
async function ghlConnect(request: Request, e: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!Db.available(e))
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on the server." }, 500);
  const b = (await request.json().catch(() => ({}))) as {
    apiKey?: string;
    locationId?: string;
    companyId?: string;
    fromEmail?: string;
    fromName?: string;
  };
  const apiKey = (b.apiKey || "").trim();
  const locationId = (b.locationId || "").trim();
  const fromEmail = (b.fromEmail || "").trim().toLowerCase();
  if (!apiKey || !locationId || !fromEmail.includes("@"))
    return json({ ok: false, error: "API key, Location ID and the From email are required" }, 400);
  const v = await ghlVerify({
    apiKey,
    locationId,
    companyId: (b.companyId || "").trim() || undefined,
  });
  if (!v.ok) return json({ ok: false, error: v.error }, 400);
  const db = new Db(e);
  const existing = await db.one<{ id: string }>(
    "mailboxes",
    `email=eq.${enc(fromEmail)}&select=id`,
  );
  const row = {
    email: fromEmail,
    display_name: (b.fromName || "").trim() || v.name,
    provider: "ghl",
    status: "active",
    daily_cap: 1000,
    last_error: null,
  };
  const mb = existing
    ? (await db.update<{ id: string }>("mailboxes", `id=eq.${existing.id}`, row))[0]
    : (await db.insert<{ id: string }>("mailboxes", row))[0];
  await db.upsert(
    "mailbox_tokens",
    {
      mailbox_id: mb.id,
      refresh_token: "",
      ghl_api_key: apiKey,
      ghl_location_id: locationId,
      ghl_company_id: (b.companyId || "").trim() || null,
    },
    "mailbox_id",
  );
  return json({ ok: true, id: mb.id, location: v.name });
}

/* ------------------------------------------------------------------ status */
async function status(e: Env): Promise<Response> {
  return json({
    db: Db.available(e),
    oauth: !!env(e, "GOOGLE_OAUTH_CLIENT_ID") && !!env(e, "GOOGLE_OAUTH_CLIENT_SECRET"),
    cronSecret: !!env(e, "CRON_SECRET"),
    places: !!env(e, "GOOGLE_PLACES_API_KEY"),
    serper: !!env(e, "SERPER_API_KEY"),
    brave: !!env(e, "BRAVE_SEARCH_API_KEY"),
    apify: !!env(e, "APIFY_TOKEN"),
    anthropic: !!env(e, "ANTHROPIC_API_KEY"),
    reoon: !!env(e, "REOON_API_KEY"),
    apollo: !!env(e, "APOLLO_API_KEY"),
    hunter: !!env(e, "HUNTER_API_KEY"),
  });
}

/* ------------------------------------------------------------- OAuth flow */
async function oauthCallback(request: Request, e: Env): Promise<Response> {
  const url = new URL(request.url);
  const back = (q: string) => Response.redirect(`${url.origin}/admin?${q}`, 302);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const err = url.searchParams.get("error");
  if (err) return back(`mailbox=error&reason=${encodeURIComponent(err)}`);
  const st = await readState(e, state);
  if (!code || !st) return back("mailbox=error&reason=bad_state");
  if (!Db.available(e)) return back("mailbox=error&reason=no_service_role");
  try {
    const tok = await exchangeCode(e, request, code);
    if (!tok.access_token)
      return back(
        `mailbox=error&reason=${encodeURIComponent(tok.error_description || tok.error || "token")}`,
      );
    const email = (await userEmail(tok.access_token)).toLowerCase();
    if (!email) return back("mailbox=error&reason=no_email");
    const db = new Db(e);
    const existing = await db.one<{ id: string }>("mailboxes", `email=eq.${enc(email)}&select=id`);
    const row = existing
      ? (
          await db.update<{ id: string }>("mailboxes", `id=eq.${existing.id}`, {
            status: "active",
            last_error: null,
          })
        )[0]
      : (
          await db.insert<{ id: string }>("mailboxes", {
            email,
            display_name: email
              .split("@")[0]
              .replace(/[._-]/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            created_by: st.userId,
          })
        )[0];
    if (!tok.refresh_token) {
      const had = await db.one("mailbox_tokens", `mailbox_id=eq.${row.id}&select=mailbox_id`);
      if (!had) return back("mailbox=error&reason=no_refresh_token");
      await db.update("mailbox_tokens", `mailbox_id=eq.${row.id}`, {
        access_token: tok.access_token,
        expires_at: new Date(Date.now() + (tok.expires_in - 30) * 1000).toISOString(),
        scope: tok.scope,
        updated_at: new Date().toISOString(),
      });
    } else {
      await db.upsert(
        "mailbox_tokens",
        {
          mailbox_id: row.id,
          refresh_token: tok.refresh_token,
          access_token: tok.access_token,
          expires_at: new Date(Date.now() + (tok.expires_in - 30) * 1000).toISOString(),
          scope: tok.scope,
          updated_at: new Date().toISOString(),
        },
        "mailbox_id",
      );
    }
    return back(`mailbox=connected&email=${encodeURIComponent(email)}`);
  } catch (ex) {
    return back(`mailbox=error&reason=${encodeURIComponent((ex as Error).message.slice(0, 120))}`);
  }
}

/* ------------------------------------------------------------ test send */
async function testSend(request: Request, e: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!Db.available(e))
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on the server." }, 500);
  const body = (await request.json().catch(() => ({}))) as {
    mailboxId?: string;
    to?: string;
    subject?: string;
    text?: string;
    region?: "US" | "EU";
  };
  if (!body.mailboxId || !body.to)
    return json({ ok: false, error: "mailboxId and to are required" }, 400);
  const db = new Db(e);
  const mb = await db.one<Mailbox>("mailboxes", `id=eq.${enc(body.mailboxId)}&select=*`);
  if (!mb) return json({ ok: false, error: "mailbox not found" }, 404);
  const settings = (await db.one<OutreachSettings>(
    "outreach_settings",
    "id=eq.singleton&select=*",
  )) ?? {
    company_name: "Inspirova Marketing",
    postal_address: "",
    website: "",
    eu_notice: "",
    us_notice: "",
  };
  const lead: Lead = {
    id: "test",
    company: "Test Company",
    domain: "example.com",
    website: "example.com",
    contact_name: "Test Person",
    contact_title: "Owner",
    email: body.to,
    email_guessed: false,
    email_verified: "unknown",
    phone: "",
    city: "Littleton",
    region: body.region || "US",
    industry: "Testing",
  };
  const rendered = renderStep({
    step: {
      id: "t",
      sequence_id: "t",
      position: 0,
      delay_days: 0,
      subject: body.subject || "Test from {{sender_company}}",
      body:
        body.text ||
        "Hi {{first_name}},\n\nThis is a test email from the Inspirova outreach engine sent through {{sender_name}}'s mailbox. If you can read this, sending works.",
    },
    lead,
    mailbox: mb,
    settings,
    unsubscribeUrl: `${new URL(request.url).origin}/api/unsub?t=test`,
    isFollowUp: false,
    firstSubject: "",
  });
  try {
    const sent = await sendVia(
      e,
      db,
      { ...mb, display_name: mb.display_name || settings.company_name },
      {
        to: { name: lead.contact_name, email: body.to },
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      },
    );
    return json({ ok: true, id: sent.id, threadId: sent.threadId, preview: rendered });
  } catch (ex) {
    return json({ ok: false, error: (ex as Error).message });
  }
}

/* ---------------------------------------------------------------- enroll */
interface EnrollLead {
  company: string;
  website?: string;
  contactName?: string;
  contactTitle?: string;
  email: string;
  emailSource?: string;
  emailGuessed?: boolean;
  phone?: string;
  linkedin?: string;
  city?: string;
  region?: "US" | "EU";
  industry?: string;
  source?: string;
  rawId?: string;
  score?: number;
  scoreReasons?: string[];
  ai?: LeadAi | null;
}

/** "Send now": ignore the schedule and mailbox hours for chosen people / a sequence. */
async function sendNow(request: Request, env: Env, origin: string, ctx?: WaitCtx): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!Db.available(env))
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on the server." }, 500);
  const b = (await request.json().catch(() => ({}))) as {
    enrollmentIds?: string[];
    sequenceId?: string;
    frozenAt?: string;
  };
  const ids = (Array.isArray(b.enrollmentIds) ? b.enrollmentIds : [])
    .filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x))
    .slice(0, 200);
  const seq = typeof b.sequenceId === "string" && /^[0-9a-f-]{36}$/i.test(b.sequenceId) ? b.sequenceId : undefined;
  if (!ids.length && !seq) return json({ ok: false, error: "nothing to send" }, 400);
  // A sequence "send all" is one action over the people waiting when it began:
  // the first call fixes that moment (server clock) and the browser sends it
  // back on every later round. Anything odd falls back to "now".
  const now = Date.now();
  const askedFrozen = typeof b.frozenAt === "string" ? Date.parse(b.frozenAt) : NaN;
  const frozenAt = new Date(
    Number.isFinite(askedFrozen) && askedFrozen >= now - 24 * 3600_000 && askedFrozen <= now ? askedFrozen : now,
  ).toISOString();
  // ~25 s per call: the browser keeps calling until everyone is sent. Kept
  // alive past a closed tab so a send is never cut in half.
  const report = await keepAlive(
    ctx,
    runDispatch(env, {
      origin,
      source: "manual",
      force: ids.length ? { enrollmentIds: ids } : { sequenceId: seq, frozenAt },
    }),
  );
  return json(ids.length ? { ok: true, report } : { ok: true, report, frozen_at: frozenAt });
}

/**
 * Keep-alive from an open admin tab: when no server scheduler has run in the
 * last 90 s, this tab does one tick (send what's due + move scans on).
 */
async function browserTick(request: Request, env: Env, origin: string, ctx?: WaitCtx): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!Db.available(env))
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on the server." }, 500);
  const tick = await keepAlive(ctx, runTick(env, { trigger: "browser", origin }));
  const sent = tick.dispatch?.mailboxes.reduce((a, m) => a + m.sent, 0) ?? 0;
  return json({ ok: true, ran: !tick.dispatch_skipped || !!tick.scans, sent, read: tick.scans?.read ?? 0, skipped: tick.dispatch_skipped ?? null });
}

/** Settings → Background timer: turn the once-a-minute database timer on/off, or read its state. */
async function scheduler(request: Request, env: Env, requestOrigin: string): Promise<Response> {
  if (!Db.available(env))
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on the server." }, 500);
  const db = new Db(env);
  const configured = (env.PUBLIC_ORIGIN || process.env?.PUBLIC_ORIGIN || "").replace(/\/+$/, "");
  const origin = configured || "https://inspirovamarketing.com";
  if (request.method === "GET") {
    const row = await db.one<{ token_hash: string; url: string }>("outreach_scheduler", "id=eq.singleton&select=token_hash,url");
    const last = await lastServerTick(db);
    return json({ ok: true, enabled: !!row?.token_hash, url: row?.url ?? null,
      suggested_url: `${origin}/api/public/cron/tick`, migrated: true,
      last_tick_at: last.at, last_tick_source: last.source });
  }
  if (request.method !== "POST") return json({ ok: false, error: "GET or POST only" }, 405);
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") return json({ ok: false, error: "Choose whether to enable the timer." }, 400);
  const enabled = body.enabled;
  if (enabled && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin))
    return json({ ok: false, error: `The timer needs your public https address. Set PUBLIC_ORIGIN (now: ${origin || "empty"}).` }, 400);
  if (enabled && /(^|\/\/)(id-)?preview--|lovableproject/i.test(origin))
    return json({ ok: false, error: "Open the admin on your live site (e.g. inspirovamarketing.com) to turn the timer on — this is a preview address." }, 400);
  if (enabled && !["https://inspirovamarketing.com", "https://www.inspirovamarketing.com", "https://brand-bloom-blue.lovable.app"].includes(origin)) return json({ ok: false, error: "Use the approved published website address for the timer." }, 400);
  const token = randomHex(32);
  try {
    const result = await db.rpc<string>("configure_outreach_scheduler", {
      _url: `${origin}/api/public/cron/tick`,
      _token: enabled ? token : "",
      _token_hash: enabled ? await sha256Hex(token) : "",
      _enabled: enabled,
    });
    forgetSchedulerTokenCache();
    if (result === "pg_cron_unavailable" || result === "pg_net_unavailable")
      return json({
        ok: false,
        error: "The background timer is not available yet. Your saved settings remain unchanged.",
      }, 400);
    return json({ ok: true, enabled: result === "enabled", url: enabled ? `${origin}/api/public/cron/tick` : null });
  } catch (err) {
    const msg = (err as Error).message;
    if (/configure_outreach_scheduler|PGRST202|does not exist/i.test(msg))
      return json({ ok: false, error: "The background timer update is not available yet." }, 400);
    console.error("Background timer configuration failed");
    return json({ ok: false, error: "Could not change the background timer. Try again later." }, 500);
  }
}

/** "Write with AI" in the sequence editor. */
async function aiWrite(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const b = (await request.json().catch(() => ({}))) as {
    sequenceName?: string;
    audience?: string;
    index?: number;
    previous?: { subject: string; body: string }[];
    current?: { subject?: string; body?: string };
    extra?: string;
  };
  const db = new Db(env);
  const settings = await db
    .one<{ company_name?: string; website?: string; ai_instructions?: string }>(
      "outreach_settings",
      "id=eq.singleton&select=company_name,website,ai_instructions",
    )
    .catch(() => null);
  const r = await writeStep(env, {
    sequenceName: b.sequenceName || "Outreach",
    audience: b.audience,
    index: Number(b.index) || 0,
    previous: Array.isArray(b.previous) ? b.previous.slice(0, 6) : [],
    current: b.current,
    extra: b.extra,
    company: settings?.company_name || "Inspirova Marketing",
    website: settings?.website || undefined,
    instructions: settings?.ai_instructions || DEFAULT_AI_INSTRUCTIONS,
  });
  return json(r, r.ok ? 200 : 502);
}

/** Single-address verification: Reoon when configured, else MX only. */
const verifyOne = (e: Env, email: string) =>
  verifyEmail(e as Record<string, string | undefined>, email);

function cleanDomain(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function guessRegion(l: EnrollLead): "US" | "EU" {
  const d = cleanDomain(l.website || l.email.split("@")[1]);
  if (/\.(be|nl|fr|de|lu|es|it|at|ch|dk|se|no|fi|ie|pt|pl|eu)$/i.test(d)) return "EU";
  if (
    /belg|antwerp|brussel|bruxelles|gent|ghent|leuven|netherlands|amsterdam|germany|france|paris/i.test(
      l.city || "",
    )
  )
    return "EU";
  return "US";
}

/** Upsert leads (by email) and enroll them in a sequence. Guessed emails get an MX check first. */
async function enroll(request: Request, e: Env, user: ApiUser): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!Db.available(e))
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on the server." }, 500);
  const body = (await request.json().catch(() => ({}))) as {
    sequenceId?: string;
    leads?: EnrollLead[];
    startAt?: string;
    allowGuessed?: boolean;
  };
  if (body.allowGuessed !== undefined && typeof body.allowGuessed !== "boolean") return json({ ok: false, error: "Invalid guessed-address option" }, 400);
  if (!body.sequenceId || !Array.isArray(body.leads) || !body.leads.length)
    return json({ ok: false, error: "sequenceId and leads[] are required" }, 400);
  const db = new Db(e);
  const seq = await db.one<{
    id: string;
    mailbox_ids: string[];
    send_anytime?: boolean;
    status?: string;
  }>("sequences", `id=eq.${enc(body.sequenceId)}&select=id,mailbox_ids,send_anytime,status`);
  // A deleted sequence is kept (archived) only as history; nobody new goes in.
  if (!seq || seq.status === "archived")
    return json({ ok: false, error: "sequence not found" }, 404);

  const result = { enrolled: 0, updated: 0, skipped: [] as { email: string; reason: string }[] };
  const start = body.startAt ? new Date(body.startAt) : new Date();
  let i = 0;
  const companiesInBatch = new Set<string>();
  for (const l of body.leads.slice(0, 500)) {
    const email = (l.email || "").trim().toLowerCase();
    // The same strict check the sender uses: a stray comma or bracket in an
    // address can't make it into a sequence.
    if (!looksLikeEmail(email)) {
      result.skipped.push({ email: l.email || "(none)", reason: "invalid email" });
      continue;
    }
    const domain = cleanDomain(l.website) || email.split("@")[1];
    const sup = await db.one(
      "suppressions",
      `or=(email.eq.${enc(pgQuote(email))}${isCompanyDomain(domain) ? `,domain.eq.${enc(pgQuote(domain))}` : ""})&select=id`,
    );
    if (sup) {
      result.skipped.push({ email, reason: "on suppression list" });
      continue;
    }
    // Guessed addresses are verified before they can cost you a bounce.
    let verified = "unknown";
    if (l.emailGuessed) {
      verified = await verifyOne(e, email);
      if (verified !== "invalid" && !canEnrollGuessedEmail(verified, body.allowGuessed)) {
        result.skipped.push({ email, reason: "Guessed address is not confirmed. Configure the email verifier in Settings or explicitly include unverified guesses." });
        continue;
      }
      if (verified === "invalid") {
        result.skipped.push({
          email,
          reason: env(e, "REOON_API_KEY") ? "verifier says invalid" : "domain has no mail server",
        });
        // Remember it as bad so nobody enrols this address again. Email-level only:
        // one wrong guessed address doesn't condemn the whole company.
        await addSuppression(db, { email, domain: null, reason: "bounce", note: "pre-send: address failed verification" }).catch(
          (err) => console.error("suppression not saved:", (err as Error).message),
        );
        continue;
      }
    }
    const [lead] = await db.upsert<{ id: string }>(
      "leads",
      {
        company: l.company || "",
        domain,
        website: cleanDomain(l.website) || null,
        contact_name: l.contactName || "",
        contact_title: l.contactTitle || "",
        email,
        email_source: l.emailSource || "",
        email_guessed: !!l.emailGuessed,
        // Only write a verification we actually just did; never reset an
        // earlier "valid"/"invalid" back to unknown on re-enrolment.
        ...(verified !== "unknown" ? { email_verified: verified } : {}),
        phone: l.phone || "",
        linkedin: l.linkedin || "",
        city: l.city || "",
        region: l.region || guessRegion(l),
        industry: l.industry || "",
        source: l.source || "",
        raw_id: l.rawId || null,
        status: "accepted",
        score: l.score ?? 0,
        score_reasons: l.scoreReasons ?? [],
        signals: l.ai ? { ai: l.ai } : {},
        created_by: user.id,
      },
      "email",
    );
    // Round-robin mailboxes. Everyone is due straight away, in this order: the
    // dispatcher sends them one by one at the sequence's own gap (and only in
    // the mailbox's hours unless the sequence is "Send any time").
    const mailboxId = seq.mailbox_ids.length ? seq.mailbox_ids[i % seq.mailbox_ids.length] : null;
    const nextSendAt = new Date(start.getTime() + i * 1000);
    const existing = await db.one<{ id: string; status: string }>(
      "enrollments",
      `sequence_id=eq.${seq.id}&lead_id=eq.${lead.id}&select=id,status`,
    );
    if (existing) {
      result.skipped.push({ email, reason: `already in sequence (${existing.status})` });
      continue;
    }
    const elsewhere = await db.one<{ id: string }>(
      "enrollments", `lead_id=eq.${lead.id}&status=in.(queued,active,paused)&select=id&limit=1`,
    );
    if (elsewhere) {
      result.skipped.push({ email, reason: "already in another running sequence" });
      continue;
    }
    // One person per company: not a second address from this same list, and not
    // a company someone is already in a sequence with or that was emailed lately.
    if (isCompanyDomain(domain)) {
      if (companiesInBatch.has(domain)) {
        result.skipped.push({ email, reason: "another person at this company is already in this list (one per company)" });
        continue;
      }
    }
    const contacted = await companyAlreadyContacted(db, { id: lead.id, domain }, { includeNotStarted: true });
    if (contacted) {
      result.skipped.push({ email, reason: contacted.reason });
      continue;
    }
    try {
      await db.insert("enrollments", {
        sequence_id: seq.id,
        lead_id: lead.id,
        mailbox_id: mailboxId,
        status: "queued",
        current_step: 0,
        next_send_at: nextSendAt.toISOString(),
        variant: Math.random() < 0.5 ? "A" : "B",
        created_by: user.id,
      });
    } catch (err) {
      const msg = (err as Error).message;
      result.skipped.push({
        email,
        reason: /23505|already belongs|duplicate/i.test(msg) ? "already in another running sequence" : `could not add: ${msg.slice(0, 120)}`,
      });
      continue;
    }
    if (isCompanyDomain(domain)) companiesInBatch.add(domain);
    result.enrolled++;
    i++;
  }
  return json({ ok: true, ...result });
}

/* ---------------------------------------------------- email verification */
/** Optional Reoon verification for guessed addresses (REOON_API_KEY). Falls back to MX only. */
async function verifyEmails(request: Request, e: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  const body = (await request.json().catch(() => ({}))) as { emails?: string[] };
  const emails = (body.emails ?? [])
    .slice(0, 50)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const key = env(e, "REOON_API_KEY");
  const out: { email: string; status: string; detail?: string }[] = [];
  for (const email of emails) {
    const domain = email.split("@")[1] || "";
    if (key) {
      try {
        const u = new URL("https://emailverifier.reoon.com/api/v1/verify");
        u.searchParams.set("email", email);
        u.searchParams.set("key", key);
        u.searchParams.set("mode", "power");
        const res = await fetch(u.toString(), { signal: AbortSignal.timeout(25000) });
        if (res.ok) {
          const j = (await res.json()) as { status?: string; is_safe_to_send?: boolean };
          const s = (j.status || "").toLowerCase();
          out.push({
            email,
            status:
              s === "safe" || s === "valid" || j.is_safe_to_send
                ? "valid"
                : s === "invalid" || s === "disabled"
                  ? "invalid"
                  : "risky",
            detail: j.status,
          });
          continue;
        }
      } catch {
        /* fall through to MX */
      }
    }
    const mx = await hasMx(domain);
    out.push({
      email,
      status: mx === true ? "mx_ok" : mx === false ? "invalid" : "unknown",
      detail: "mx",
    });
  }
  // Persist onto leads when present
  if (Db.available(e)) {
    const db = new Db(e);
    for (const r of out)
      await db
        .update("leads", `email=eq.${enc(r.email)}`, { email_verified: r.status })
        .catch(() => {});
  }
  return json({ ok: true, results: out, provider: key ? "reoon" : "mx" });
}

/* ------------------------------------------------------------ unsubscribe */
async function unsubscribe(request: Request, e: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";
  const page = (title: string, msg: string) =>
    html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="margin:0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f6f7f9;color:#1f2328;display:grid;place-items:center;min-height:100vh">
<div style="background:#fff;border:1px solid #e6e8eb;border-radius:14px;padding:36px;max-width:440px;margin:24px;text-align:center">
<h1 style="font-size:1.4rem;margin:0 0 10px">${title}</h1><p style="margin:0;color:#4b5563;line-height:1.5">${msg}</p></div></body>`);
  if (!token) return page("Nothing to do", "This unsubscribe link is missing its code.");
  if (token === "test")
    return page(
      "Test link",
      "This is the unsubscribe link from a test email. Nothing was changed.",
    );
  if (!Db.available(e))
    return page(
      "Temporarily unavailable",
      'Please reply to the email with "unsubscribe" and we\'ll remove you by hand.',
    );
  const db = new Db(e);
  const en = await db.one<{ id: string; lead_id: string }>(
    "enrollments",
    `unsub_token=eq.${enc(token)}&select=id,lead_id`,
  );
  if (!en)
    return page(
      "Link not recognised",
      'If you still receive emails from us, reply with "unsubscribe" and we\'ll take care of it.',
    );
  const lead = await db.one<{ email: string | null; domain: string | null }>(
    "leads",
    `id=eq.${en.lead_id}&select=email,domain`,
  );
  // Both steps are tried; if either fails the person is told so (never a false "done").
  let saved = true;
  if (lead?.email)
    await addSuppression(db, { email: lead.email, domain: lead.domain, reason: "unsubscribe", note: "link" }).catch((err) => {
      saved = false;
      console.error("unsubscribe: suppression not saved:", (err as Error).message);
    });
  await db
    .update("enrollments", `lead_id=eq.${en.lead_id}&status=in.(queued,active,paused)`, {
      status: "unsubscribed",
    })
    .catch((err) => {
      saved = false;
      console.error("unsubscribe: enrolments not stopped:", (err as Error).message);
    });
  if (!saved)
    return page(
      "Almost done",
      'We couldn\'t finish removing you just now. Please try the link again in a minute, or reply to the email with "unsubscribe" and we\'ll remove you by hand.',
    );
  return page(
    "You're unsubscribed",
    `${lead?.email ? `<strong>${lead.email}</strong> has` : "You have"} been removed. You won't hear from us again.`,
  );
}
