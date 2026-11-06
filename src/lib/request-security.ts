export const MAX_API_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_CONTACT_BODY_BYTES = 8192;

export function sameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

// Only the hosting edge's IP header is trusted. Forwarded-for is caller-controlled.
export async function requestIpHash(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`inspirova-abuse:${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readBoundedBody(request: Request, maximum: number): Promise<Uint8Array> {
  const advertised = Number(request.headers.get("content-length"));
  if (advertised > maximum) throw new Error("body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export function securityJson(body: unknown, status = 200, retryAfter?: number): Response {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
  } });
}