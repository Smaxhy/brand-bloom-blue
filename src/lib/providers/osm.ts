/**
 * OpenStreetMap (Overpass API) — free business discovery.
 *
 * Zero cost, no key. Coverage of small US service businesses is patchier than
 * Google, but it's a solid free first pass and a good cross-check. We query
 * named POIs inside the geocoded bounding box and match the keyword against the
 * business name and OSM category tags (shop / craft / office / amenity /
 * healthcare), then keep only entries that carry a website or phone so the rest
 * of the pipeline has something to work with.
 *
 * Be polite: Overpass is a shared community server. We send one query per
 * keyword with a 25 s timeout and a descriptive User-Agent.
 */

import { cleanDomain, type PlaceBusiness } from "./places";
import { igHandle, igUrl, listingSocials } from "../instagram";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function esc(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}

/** Build a case-insensitive regex of keyword words for Overpass. */
function kwRegex(keyword: string): string {
  const words = keyword
    .toLowerCase()
    .split(/[\s/&,-]+/)
    .map((w) => w.replace(/s$/, "")) // tree services → tree service
    .filter((w) => w.length > 2);
  return words.length ? words.map(esc).join("|") : esc(keyword.toLowerCase());
}

export async function overpassBusinesses(opts: {
  keyword: string;
  /** [south, north, west, east] */
  bbox: [number, number, number, number];
  city: string;
  max: number;
  /** Overpass server-side timeout; the fetch gives it 5 s more. Default 25. */
  timeoutSec?: number;
}): Promise<{ businesses: PlaceBusiness[]; error?: string }> {
  const tsec = Math.max(5, Math.min(opts.timeoutSec ?? 25, 60));
  const [s, n, w, e] = opts.bbox;
  // Clamp absurdly large boxes (country-level geocodes) to ~60 km around the centre.
  const latC = (s + n) / 2;
  const lngC = (w + e) / 2;
  const half = 0.27; // ≈ 30 km in latitude degrees
  const box = `${Math.max(s, latC - half)},${Math.max(w, lngC - half)},${Math.min(n, latC + half)},${Math.min(e, lngC + half)}`;
  const re = kwRegex(opts.keyword);

  const query = `
[out:json][timeout:${tsec}];
(
  nwr["name"]["name"~"${re}",i](${box});
  nwr["name"]["shop"~"${re}",i](${box});
  nwr["name"]["craft"~"${re}",i](${box});
  nwr["name"]["office"~"${re}",i](${box});
  nwr["name"]["amenity"~"${re}",i](${box});
  nwr["name"]["healthcare"~"${re}",i](${box});
  nwr["name"]["healthcare:speciality"~"${re}",i](${box});
);
out center tags ${Math.min(opts.max * 3, 300)};`;

  let lastErr = "";
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Inspirova-Admin/1.0 (lead research; admin@inspirova.com)",
        },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout((tsec + 5) * 1000),
      });
      if (!res.ok) {
        lastErr = `Overpass ${res.status}`;
        continue;
      }
      const data = (await res.json()) as { elements?: OsmElement[] };
      const seen = new Set<string>();
      const out: PlaceBusiness[] = [];
      for (const el of data.elements ?? []) {
        const t = el.tags ?? {};
        const name = t.name || t["brand"] || "";
        if (!name) continue;
        const rawWebsite = t.website || t["contact:website"] || t.url || "";
        const website = cleanDomain(rawWebsite);
        const phone = t.phone || t["contact:phone"] || "";
        // OpenStreetMap often carries the Instagram itself (a handle or a link).
        const igTag = igHandle(t["contact:instagram"] || t.instagram || "");
        const socials = igTag ? { instagram: igUrl(igTag) } : listingSocials(rawWebsite);
        if (!website && !phone && !socials.instagram) continue; // nothing to work with downstream
        const key = website || name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const addr = [t["addr:housenumber"], t["addr:street"], t["addr:city"], t["addr:postcode"]]
          .filter(Boolean)
          .join(" ");
        out.push({
          id: `osm_${el.type}_${el.id}`,
          company: name,
          website,
          ...socials,
          phone,
          address: addr,
          city: t["addr:city"] || opts.city,
          industry: t.craft || t.shop || t.office || t.healthcare || t.amenity || opts.keyword,
          lat: el.lat ?? el.center?.lat,
          lng: el.lon ?? el.center?.lon,
        });
        if (out.length >= opts.max) break;
      }
      return { businesses: out };
    } catch (err) {
      lastErr = (err as Error).message;
    }
  }
  return { businesses: [], error: lastErr || "Overpass unavailable" };
}
