/**
 * Google OAuth for connecting Workspace mailboxes.
 *
 * Setup (once, in the same Google Cloud project as the Places key):
 *   APIs & Services → OAuth consent screen → User type: INTERNAL (your
 *   Workspace org). Internal apps need no Google verification, and tokens
 *   don't expire after 7 days the way "Testing" mode tokens do.
 *   Credentials → OAuth client ID → Web application →
 *   Authorised redirect URI: https://<your-domain>/api/google/oauth/callback
 *   Enable the "Gmail API".
 *
 * Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, CRON_SECRET (signs state).
 *
 * Scopes: gmail.send (send), gmail.readonly (detect replies + bounces), email.
 */

import { Db, enc } from "./db";

type Env = Record<string, string | undefined>;
const env = (e: Env, k: string) => e[k] || process.env?.[k];

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

/**
 * What Google actually granted. Its consent screen lets people untick boxes, so
 * a mailbox can come back "connected" without the right to send or to read —
 * and then fails later with a 403 nobody understands. `known` is false when
 * Google didn't say (older responses): then nothing is assumed.
 */
export function grantedGmailAccess(scope: string | null | undefined): { known: boolean; send: boolean; read: boolean } {
  const granted = (scope || "").split(/\s+/).filter(Boolean);
  if (!granted.length) return { known: false, send: true, read: true };
  const has = (name: string) => granted.includes(`https://www.googleapis.com/auth/${name}`);
  const all = granted.includes("https://mail.google.com/");
  return {
    known: true,
    send: all || has("gmail.send") || has("gmail.compose") || has("gmail.modify"),
    read: all || has("gmail.readonly") || has("gmail.modify"),
  };
}

async function hmac(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function stateKey(e: Env): string {
  return env(e, "CRON_SECRET") || env(e, "GOOGLE_OAUTH_CLIENT_SECRET") || "dev-state-key";
}

/** Signed, time-limited state so the public callback can trust who started the flow. */
export async function makeState(e: Env, userId: string): Promise<string> {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${await hmac(stateKey(e), payload)}`;
}

export async function readState(e: Env, state: string): Promise<{ userId: string } | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, ts, sig] = parts;
  if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
  if ((await hmac(stateKey(e), `${userId}.${ts}`)) !== sig) return null;
  return { userId };
}

/**
 * Must match an "Authorised redirect URI" on the Google OAuth client exactly.
 * When PUBLIC_ORIGIN is set we always use it, so the registered URI is one
 * stable value no matter which URL the admin was opened from (custom domain,
 * Lovable preview, localhost).
 */
export function redirectUri(request: Request, e?: Env): string {
  const fixed = e ? env(e, "PUBLIC_ORIGIN") : undefined;
  const origin = (fixed || "").replace(/\/$/, "") || new URL(request.url).origin;
  return `${origin}/api/google/oauth/callback`;
}

export function consentUrl(e: Env, request: Request, state: string): string | null {
  const clientId = env(e, "GOOGLE_OAUTH_CLIENT_ID");
  if (!clientId) return null;
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri(request, e));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GMAIL_SCOPES);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent"); // always get a refresh token
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(e: Env, request: Request, code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env(e, "GOOGLE_OAUTH_CLIENT_ID") || "",
      client_secret: env(e, "GOOGLE_OAUTH_CLIENT_SECRET") || "",
      redirect_uri: redirectUri(request, e),
      grant_type: "authorization_code",
    }),
  });
  return (await res.json()) as TokenResponse;
}

export async function userEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const j = (await res.json()) as { email?: string };
  return j.email || "";
}

/**
 * Get a valid access token for a mailbox, refreshing and persisting when needed.
 * `fresh` skips the stored one (Google just refused it) and asks for a new token.
 */
export async function accessTokenFor(e: Env, db: Db, mailboxId: string, fresh = false): Promise<string> {
  const tok = await db.one<{
    refresh_token: string;
    access_token: string | null;
    expires_at: string | null;
  }>(
    "mailbox_tokens",
    `mailbox_id=eq.${enc(mailboxId)}&select=refresh_token,access_token,expires_at`,
  );
  if (!tok) throw new Error("mailbox not connected");
  if (
    !fresh &&
    tok.access_token &&
    tok.expires_at &&
    new Date(tok.expires_at).getTime() - Date.now() > 60_000
  )
    return tok.access_token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tok.refresh_token,
      client_id: env(e, "GOOGLE_OAUTH_CLIENT_ID") || "",
      client_secret: env(e, "GOOGLE_OAUTH_CLIENT_SECRET") || "",
      grant_type: "refresh_token",
    }),
  });
  const j = (await res.json()) as TokenResponse;
  if (!res.ok || !j.access_token) {
    await db.update("mailboxes", `id=eq.${enc(mailboxId)}`, {
      status: "error",
      last_error: "Cannot send: Google access for this mailbox expired or was withdrawn. Reconnect it in Settings → Sending mailboxes.",
    });
    throw new Error(`token refresh failed: ${j.error || res.status}`);
  }
  await db.update("mailbox_tokens", `mailbox_id=eq.${enc(mailboxId)}`, {
    access_token: j.access_token,
    expires_at: new Date(Date.now() + (j.expires_in - 30) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return j.access_token;
}
