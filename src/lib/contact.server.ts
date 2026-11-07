import { CONTACT_LIMITS, contactSchema } from "./contact-schema";
import { quoteDetails } from "./quote-services";
import { MAX_CONTACT_BODY_BYTES, readBoundedBody, requestIpHash, sameOriginRequest, securityJson } from "./request-security";

interface ContactDb {
  rpc: (args: { _key: string; _max: number; _window_seconds: number }) => Promise<boolean>;
  insert: (row: { name: string; email: string; company: string | null; message: string; ip_hash: string; kind: string; phone: string; services: ReturnType<typeof quoteDetails>["services"]; estimates: ReturnType<typeof quoteDetails>["estimates"] | null; personal_message: string; attribution: { source: string; medium: string; campaign: string }; consent: boolean; request_key: string }) => Promise<void>;
}

export async function handleContactRequest(request: Request, getDb: () => Promise<ContactDb>): Promise<Response> {
  if (!sameOriginRequest(request)) return securityJson({ error: "Please submit using our website." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return securityJson({ error: "Invalid request." }, 415);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, MAX_CONTACT_BODY_BYTES)));
  } catch (error) {
    const status = error instanceof Error && error.message === "body_too_large" ? 413 : 400;
    return securityJson({ error: status === 413 ? "Your message is too long." : "Invalid request." }, status);
  }
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return securityJson({ error: "Please check your details and consent before submitting." }, 400);
  const data = parsed.data;
  try {
    const db = await getDb();
    const ipHash = await requestIpHash(request);
    const emailDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.email));
    const emailHash = Array.from(new Uint8Array(emailDigest), (b) => b.toString(16).padStart(2, "0")).join("");
    const limits = [
      { _key: `contact:minute:${ipHash}`, _max: CONTACT_LIMITS.minute, _window_seconds: 60 },
      { _key: `contact:hour:${ipHash}`, _max: CONTACT_LIMITS.hour, _window_seconds: 3600 },
      { _key: `contact:email:${emailHash}`, _max: CONTACT_LIMITS.emailHour, _window_seconds: 3600 },
      { _key: "contact:global", _max: CONTACT_LIMITS.globalMinute, _window_seconds: 60 },
    ];
    for (const limit of limits) {
      if ((await db.rpc(limit)) !== true) return securityJson({ error: "Too many requests. Please wait and try again, or e-mail us directly." }, 429, limit._window_seconds);
    }
    const details = quoteDetails(data.services);
    // Identical retries have a stable unique key; changed messages/services remain separate requests.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
    const requestKey = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    await db.insert({ name: data.name, email: data.email, company: data.company || null,
      message: data.kind === "quote" ? `Quote request (contact consent confirmed)\n${data.message}` : data.message, ip_hash: ipHash,
      kind: data.kind, phone: data.phone, services: [...details.services], estimates: data.kind === "quote" && data.services.length ? details.estimates : null,
      personal_message: data.personalMessage, attribution: data.attribution, consent: data.consent === true, request_key: requestKey });
    return securityJson({ ok: true });
  } catch {
    // Never allow unprotected submissions during database/limiter outages.
    return securityJson({ error: "Submissions are temporarily unavailable. Please try again later or e-mail us directly." }, 503, 60);
  }
}