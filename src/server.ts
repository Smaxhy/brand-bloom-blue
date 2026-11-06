import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleApiRequest } from "./lib/api-proxies";
import { runDispatch } from "./lib/sequencer";
import { resolveIntegrationEnv } from "./lib/integration-settings.server";

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
  /** Cloudflare Cron Trigger (see wrangler.jsonc) — sends due outreach steps and syncs inboxes. */
  async scheduled(
    _event: unknown,
    env: unknown,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ) {
    const e = (env ?? {}) as Record<string, string | undefined>;
    ctx.waitUntil(
      resolveIntegrationEnv(e).then((configured) => runDispatch(configured, { origin: e.PUBLIC_ORIGIN, source: "cron" }))
        .then((r) => console.log("[outreach] dispatch", JSON.stringify(r)))
        .catch((err) => console.error("[outreach] dispatch failed", err)),
    );
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Same-origin API proxies (Apollo scraper, geocoding, GHL) run first.
      const apiResponse = await handleApiRequest(
        request,
        new URL(request.url).pathname.startsWith("/api/") && new URL(request.url).pathname !== "/api/health"
          ? await resolveIntegrationEnv((env ?? {}) as Record<string, string | undefined>)
          : (env ?? {}) as Record<string, string | undefined>,
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
