/**
 * Google Places API (New) — Text Search.
 *
 * Why: this is Google's own business directory, with website + phone, and the
 * monthly free allowance covers an agency's normal scraping volume. One Text
 * Search call returns up to 20 businesses; we page up to 3 times per keyword.
 *
 * Secret: GOOGLE_PLACES_API_KEY (Google Cloud → APIs → "Places API (New)").
 * Restrict the key to the Places API (New) only.
 *
 * Field mask note: `websiteUri`, `nationalPhoneNumber`, `rating` and
 * `userRatingCount` are billed at the highest Text Search tier, which is also
 * the smallest free allowance. We ask for them because the website is what the
 * rest of the pipeline (owner + email extraction) runs on. If you ever want to
 * stretch the free tier further, drop those four fields and look up details
 * only for accepted leads.
 */

export interface PlaceBusiness {
  id: string;
  company: string;
  website: string;
  phone: string;
  address: string;
  city: string;
  industry: string;
  rating?: number;
  reviews?: number;
  lat?: number;
  lng?: number;
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
  "places.location",
  "places.businessStatus",
  "nextPageToken",
].join(",");

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
}

export function cleanDomain(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

/** One keyword, one location. Returns up to `max` businesses (max 60). */
export async function placesTextSearch(
  key: string,
  opts: {
    keyword: string;
    location: string;
    max: number;
    /** Optional centre + radius (m) to bias results, e.g. from geocoding. */
    bias?: { lat: number; lng: number; radiusM?: number };
    languageCode?: string;
  },
): Promise<{ businesses: PlaceBusiness[]; error?: string; calls: number }> {
  const out: PlaceBusiness[] = [];
  const seen = new Set<string>();
  const max = Math.min(Math.max(opts.max, 1), 60);
  let pageToken: string | undefined;
  let calls = 0;
  const city = opts.location.split(",")[0]?.trim() || "";

  for (let page = 0; page < 3 && out.length < max; page++) {
    const body: Record<string, unknown> = {
      textQuery: opts.location ? `${opts.keyword} in ${opts.location}` : opts.keyword,
      pageSize: 20,
      languageCode: opts.languageCode || "en",
    };
    if (opts.bias) {
      body.locationBias = {
        circle: {
          center: { latitude: opts.bias.lat, longitude: opts.bias.lng },
          radius: Math.min(Math.max(opts.bias.radiusM ?? 25000, 1000), 50000),
        },
      };
    }
    if (pageToken) body.pageToken = pageToken;

    calls++;
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return { businesses: out, error: `Places ${res.status}: ${detail}`, calls };
    }
    const data = (await res.json()) as { places?: RawPlace[]; nextPageToken?: string };
    for (const p of data.places ?? []) {
      if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      const id =
        p.id || `${(p.displayName?.text || "").toLowerCase()}|${cleanDomain(p.websiteUri)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        company: p.displayName?.text || "",
        website: cleanDomain(p.websiteUri),
        phone: p.nationalPhoneNumber || "",
        address: p.formattedAddress || "",
        city,
        industry: p.primaryTypeDisplayName?.text || opts.keyword,
        rating: p.rating,
        reviews: p.userRatingCount,
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      });
      if (out.length >= max) break;
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { businesses: out, calls };
}
