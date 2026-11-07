/**
 * One identity per business, the same in the browser and on the server, so a
 * business found by Google, by the own Maps scraper and by Apify — or in last
 * week's scan — is recognised as the same one.
 *
 * Plain functions only (no server imports): used by the scraper page too.
 */

export function cleanDomain(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .trim()
    .toLowerCase();
}

/** Personal mailbox providers: an address there says nothing about the company. */
export const FREE_MAIL_DOMAINS = new Set(
  "gmail.com googlemail.com yahoo.com yahoo.co.uk yahoo.fr ymail.com rocketmail.com hotmail.com hotmail.be hotmail.fr hotmail.co.uk outlook.com outlook.be live.com live.be live.nl msn.com icloud.com me.com mac.com aol.com comcast.net att.net verizon.net sbcglobal.net bellsouth.net cox.net charter.net centurylink.net frontier.com earthlink.net protonmail.com proton.me mail.com gmx.com gmx.de gmx.net zoho.com yandex.com telenet.be skynet.be proximus.be scarlet.be btinternet.com sky.com orange.fr free.fr wanadoo.fr laposte.net web.de t-online.de".split(
    " ",
  ),
);

/**
 * Sites where many businesses share one domain and only the page path tells
 * them apart (facebook.com/joes-roofing, yelp.com/biz/…). Their domain is not a
 * business identity — and must never be blocked as a "company".
 */
const SHARED_HOSTS = [
  "facebook.com", "fb.com", "fb.me", "instagram.com", "linktr.ee", "linkin.bio", "beacons.ai", "bio.link", "msha.ke",
  "sites.google.com", "google.com", "g.page", "goo.gl", "g.co", "business.google.com",
  "yelp.com", "nextdoor.com", "tiktok.com", "youtube.com", "youtu.be", "linkedin.com", "twitter.com", "x.com", "pinterest.com",
  "houzz.com", "angi.com", "angieslist.com", "homeadvisor.com", "thumbtack.com", "bbb.org", "porch.com", "yellowpages.com",
  "mapquest.com", "manta.com", "bark.com", "buildzoom.com", "alignable.com", "about.me", "squareup.com", "toasttab.com",
  "doordash.com", "ubereats.com", "grubhub.com", "opentable.com", "booksy.com", "vagaro.com", "styleseat.com",
  "calendly.com", "wa.me", "whatsapp.com", "etsy.com", "amazon.com", "ebay.com",
];

export function isSharedHost(domain: string | null | undefined): boolean {
  const d = (domain || "").toLowerCase();
  return !!d && SHARED_HOSTS.some((h) => d === h || d.endsWith(`.${h}`));
}

/** A domain that belongs to ONE company — safe to match on or to block. */
export function isCompanyDomain(domain: string | null | undefined): domain is string {
  const d = (domain || "").toLowerCase().trim();
  return d.includes(".") && !FREE_MAIL_DOMAINS.has(d) && !isSharedHost(d);
}

const LEGAL_SUFFIX = /\b(llc|l l c|inc|incorporated|corp|corporation|co|company|ltd|limited|pllc|plc|lp|llp|bv|bvba|nv|srl|sa|gmbh)\b/g;

/** "Joe's Roofing, LLC" and "Joes Roofing" → "joes roofing". */
export function normCompany(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The local number (last 10 digits), so "+1 (303) 555-0142" equals "303-555-0142". */
export function phoneKey(phone: string | null | undefined): string {
  const d = (phone || "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : "";
}

export interface KeyedBusiness {
  company: string;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
  id?: string;
}

/** The business's own domain when it has one; otherwise name + phone (or name + city). */
export function businessKey(b: KeyedBusiness): string {
  const domain = cleanDomain(b.website);
  if (isCompanyDomain(domain)) return domain;
  const name = normCompany(b.company);
  if (!name) return domain && !isSharedHost(domain) ? domain : b.id || "";
  return `${name}|${phoneKey(b.phone) || normCompany(b.city)}`;
}

/**
 * How the key used to be built — still matched, so businesses remembered before
 * this change stay "seen". Never the bare shared host (that made every Facebook
 * page look like the same business).
 */
export function legacyBusinessKey(b: KeyedBusiness): string {
  const domain = cleanDomain(b.website);
  if (domain) return isSharedHost(domain) ? "" : domain;
  return `${(b.company || "").toLowerCase()}|${(b.phone || "").replace(/\D/g, "")}`;
}
