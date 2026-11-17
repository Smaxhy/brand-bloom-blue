/**
 * What a shop tells about itself beyond "it sells online": where it is based,
 * how big and how fresh its catalogue is, and whether it really sells what the
 * scan asked for. Everything here is read from the shop's own public pages and
 * the two public files every Shopify shop publishes (/meta.json and
 * /products.json). Nothing is guessed from outside, and nothing is contacted.
 * Pure functions, covered by tests.
 */
import type { EcomMarket, EcomNiche } from "./ecom-brands";

/* ------------------------------------------------------------- countries */

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
  IE: "Ireland",
  BE: "Belgium",
  NL: "Netherlands",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  PT: "Portugal",
  AT: "Austria",
  CH: "Switzerland",
  SE: "Sweden",
  DK: "Denmark",
  NO: "Norway",
  FI: "Finland",
  PL: "Poland",
  CN: "China",
  HK: "Hong Kong",
  TW: "Taiwan",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  IN: "India",
  PK: "Pakistan",
  AE: "United Arab Emirates",
  TR: "Turkey",
  IL: "Israel",
  ZA: "South Africa",
  BR: "Brazil",
  MX: "Mexico",
};

/** "United States" for "US"; the code itself for a country without a name here. */
export const countryName = (code: string | undefined | null): string => {
  const c = String(code || "").toUpperCase();
  return COUNTRY_NAMES[c] ?? c;
};

/** The country as it follows "in": "the United States", "Canada". */
export const countryIn = (code: string | undefined | null): string => {
  const name = countryName(code);
  return /^(?:United|Netherlands)/.test(name) ? `the ${name}` : name;
};

/** Other ways a page writes a country, lower-case, mapped to its code. */
const COUNTRY_WORDS: Record<string, string[]> = {
  US: ["usa", "u.s.a.", "u.s.a", "united states", "united states of america", "america"],
  GB: ["uk", "u.k.", "united kingdom", "great britain", "britain", "england", "scotland", "wales"],
  CA: ["canada"],
  AU: ["australia"],
  NZ: ["new zealand"],
  IE: ["ireland"],
  BE: ["belgium", "belgië", "belgie", "belgique"],
  NL: ["netherlands", "the netherlands", "nederland", "holland"],
  DE: ["germany", "deutschland"],
  FR: ["france"],
  ES: ["spain", "españa"],
  IT: ["italy", "italia"],
  CN: ["china", "prc"],
  HK: ["hong kong"],
  IN: ["india"],
  PK: ["pakistan"],
  JP: ["japan"],
  KR: ["south korea", "korea"],
  TR: ["turkey", "türkiye"],
};

/** A country as a page or a shop file writes it ("US", "usa", "United States") → "US"; "" when it is not one. */
export function countryCode(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 40) return "";
  // Any two letters are a country code: a shop registered in Vietnam is still "somewhere else".
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase() === "UK" ? "GB" : raw.toUpperCase();
  const lower = raw.toLowerCase();
  for (const [code, name] of Object.entries(COUNTRY_NAMES))
    if (name.toLowerCase() === lower) return code;
  for (const [code, words] of Object.entries(COUNTRY_WORDS)) if (words.includes(lower)) return code;
  return "";
}

/** Web addresses that belong to one country. `.com`, `.co`, `.io` and the like say nothing. */
const COUNTRY_ENDINGS: [RegExp, string][] = [
  [/\.us$/, "US"],
  [/\.(?:co\.uk|org\.uk|uk)$/, "GB"],
  [/\.ca$/, "CA"],
  [/\.(?:com\.au|net\.au|au)$/, "AU"],
  [/\.(?:co\.nz|nz)$/, "NZ"],
  [/\.ie$/, "IE"],
  [/\.be$/, "BE"],
  [/\.nl$/, "NL"],
  [/\.de$/, "DE"],
  [/\.fr$/, "FR"],
  [/\.es$/, "ES"],
  [/\.it$/, "IT"],
  [/\.pt$/, "PT"],
  [/\.at$/, "AT"],
  [/\.ch$/, "CH"],
  [/\.se$/, "SE"],
  [/\.dk$/, "DK"],
  [/\.no$/, "NO"],
  [/\.fi$/, "FI"],
  [/\.pl$/, "PL"],
  [/\.(?:com\.cn|cn)$/, "CN"],
  [/\.(?:com\.hk|hk)$/, "HK"],
  [/\.(?:co\.jp|jp)$/, "JP"],
  [/\.(?:co\.kr|kr)$/, "KR"],
  [/\.(?:com\.sg|sg)$/, "SG"],
  [/\.(?:co\.in|in)$/, "IN"],
  [/\.(?:co\.za|za)$/, "ZA"],
  [/\.(?:com\.br|br)$/, "BR"],
  [/\.(?:com\.mx|mx)$/, "MX"],
];

/**
 * Web addresses that leave no doubt: a country's own ending for companies, or
 * the ending of a country whose letters are not used to spell words (.it, .at,
 * .in, .be and .fi are: "wear.it"). The country ("GB"), or "" for any other.
 */
export function plainCountryEnding(domain: string): string {
  const host = String(domain || "").toLowerCase();
  if (!/\.(?:co|com|org|net)\.[a-z]{2}$|\.(?:uk|de|fr|nl|ca|au|nz|jp|cn|kr|br|mx)$/.test(host))
    return "";
  return COUNTRY_ENDINGS.find(([re]) => re.test(host))?.[1] ?? "";
}

const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};
const STATE_CODES = Object.keys(US_STATES).join("|");
/** Longest first, so "West Virginia" is not read as "Virginia". */
const STATE_NAMES = Object.values(US_STATES)
  .sort((a, b) => b.length - a.length)
  .join("|");
const STATE_BY_NAME = new Map(Object.values(US_STATES).map((name) => [name.toLowerCase(), name]));
/** "TX" or "texas" → "Texas". */
const stateName = (value: string): string =>
  US_STATES[value.toUpperCase()] ?? STATE_BY_NAME.get(value.toLowerCase()) ?? value;
const TOWN = "[A-Z][A-Za-z.'\\u2019-]+(?: [A-Z][A-Za-z.'\\u2019-]+){0,3}";

/** "Austin, TX 78701" or "Austin, Texas 78701": a town, a state and a ZIP code, as American addresses end. */
const US_ADDRESS = new RegExp(
  `\\b(${TOWN}),? (${STATE_CODES}|${STATE_NAMES})\\.?,? (\\d{5})(?:-\\d{4})?\\b`,
);
/** The words of a street line that can stand in front of a town: "500 Main Street Austin". */
const STREET_WORDS =
  /^.*\b(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Suite|Ste|Unit|Floor|Box|Highway|Hwy|Parkway|Pkwy|Court|Ct|Place|Pl|Building|Bldg)\b\.?,? ?/;
/** "500 Main Street Austin" → "Austin"; "AUSTIN" → "Austin". */
const townOnly = (town: string): string => {
  const name = town.replace(STREET_WORDS, "").trim();
  return /[a-z]/.test(name)
    ? name
    : name.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
};
const CA_PROVINCES: Record<string, string> = {
  ON: "Ontario",
  BC: "British Columbia",
  QC: "Quebec",
  AB: "Alberta",
  MB: "Manitoba",
  SK: "Saskatchewan",
  NS: "Nova Scotia",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  PE: "Prince Edward Island",
  YT: "Yukon",
  NT: "Northwest Territories",
  NU: "Nunavut",
};
const CA_ADDRESS =
  /\b([A-Z][A-Za-z.'’-]+(?: [A-Z][A-Za-z.'’-]+){0,3}),? (ON|BC|QC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU),? ([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d)\b/;
const AU_ADDRESS =
  /\b([A-Z][A-Za-z.'’-]+(?: [A-Z][A-Za-z.'’-]+){0,3}),? (NSW|VIC|QLD|WA|SA|TAS|ACT|NT),? (\d{4})\b/;
/** A British postcode next to the country's name: postcodes alone look like product codes. */
const GB_ADDRESS =
  /\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b[\s\S]{0,40}\b(?:United Kingdom|UK|England|Scotland|Wales)\b|\b(?:United Kingdom|England|Scotland|Wales)\b[\s\S]{0,40}\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/;
/** Company numbers only one country hands out. */
const COMPANY_IDS: [RegExp, string, string][] = [
  [/\bBE ?0\d{3}[. ]?\d{3}[. ]?\d{3}\b/, "BE", "a Belgian company number on their site"],
  [/\bKvK(?:[- ]?nummer)?:? ?\d{8}\b/i, "NL", "a Dutch Chamber of Commerce number on their site"],
  [/\bNL\d{9}B\d{2}\b/, "NL", "a Dutch VAT number on their site"],
  [
    /\b(?:USt\.?-?Id\.?-?Nr\.?|Umsatzsteuer-?ID):? ?DE ?\d{9}\b/i,
    "DE",
    "a German VAT number on their site",
  ],
  [
    /\bSIRE[TN]:? ?\d{3} ?\d{3} ?\d{3}(?: ?\d{5})?\b/i,
    "FR",
    "a French company number on their site",
  ],
  [/\bABN:? ?\d{2} ?\d{3} ?\d{3} ?\d{3}\b/, "AU", "an Australian business number on their site"],
  [
    /\bregistered in (?:England(?: (?:and|&) Wales)?|Scotland|Wales|Northern Ireland)\b/i,
    "GB",
    "a UK company registration on their site",
  ],
  [/\bVAT\b[^.\n]{0,24}?\bGB ?\d{3} ?\d{4} ?\d{2}\b/i, "GB", "a UK VAT number on their site"],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A shop saying where it is. Two kinds of line, because they mean different
 * things: "based in Canada" or "ships from the UK" is where the brand is;
 * "made in Italy" is where the goods come from, which a brand in New York says
 * just as well. So a "made in" line only settles it for the country the scan
 * asked for.
 */
const MADE_WORDS =
  "made|handmade|hand[- ]?crafted|crafted|designed|printed|manufactured|assembled|sewn|roasted|brewed|poured|bottled";
/** Where a brand is, rather than where its goods come from. */
const BASE_WORDS = "based|located|headquartered|operated|founded|established";
/**
 * "made in", "based out of", "ships from": the words in front of a place.
 * Group 1 is the verb. Group 3 is the line of a shop's terms that names whose
 * law it trades under ("governed by the laws of the State of Texas"): that is
 * where the business is at home.
 */
const SAYS = new RegExp(
  "\\b(?:" +
    // "made in", "designed and printed in", "made in small batches in", "proudly based out of"
    `(${BASE_WORDS}|${MADE_WORDS})` +
    "(?: and (?:operated|based|made|printed|shipped|sewn|designed))?" +
    "(?: in small batches| by hand| with love| on demand| to order)?" +
    "(?: right| here| entirely| proudly| locally| exclusively)*(?: in| out of| from)" +
    // "ships from", "shipped directly from", "ships from our warehouse in"
    "|(ship(?:s|ped|ping)?(?: directly| straight| daily| out)? (?:from|out of)|dispatched from|sent from)(?: our [a-z]+(?: [a-z]+)? in)?" +
    "|(governed\\b[^.\\n]{0,70}?\\blaws of)" +
    ")(?: the)?(?: (?:state|commonwealth|province|heart|city) of)?(?: beautiful| sunny| downtown)? ",
  "gi",
);
/** After "the laws of": any state or province by its full name. "The State of Georgia" is not the country. */
const LAW_AFTER: [RegExp, string, (name: string) => string][] = [
  [new RegExp(`^(?:${STATE_NAMES})(?![\\p{L}\\p{N}])`, "iu"), "US", (name) => stateName(name)],
  [
    new RegExp(
      `^(?:${Object.values(CA_PROVINCES)
        .sort((a, b) => b.length - a.length)
        .join("|")})(?![\\p{L}\\p{N}])`,
      "iu",
    ),
    "CA",
    (name) =>
      Object.values(CA_PROVINCES).find((p) => p.toLowerCase() === name.toLowerCase()) ?? name,
  ],
];
const IS_MADE = new RegExp(`^(?:${MADE_WORDS})$`, "i");
const TOWN_THEN = /^(\p{Lu}[\p{L}.'\u2019-]+(?: \p{Lu}[\p{L}.'\u2019-]+){0,2}), /u;
const US_SHORT =
  /^U\.?S\.?(?![\p{L}\p{N}])(?! (?:siz|dollar|standard|customs|store|site|website|market))/u;
/** Every way a country is written, the longest first: "united states of america" before "united states". */
const COUNTRY_AFTER: [RegExp, string][] = Object.keys(COUNTRY_NAMES).map((code) => {
  const words = [
    ...new Set([COUNTRY_NAMES[code].toLowerCase(), ...(COUNTRY_WORDS[code] ?? [])]),
  ].sort((a, b) => b.length - a.length);
  return [new RegExp(`^(?:${words.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "iu"), code];
});

/** Big American towns a brand names itself after. "Portland" is in Oregon and in Maine: American either way. */
const US_CITY_NAMES =
  "New York City|NYC|Los Angeles|San Francisco|San Diego|San Antonio|San Jose|Salt Lake City|Las Vegas|SoCal|NorCal|Brooklyn|Miami|Austin|Houston|Dallas|Denver|Seattle|Chicago|Atlanta|Nashville|Phoenix|Boston|Philadelphia|Portland|Detroit|Minneapolis|Charlotte|Orlando|Tampa|Pittsburgh|Sacramento|Honolulu|Asheville|Boulder";
/** States that are also a country or a first name: never read on their own, only in an address. */
const STATES_ALONE = Object.values(US_STATES)
  .filter((name) => name !== "Georgia" && name !== "Virginia")
  .sort((a, b) => b.length - a.length)
  .join("|");
const US_AFTER: [RegExp, (m: RegExpExecArray) => string][] = [
  // "Portland, Oregon" and "Oregon"
  [
    new RegExp(`^(?:(${TOWN}), )?(${STATES_ALONE})(?![\\p{L}\\p{N}])`, "u"),
    (m) => [m[1], stateName(m[2])].filter(Boolean).join(", "),
  ],
  [new RegExp(`^(?:${STATES_ALONE})(?![\\p{L}\\p{N}])`, "iu"), (m) => stateName(m[0])],
  // "Austin, TX": a state code only counts in capitals, after a town
  [
    new RegExp(`^(${TOWN}), (${STATE_CODES})(?![\\p{L}\\p{N}])`, "u"),
    (m) => `${m[1]}, ${stateName(m[2])}`,
  ],
  [new RegExp(`^(?:${US_CITY_NAMES})(?![\\p{L}\\p{N}])`, "iu"), (m) => m[0]],
];

interface SaidPlace {
  country: string;
  /** "Portland, Oregon" when the line names a place. */
  place: string;
  /** A "made in" line rather than a "based in" one. */
  made: boolean;
  /** The line itself, for showing what the country was read from: "handmade in Portland, Oregon". */
  quote: string;
}

/** The places of the asked country a brand may name, the longest first. */
const placesOf = (market?: Pick<EcomMarket, "id" | "regions"> | null): string[] =>
  (market?.regions ?? [])
    .flat()
    .filter((name) => !/^(?:Georgia|Virginia|Victoria)$/.test(name))
    .sort((a, b) => b.length - a.length);

/**
 * Every "made in …", "based in …" or "ships from …" line in a text that names
 * a country, or a place of the country the scan asked for.
 */
function saidPlaces(text: string, market?: Pick<EcomMarket, "id" | "regions"> | null): SaidPlace[] {
  const out: SaidPlace[] = [];
  const home = (market?.id ?? "").toUpperCase();
  const homePlaces = home && home !== "US" ? placesOf(market) : [];
  const homeAfter = homePlaces.length
    ? new RegExp(`^(?:${homePlaces.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "iu")
    : null;
  const add = (country: string, place: string, head: RegExpExecArray, tail: string) => {
    const made = IS_MADE.test(head[1] ?? "");
    if (out.some((s) => s.country === country && s.made === made)) return;
    // Of a line from a shop's terms, the part that matters: "laws of the State of Texas".
    const lead = head[3] ? head[0].slice(head[0].toLowerCase().lastIndexOf("laws of")) : head[0];
    out.push({
      country,
      place,
      made,
      quote: `${lead}${tail}`.replace(/\s+/g, " ").trim().slice(0, 70),
    });
  };
  SAYS.lastIndex = 0;
  for (let n = 0, head = SAYS.exec(text); head && n < 60; n++, head = SAYS.exec(text)) {
    const rest = text.slice(head.index + head[0].length, head.index + head[0].length + 80);
    if (head[3]) {
      // Whose law a shop trades under: a state or a province is named in full, whatever country was asked for.
      const law = LAW_AFTER.find(([re]) => re.test(rest));
      const m = law?.[0].exec(rest);
      // "The laws of the State of Georgia" is America; "the laws of Georgia" may be the country.
      const stated = /(?:state|commonwealth) of $/i.test(head[0]);
      if (law && m && (stated || !/^(?:georgia|virginia)$/i.test(m[0]))) {
        add(law[1], law[2](m[0]), head, m[0]);
        continue;
      }
    }
    const named = COUNTRY_AFTER.find(([re]) => re.test(rest));
    if (named) {
      add(named[1], "", head, named[0].exec(rest)?.[0] ?? "");
      continue;
    }
    // "Based in Shenzhen, China": a town first, then its country.
    const town = TOWN_THEN.exec(rest);
    const after = town ? rest.slice(town[0].length) : "";
    const abroad = town ? COUNTRY_AFTER.find(([re]) => re.test(after)) : undefined;
    if (town && abroad) {
      add(abroad[1], town[1], head, `${town[0]}${abroad[0].exec(after)?.[0] ?? ""}`);
      continue;
    }
    // "Ships from the US": the two letters only in capitals, and not "US sizes" or "US dollars".
    const us = US_SHORT.exec(rest);
    if (us) {
      add("US", "", head, us[0]);
      continue;
    }
    if (head[3]) continue;
    if (home === "US") {
      for (const [re, place] of US_AFTER) {
        const m = re.exec(rest);
        if (!m) continue;
        add("US", place(m), head, m[0]);
        break;
      }
    } else if (homeAfter) {
      const m = homeAfter.exec(rest);
      if (m)
        add(
          home,
          homePlaces.find((p) => p.toLowerCase() === m[0].toLowerCase()) ?? m[0],
          head,
          m[0],
        );
    }
  }
  // "A Brooklyn-based brand": one of the asked country's places, said the short way.
  const local =
    home === "US" ? `${STATES_ALONE}|${US_CITY_NAMES}|LA` : homePlaces.map(escapeRe).join("|");
  const nearby = local
    ? new RegExp(`(?<![\\p{L}\\p{N}])(${local})[- ]based(?![\\p{L}\\p{N}])`, "iu").exec(text)
    : null;
  if (nearby && !out.some((s) => s.country === home && !s.made))
    out.push({
      country: home,
      place:
        home === "US"
          ? /^la$/i.test(nearby[1])
            ? "Los Angeles"
            : (STATE_BY_NAME.get(nearby[1].toLowerCase()) ?? nearby[1])
          : (homePlaces.find((p) => p.toLowerCase() === nearby[1].toLowerCase()) ?? nearby[1]),
      made: false,
      quote: nearby[0],
    });
  // "US-based" is where the brand is; "American-made" is where the goods come from.
  // The short names only in capitals: "contact us based on your order" is not a country.
  const short: [RegExp, string, boolean][] = [
    [/\b(?:US|USA|U\.S\.)[- ]based\b/, "US", false],
    [/\b(?:American|USA)[- ]made\b/i, "US", true],
    [/\bUK[- ]based\b/, "GB", false],
    [/\bBritish[- ]made\b/i, "GB", true],
    [/\bCanadian[- ](?:owned|based)\b/i, "CA", false],
    [/\bCanadian[- ]made\b/i, "CA", true],
    [/\bAustralian[- ](?:owned|based)\b/i, "AU", false],
    [/\bAustralian[- ]made\b/i, "AU", true],
  ];
  for (const [re, country, made] of short) {
    const m = re.exec(text);
    if (m && !out.some((s) => s.country === country && s.made === made))
      out.push({ country, place: "", made, quote: m[0] });
  }
  return out;
}

/**
 * Phone numbers written with their country code. The "+" (or "00") is
 * required: without it an American number such as 860-555-0100 would read as
 * China's code 86.
 */
const PHONE_CODES: [RegExp, string][] = [
  [/^(?:\+|00) ?44[\s(.-]?\d/, "GB"],
  [/^(?:\+|00) ?61[\s(.-]?\d/, "AU"],
  [/^(?:\+|00) ?32[\s(.-]?\d/, "BE"],
  [/^(?:\+|00) ?31[\s(.-]?\d/, "NL"],
  [/^(?:\+|00) ?49[\s(.-]?\d/, "DE"],
  [/^(?:\+|00) ?33[\s(.-]?\d/, "FR"],
  [/^(?:\+|00) ?86[\s(.-]?\d/, "CN"],
  [/^(?:\+|00) ?91[\s(.-]?\d/, "IN"],
];
/**
 * Currencies that hint at a country. Not the dollar: shops everywhere price in
 * US dollars, so it says nothing about where one is.
 */
const CURRENCY_HOME: Record<string, string> = {
  GBP: "GB",
  CAD: "CA",
  AUD: "AU",
  NZD: "NZ",
  INR: "IN",
  JPY: "JP",
  CNY: "CN",
};
const LOCALE_HOME = /\b(?:lang|locale)["'=:\s]+["']?[a-z]{2}[-_](GB|AU|CA|NZ|IE|BE|NL|DE|FR|IN)\b/i;

/**
 * A page's HTML as the text a visitor reads, with one space between words. For
 * a long page the top and the bottom are kept: a shop's address is in its
 * footer, which a cut after the first screens of text would lose.
 */
export function pageText(html: string, max = 24_000): string {
  const text = String(html || "")
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr|address|section|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n[ \n]*/g, "\n")
    .trim();
  const half = Math.floor(max / 2);
  return text.length <= max ? text : `${text.slice(0, half)}\n${text.slice(-half)}`;
}

/* ----------------------------------------------------- Shopify's own files */

export interface ShopMeta {
  name: string;
  /** Where the business behind the shop is registered: "US". */
  country: string;
  province: string;
  city: string;
  currency: string;
  /** Country codes it delivers to (empty when the shop does not say). */
  shipsTo: string[];
  /** Products in the shop, when the file says so. */
  products: number | null;
  about: string;
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** What a Shopify shop's /meta.json says. Every field is "" (or null) when the file is missing or says nothing. */
export function shopifyMeta(json: unknown): ShopMeta {
  const m =
    json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  const count = m.published_products_count;
  return {
    name: str(m.name, 80),
    country: countryCode(m.country),
    province: str(m.province, 60),
    city: str(m.city, 60),
    currency: /^[A-Za-z]{3}$/.test(str(m.currency, 8)) ? str(m.currency, 8).toUpperCase() : "",
    shipsTo: Array.isArray(m.ships_to_countries)
      ? m.ships_to_countries
          .filter((c): c is string => typeof c === "string" && /^[A-Za-z]{2}$/.test(c))
          .map((c) => c.toUpperCase())
          .slice(0, 260)
      : [],
    products:
      typeof count === "number" && Number.isFinite(count) && count >= 0 ? Math.round(count) : null,
    about: str(m.description, 200),
  };
}

export interface ShopCatalog {
  /** Products in the sample that was read. */
  sample: number;
  /** The sample is the whole shop: it has fewer products than were asked for. */
  whole: boolean;
  /** The price range most of its products sit in, in the shop's own currency. */
  priceFrom: number | null;
  priceTo: number | null;
  /** The day its newest product was added (YYYY-MM-DD); "" when unknown. */
  newest: string;
  /**
   * The day a product last changed (YYYY-MM-DD); "" when unknown. Shopify
   * moves this date on every edit and every stock change, so a shop where it
   * is a year old sells nothing any more.
   */
  updated: string;
  /** What it calls its kinds of product, the most used first. */
  types: string[];
  /** Product names, kinds and tags as one lower-case text, for matching the niche. */
  words: string;
  /** Lower-case product names, one per product. */
  titles: string[];
}

/** How many products a scan asks a shop for: enough for its prices and its kinds of product, small enough to read fast. */
export const CATALOG_SAMPLE = 40;

/** What a Shopify shop's /products.json says about its catalogue. Empty when the file is missing. */
export function shopifyCatalog(json: unknown, asked = CATALOG_SAMPLE): ShopCatalog {
  const list =
    json && typeof json === "object" && Array.isArray((json as { products?: unknown }).products)
      ? ((json as { products: unknown[] }).products.filter(
          (p) => p && typeof p === "object",
        ) as Record<string, unknown>[])
      : [];
  const prices: number[] = [];
  const types = new Map<string, number>();
  const titles: string[] = [];
  const words: string[] = [];
  let newest = 0;
  let updated = 0;
  const day = (at: number) => (at ? new Date(at).toISOString().slice(0, 10) : "");
  for (const p of list.slice(0, 250)) {
    const title = str(p.title, 120).toLowerCase();
    if (title) titles.push(title);
    const type = str(p.product_type, 40);
    if (type) types.set(type, (types.get(type) ?? 0) + 1);
    const tags = Array.isArray(p.tags)
      ? p.tags.filter((t): t is string => typeof t === "string").join(" ")
      : str(p.tags, 200);
    words.push(title, type.toLowerCase(), tags.toLowerCase().slice(0, 200));
    const variants = (Array.isArray(p.variants) ? p.variants : []).filter(
      (v): v is Record<string, unknown> => !!v && typeof v === "object",
    );
    const lowest = variants
      .map((v) => Number.parseFloat(String(v.price ?? "")))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)[0];
    if (lowest) prices.push(lowest);
    for (const key of ["published_at", "created_at"]) {
      const at = Date.parse(str(p[key], 40));
      if (Number.isFinite(at) && at > newest) newest = at;
    }
    for (const at of [p.updated_at, ...variants.slice(0, 20).map((v) => v.updated_at)].map((v) =>
      Date.parse(str(v, 40)),
    ))
      if (Number.isFinite(at) && at > updated) updated = at;
  }
  prices.sort((a, b) => a - b);
  // With a real catalogue, the cheapest and dearest tenth are left out: a sticker and a bundle say little.
  const cut = prices.length >= 10 ? Math.floor(prices.length / 10) : 0;
  const range = prices.slice(cut, prices.length - cut);
  return {
    sample: list.length,
    whole: list.length > 0 && list.length < asked,
    priceFrom: range.length ? range[0] : null,
    priceTo: range.length ? range[range.length - 1] : null,
    newest: day(newest),
    // A product cannot have changed before it was added.
    updated: day(Math.max(updated, newest)),
    types: [...types.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t),
    words: words.filter(Boolean).join(" ").slice(0, 6000),
    titles: titles.slice(0, 250),
  };
}

/* ------------------------------------------------------ where a shop is based */

export interface StorePlace {
  /** "US", or "" when the shop does not say where it is. */
  country: string;
  /** The shop itself says so (its shop file, its address, its company number, its web address). */
  sure: boolean;
  /** "Austin, Texas" when a town or region is known. */
  place: string;
  /** In plain words, what the country was read from. */
  why: string;
}

const NOWHERE: StorePlace = { country: "", sure: false, place: "", why: "" };

/**
 * The postal addresses in a page's own data (schema.org), each as the text of
 * its object. Only these: "addressCountry" also stands in the list of
 * countries a shop delivers to, which says where its customers are, not where
 * the shop is.
 */
function postalAddresses(html: string): string[] {
  const out: string[] = [];
  const type = /"@type"\s*:\s*"PostalAddress"/gi;
  for (let m = type.exec(html), n = 0; m && n < 8; m = type.exec(html), n++) {
    const open = html.lastIndexOf("{", m.index);
    if (open < 0 || m.index - open > 600 || html.slice(open, m.index).includes("}")) continue;
    // Up to the brace that closes it; the country may be an object of its own inside.
    let depth = 0;
    for (let i = open; i < Math.min(html.length, open + 1500); i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}" && --depth === 0) {
        out.push(html.slice(open, i + 1));
        break;
      }
    }
  }
  return out;
}

/**
 * Where a shop is based, from what the shop itself publishes. The strongest
 * sign wins: its Shopify shop file, the address in its page data, a postal
 * address or company number, its country web address, then what it says about
 * itself ("based in Austin, Texas", "made in the USA"). A phone code, a
 * currency or a language only count together with something else, and never
 * make it sure. Neither does a "made in" line about another country than the
 * one the scan asked for: a brand in Brooklyn has things made in Portugal.
 */
export function storePlace(input: {
  domain: string;
  pages?: { path: string; html: string }[];
  /** The plain text of the pages that were read; made from `pages` when left out. */
  text?: string;
  phones?: string[];
  currency?: string;
  meta?: ShopMeta | null;
  /** The country the scan asked for: its places ("based in Portland, Oregon") then count as that country. */
  market?: Pick<EcomMarket, "id" | "regions"> | null;
}): StorePlace {
  const votes = new Map<
    string,
    { weight: number; best: number; why: string; place: string; placeBy: number }
  >();
  const vote = (country: string, weight: number, why: string, place = "") => {
    if (!country) return;
    const v = votes.get(country) ?? { weight: 0, best: 0, why: "", place: "", placeBy: 0 };
    v.weight += weight;
    if (weight > v.best) {
      v.best = weight;
      v.why = why;
    }
    // The town comes from the strongest sign that names one.
    if (place && weight > v.placeBy) {
      v.place = place;
      v.placeBy = weight;
    }
    votes.set(country, v);
  };
  const pages = input.pages ?? [];
  const html = pages
    .map((p) => p.html || "")
    .join("\n")
    .slice(0, 900_000);
  const text = (input.text ?? pages.map((p) => pageText(p.html)).join("\n"))
    .replace(/[ \t\u00a0]+/g, " ")
    .slice(0, 120_000);
  const home = (input.market?.id ?? "").toUpperCase();

  const meta = input.meta;
  if (meta?.country) {
    const province =
      meta.country === "US"
        ? stateName(meta.province)
        : (CA_PROVINCES[meta.province.toUpperCase()] ?? meta.province);
    const place = [meta.city, province].filter(Boolean).join(", ");
    vote(
      meta.country,
      10,
      `their shop is registered in ${place || countryIn(meta.country)}`,
      place,
    );
  }
  for (const address of postalAddresses(html)) {
    const ld =
      /"addressCountry"\s*:\s*(?:"([^"]{2,40})"|\{[^{}]*?"name"\s*:\s*"([^"]{2,40})")/i.exec(
        address,
      );
    const ldCountry = countryCode(ld?.[1] ?? ld?.[2]);
    if (!ldCountry) continue;
    const town = /"addressLocality"\s*:\s*"([^"]{2,60})"/i.exec(address)?.[1] ?? "";
    const region = /"addressRegion"\s*:\s*"([^"]{2,40})"/i.exec(address)?.[1] ?? "";
    const place = [town, ldCountry === "US" ? stateName(region) : region]
      .filter(Boolean)
      .join(", ");
    vote(ldCountry, 8, "the address in their page data", place);
    break;
  }
  const us = US_ADDRESS.exec(text);
  if (us)
    vote(
      "US",
      7,
      "a US address on their site",
      [townOnly(us[1]), stateName(us[2])].filter(Boolean).join(", "),
    );
  const ca = CA_ADDRESS.exec(text);
  if (ca)
    vote(
      "CA",
      7,
      "a Canadian address on their site",
      [townOnly(ca[1]), CA_PROVINCES[ca[2]]].filter(Boolean).join(", "),
    );
  const au = AU_ADDRESS.exec(text);
  if (au)
    vote(
      "AU",
      7,
      "an Australian address on their site",
      [townOnly(au[1]), au[2]].filter(Boolean).join(", "),
    );
  if (GB_ADDRESS.test(text)) vote("GB", 7, "a UK address on their site");
  for (const [re, code, why] of COMPANY_IDS) if (re.test(text)) vote(code, 7, why);
  const host = input.domain.toLowerCase();
  const ending = COUNTRY_ENDINGS.find(([re]) => re.test(host));
  if (ending) vote(ending[1], 6, `their web address ends in .${host.split(".").pop()}`);
  for (const said of saidPlaces(text, input.market)) {
    // "Made in" settles it for the country that was asked for, and only hints at any other.
    const weight = !said.made ? 6 : !home ? 5 : said.country === home ? 6 : 3;
    vote(said.country, weight, `“${said.quote}” on their site`, said.place);
  }

  for (const phone of (input.phones ?? []).slice(0, 3)) {
    const hit = PHONE_CODES.find(([re]) => re.test(phone.trim()));
    if (hit) vote(hit[1], 3, `a phone number from ${countryIn(hit[1])}`);
  }
  const money = (meta?.currency || input.currency || "").toUpperCase();
  if (CURRENCY_HOME[money]) vote(CURRENCY_HOME[money], 2, `prices in ${money}`);
  const locale = LOCALE_HOME.exec(html.slice(0, 20_000))?.[1]?.toUpperCase();
  if (locale) vote(locale, 2, "the language setting of their pages");

  const ranked = [...votes.entries()].sort((a, b) => b[1].weight - a[1].weight);
  if (!ranked.length) return NOWHERE;
  const [country, top] = ranked[0];
  // Two countries with equally strong signs: an international brand, or a page about both.
  if (ranked[1] && ranked[1][1].weight === top.weight && ranked[1][1].best >= 6) return NOWHERE;
  return { country, sure: top.best >= 6, place: top.place, why: top.why };
}

/** Country names safe to read in a short description: "china" is also tableware, "turkey" a bird, "america" half a continent. */
const BIO_WORDS: Record<string, string[]> = {
  US: ["usa", "united states"],
  GB: ["uk", "united kingdom", "great britain", "england", "scotland", "wales"],
  CA: ["canada"],
  AU: ["australia"],
  NZ: ["new zealand"],
  IE: ["ireland"],
  BE: ["belgium", "belgië", "belgique"],
  NL: ["netherlands", "nederland"],
  DE: ["germany", "deutschland"],
  FR: ["france"],
  IN: ["india"],
};

/** Flags brands put in their Instagram description. */
const FLAGS: Record<string, string> = {
  US: "\u{1F1FA}\u{1F1F8}",
  GB: "\u{1F1EC}\u{1F1E7}",
  CA: "\u{1F1E8}\u{1F1E6}",
  AU: "\u{1F1E6}\u{1F1FA}",
  BE: "\u{1F1E7}\u{1F1EA}",
  NL: "\u{1F1F3}\u{1F1F1}",
  DE: "\u{1F1E9}\u{1F1EA}",
  FR: "\u{1F1EB}\u{1F1F7}",
  NZ: "\u{1F1F3}\u{1F1FF}",
  IE: "\u{1F1EE}\u{1F1EA}",
  IN: "\u{1F1EE}\u{1F1F3}",
  CN: "\u{1F1E8}\u{1F1F3}",
};
const BIO_US: [RegExp, (m: RegExpExecArray) => string][] = [
  // "Austin, TX". State codes that are also everyday words in capitals (IN, OR, ME, OK, HI, OH) are left out.
  [
    new RegExp(
      `\\b([A-Z][A-Za-z.' -]{2,24}), (${STATE_CODES.replace(/\b(?:IN|OR|ME|OK|HI|OH)\|/g, "")})\\b`,
    ),
    (m) => `${m[1].trim()}, ${stateName(m[2])}`,
  ],
  [
    new RegExp(`(?<![\\p{L}\\p{N}])(?:${STATES_ALONE})(?![\\p{L}\\p{N}])`, "iu"),
    (m) => stateName(m[0]),
  ],
  [new RegExp(`(?<![\\p{L}\\p{N}])(?:${US_CITY_NAMES})(?![\\p{L}\\p{N}])`, "iu"), (m) => m[0]],
];

/**
 * Where an Instagram page says the brand is: a flag, a "made in" or "based
 * in" line, the country's name, or one of the country's places. Never sure: a
 * description is what the brand chose to write, not an address.
 */
export function bioPlace(text: string, market: Pick<EcomMarket, "id" | "regions">): StorePlace {
  const bio = String(text || "").slice(0, 600);
  if (!bio) return NOWHERE;
  const page = "their Instagram page";
  const flagged = Object.entries(FLAGS)
    .filter(([, flag]) => bio.includes(flag))
    .map(([code]) => code);
  if (flagged.length === 1)
    return { country: flagged[0], sure: false, place: "", why: `the flag on ${page}` };
  const said = saidPlaces(bio, market);
  // A "based in" line says more than a "made in" one.
  const line = said.find((s) => !s.made) ?? said[0];
  if (line)
    return {
      country: line.country,
      sure: false,
      place: line.place,
      why: `“${line.quote}” on ${page}`,
    };
  for (const [code, words] of Object.entries(BIO_WORDS)) {
    // Short names ("UK", "USA") only in capitals as whole words: "us" and "uk" are everyday letters otherwise.
    const named = words.some((w) =>
      w.length <= 3
        ? new RegExp(`(?:^|[^A-Za-z])${w.toUpperCase()}(?:[^A-Za-z]|$)`).test(bio)
        : new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, "iu").test(bio),
    );
    if (named) return { country: code, sure: false, place: "", why: page };
  }
  const home = market.id.toUpperCase();
  if (home === "US") {
    for (const [re, place] of BIO_US) {
      const m = re.exec(bio);
      if (m) return { country: "US", sure: false, place: place(m), why: page };
    }
  } else if (home) {
    const region = placesOf(market).find((r) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(r)}(?![\\p{L}\\p{N}])`, "iu").test(bio),
    );
    if (region) return { country: home, sure: false, place: region, why: page };
  }
  return NOWHERE;
}

/* --------------------------------------------- does it sell what was asked */

export type NicheMatch = "strong" | "some" | "none";

/** Words every shop search carries, and words that fit any product: they say nothing about what is sold. */
const EMPTY_WORDS = new Set(
  (
    "brand brands shop shops store stores online official independent sustainable small business the and for with from your our new best buy sale gift gifts accessories products goods " +
    "handmade natural organic custom personalized personalised luxury premium vintage eco vegan mini cute men mens women womens unisex"
  ).split(" "),
);

type NicheWords = Pick<EcomNiche, "terms" | "noun" | "label"> & Partial<Pick<EcomNiche, "theme">>;

/**
 * One spelling for a word however it is written: "hoodies", "hoodie" and
 * "hoody" → "hoody"; "supplies" → "supply"; "dresses" → "dress"; "cats" → "cat".
 * A key for comparing, not a word to show.
 */
const stemOf = (word: string): string =>
  /[^aeiou]ies?$/.test(word) && word.length > 4
    ? word.replace(/ies?$/, "y")
    : /(?:ss|sh|ch|x)es$/.test(word)
      ? word.slice(0, -2)
      : /[^sui]s$/.test(word) && word.length > 3
        ? word.slice(0, -1)
        : word;

const wordsOf = (phrase: string): string[] =>
  phrase
    .toLowerCase()
    .replace(/['\u2019]s\b/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !EMPTY_WORDS.has(w) && !EMPTY_WORDS.has(stemOf(w)))
    .map(stemOf);

/** The words that carry a niche, each in one spelling: "anime", "manga", "hoody" for the anime preset. */
export function nicheWords(niche: NicheWords): string[] {
  return [...new Set([...niche.terms, niche.noun, niche.label].flatMap(wordsOf))].slice(0, 40);
}

/**
 * The words a shop must use to belong to a niche at all, when the niche has
 * such words: its own list ("anime", "manga" for the anime preset: a clothing
 * shop is not an anime brand because it sells hoodies), or the words every
 * typed term shares ("cat" for "cat furniture, cat trees"). Empty when any of
 * the niche's words will do.
 */
export function nicheTheme(niche: NicheWords): string[] {
  if (niche.theme?.length) return [...new Set(niche.theme.flatMap(wordsOf))];
  if (niche.terms.length < 2) return [];
  const each = niche.terms.map((t) => new Set(wordsOf(t)));
  return [...each[0]].filter((w) => each.every((set) => set.has(w)));
}

/** A word as a shop writes it: on its own, in the plural, or with 's. Never inside another word ("cat" in "category"). */
const wordRe = (stem: string): RegExp => {
  const w = escapeRe(stem);
  const forms = /[^aeiou]y$/.test(stem) ? `${w.slice(0, -1)}(?:y|ie|ies)` : `${w}(?:s|es)?`;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${forms}(?:['\u2019]s)?(?![\\p{L}\\p{N}])`, "iu");
};

/**
 * How well a shop matches the niche it was found for. "strong": its own
 * description and its products both speak of it, or a good share of its
 * products do. "some": the niche is mentioned. "none": nothing on the shop
 * speaks of it, so the search matched something else.
 */
export function nicheMatch(
  niche: NicheWords,
  shop: {
    name?: string;
    about?: string;
    text?: string;
    catalog?: Pick<ShopCatalog, "titles" | "words"> | null;
  },
): NicheMatch {
  const theme = nicheTheme(niche);
  const words = (theme.length ? theme : nicheWords(niche)).map(wordRe);
  if (!words.length) return "some";
  const has = (text: string) => words.some((re) => re.test(text));
  const inFront = has(`${shop.name || ""} ${shop.about || ""}`);
  const titles = shop.catalog?.titles ?? [];
  const hits = titles.filter(has).length;
  const inCatalog = hits > 0 || (!!shop.catalog?.words && has(shop.catalog.words));
  if ((inFront && inCatalog) || (titles.length >= 5 && hits / titles.length >= 0.2))
    return "strong";
  // Without a catalogue to check against, the shop's own description is all there is.
  if (inFront || inCatalog) return inFront && !titles.length ? "strong" : "some";
  return shop.text && has(shop.text.slice(0, 60_000)) ? "some" : "none";
}

/* -------------------------------------------------------------- delivery */

/**
 * Does the shop's own text speak of deliveries of two weeks or more ("10-20
 * business days", "allow 2-4 weeks for delivery")? Common with shops that have
 * someone else ship from abroad; also true for some made-to-order brands, so it
 * is shown as what the shop says, not as a verdict.
 */
export function slowDelivery(text: string | undefined | null): boolean {
  const t = String(text || "").slice(0, 60_000);
  const near = "(?:ship|deliver|arriv|transit|dispatch)";
  return (
    new RegExp(
      `${near}[^.\\n]{0,80}\\b(?:1[0-9]|2[0-9])\\s?(?:-|–|to)\\s?(?:[2-6][0-9])\\s?(?:business |working )?days\\b`,
      "i",
    ).test(t) ||
    new RegExp(
      `\\b(?:1[0-9]|2[0-9])\\s?(?:-|–|to)\\s?(?:[2-6][0-9])\\s?(?:business |working )?days\\b[^.\\n]{0,80}${near}`,
      "i",
    ).test(t) ||
    new RegExp(`${near}[^.\\n]{0,80}\\b[2-6]\\s?(?:-|–|to)\\s?[3-9] weeks\\b`, "i").test(t) ||
    new RegExp(`\\b[2-6]\\s?(?:-|–|to)\\s?[3-9] weeks\\b[^.\\n]{0,80}${near}`, "i").test(t)
  );
}

/* ------------------------------------------------------------- for the screen */

const SYMBOLS: Record<string, string> = {
  USD: "$",
  CAD: "CA$",
  AUD: "A$",
  NZD: "NZ$",
  GBP: "£",
  EUR: "€",
};

/** "$18 to $64" (or "$24" when all cost about the same); "" when no prices are known. */
export function priceLabel(
  from: number | null | undefined,
  to: number | null | undefined,
  currency = "",
): string {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0)
    return "";
  const sign = SYMBOLS[currency.toUpperCase()] ?? (currency ? `${currency.toUpperCase()} ` : "");
  const show = (n: number) => `${sign}${Math.max(1, Math.round(n))}`;
  return to <= from || show(to) === show(from) ? show(from) : `${show(from)} to ${show(to)}`;
}

/** How long ago a day was, in words a list can carry: "this month", "3 months ago", "2 years ago". */
export function agoLabel(day: string | undefined | null, now = Date.now()): string {
  const at = Date.parse(String(day || ""));
  if (!Number.isFinite(at)) return "";
  const days = Math.max(0, Math.floor((now - at) / 86_400_000));
  if (days < 31) return "this month";
  if (days < 365) return `${Math.floor(days / 30.4)} months ago`.replace(/^1 months/, "1 month");
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
