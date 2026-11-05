/**
 * One Google-search helper for both providers we support:
 *   Serper.dev  (SERPER_API_KEY, ~40-char key)   — cheap, preferred
 *   SerpApi.com (64 hex chars)                   — works if that's what you have
 * Returns only the organic results, never provider URLs.
 */

export interface WebHit {
  title: string;
  link: string;
  snippet: string;
}

export function isSerpApiKey(key: string): boolean {
  return /^[0-9a-f]{64}$/i.test(key);
}

export async function webSearch(
  key: string,
  q: string,
  num = 5,
): Promise<{ hits: WebHit[]; error?: string }> {
  try {
    if (isSerpApiKey(key)) {
      const u = new URL("https://serpapi.com/search.json");
      u.searchParams.set("engine", "google");
      u.searchParams.set("q", q);
      u.searchParams.set("num", String(num));
      u.searchParams.set("api_key", key);
      const res = await fetch(u.toString(), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { hits: [], error: `SerpApi ${res.status}` };
      const d = (await res.json()) as {
        organic_results?: { title?: string; link?: string; snippet?: string }[];
      };
      return {
        hits: (d.organic_results ?? []).map((o) => ({
          title: o.title || "",
          link: o.link || "",
          snippet: o.snippet || "",
        })),
      };
    }
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { hits: [], error: `Serper ${res.status}` };
    const d = (await res.json()) as {
      organic?: { title?: string; link?: string; snippet?: string }[];
    };
    return {
      hits: (d.organic ?? []).map((o) => ({
        title: o.title || "",
        link: o.link || "",
        snippet: o.snippet || "",
      })),
    };
  } catch (e) {
    return { hits: [], error: (e as Error).message };
  }
}

const LI_PROFILE = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+/i;

/** Normalise a LinkedIn profile URL (strip tracking, locale subdomain). */
export function cleanLinkedin(url: string): string {
  const m = (url || "").match(LI_PROFILE);
  if (!m) return "";
  return m[0].replace(/^http:/, "https:").replace(/\/\/[a-z]{2,3}\.linkedin/i, "//www.linkedin");
}

/**
 * Find the owner's LinkedIn profile.
 *  - With a known name: `"Jane Doe" "Summit Roofing" site:linkedin.com/in` → the hit whose
 *    title starts with that name.
 *  - Without: `"Summit Roofing" Denver (owner OR founder …) site:linkedin.com/in` → the first
 *    hit whose title has an owner-ish role AND mentions the company.
 */
export async function findOwnerLinkedin(
  key: string,
  p: { company: string; city?: string; name?: string; domain?: string },
): Promise<{ name: string; title: string; linkedin: string } | null> {
  if (!key || !p.company) return null;
  const brand = p.company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")[0];
  const q = p.name
    ? `"${p.name}" "${p.company}" site:linkedin.com/in`
    : `"${p.company}" ${p.city || ""} (owner OR founder OR CEO OR president) site:linkedin.com/in`;
  const { hits } = await webSearch(key, q, 5);
  const OWNERISH =
    /owner|founder|ceo|president|principal|director|managing|partner|proprietor|chief/i;
  for (const r of hits) {
    const link = cleanLinkedin(r.link);
    if (!link) continue;
    const t = r.title.replace(/\s*\|\s*LinkedIn.*$/i, "").replace(/\s*-\s*LinkedIn$/i, "");
    const m = t.match(/^([^-–|]+?)\s*[-–]\s*([^-–|]+?)(?:\s*[-–]\s*(.+))?$/);
    const name = (m ? m[1] : t).trim();
    const title = (m ? m[2] : "").trim();
    const rest = `${m?.[3] || ""} ${r.snippet}`.toLowerCase();
    if (p.name) {
      const first = p.name.toLowerCase().split(/\s+/)[0];
      if (!name.toLowerCase().startsWith(first)) continue;
      if (brand && !rest.includes(brand) && !t.toLowerCase().includes(brand)) continue;
      return { name: p.name, title: title.slice(0, 60), linkedin: link };
    }
    if (!OWNERISH.test(title)) continue;
    if (
      brand &&
      !rest.includes(brand) &&
      !t.toLowerCase().includes(brand) &&
      !(p.domain && r.snippet.toLowerCase().includes(p.domain))
    )
      continue;
    return { name, title: title.slice(0, 60), linkedin: link };
  }
  return null;
}
