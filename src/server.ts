import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleApiRequest } from "./lib/api-proxies";
import { resolveIntegrationEnv } from "./lib/integration-settings.server";
import { runTick } from "./lib/tick";
import { MAX_API_BODY_BYTES, MAX_CONTACT_BODY_BYTES, readBoundedBody, securityJson } from "./lib/request-security";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  /**
   * Cloudflare Cron Trigger (wrangler.jsonc, every minute): one background tick —
   * sends due outreach emails (paced by each sequence's gap), syncs inboxes and
   * moves background scans on. The database timer (/api/cron/tick) does the
   * same if the host doesn't run Cloudflare crons.
   */
  async scheduled(
    _event: unknown,
    env: unknown,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ) {
    const e = (env ?? {}) as Record<string, string | undefined>;
    ctx.waitUntil(
      resolveIntegrationEnv(e)
        .then((configured) => runTick(configured, { trigger: "cron", origin: e.PUBLIC_ORIGIN }))
        .then((r) => console.log("[outreach] tick", JSON.stringify({ ...r, dispatch: r.dispatch?.mailboxes })))
        .catch((err) => console.error("[outreach] tick failed", err)),
    );
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const path = new URL(request.url).pathname;
      if (request.body && (path.startsWith("/api/") || path.startsWith("/_serverFn/"))) {
        try {
          await readBoundedBody(request.clone(), path === "/api/public/contact" ? MAX_CONTACT_BODY_BYTES : MAX_API_BODY_BYTES);
        } catch (error) {
          console.error("Request body protection failed:", error instanceof Error ? error.message : "read failure");
          return securityJson({ error: "Request is too large or could not be read." }, 413);
        }
      }
      // In the production build Nitro calls this with the request only; it hangs
      // the Worker's waitUntil (and env) on the request itself. Without it, a
      // closed tab could cut a send in half.
      const cf = request as Request & {
        waitUntil?: (p: Promise<unknown>) => void;
        runtime?: { cloudflare?: { env?: unknown } };
      };
      const given = ctx as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
      const waitCtx =
        typeof given?.waitUntil === "function"
          ? (given as { waitUntil: (p: Promise<unknown>) => void })
          : typeof cf.waitUntil === "function"
            ? { waitUntil: cf.waitUntil }
            : undefined;
      // Same-origin API proxies (Apollo scraper, geocoding, GHL) run first.
      const apiResponse = await handleApiRequest(
        request,
        (env ?? cf.runtime?.cloudflare?.env ?? {}) as Record<string, string | undefined>,
        waitCtx,
      );
      if (apiResponse) return apiResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
