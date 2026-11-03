import { Db } from "./db";

type Env = Record<string, string | undefined>;
async function cryptoKey(e: Env) {
  const secret = e.INTEGRATION_SETTINGS_ENCRYPTION_KEY || process.env.INTEGRATION_SETTINGS_ENCRYPTION_KEY;
  if (!secret) throw new Error("Secure integration storage is not available yet.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptCredential(value: string, name: string, e: Env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(name) }, await cryptoKey(e), new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));
}
export async function resolveIntegrationEnv(e: Env): Promise<Env> {
  if (!Db.available(e)) return e;
  const rows = await new Db(e).select<{ name: string; ciphertext: string }>("integration_credentials", "select=name,ciphertext");
  if (!rows.length) return e;
  const key = await cryptoKey(e);
  const resolved = { ...e };
  for (const row of rows) {
    const bytes = Uint8Array.from(atob(row.ciphertext), (c) => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(row.name) }, key, bytes.slice(12));
    resolved[row.name] = new TextDecoder().decode(decrypted);
  }
  return resolved;
}