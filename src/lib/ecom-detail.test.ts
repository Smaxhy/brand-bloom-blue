import { describe, expect, it } from "vitest";
import { ECOM_MARKETS, ecomMarket, resolveNiche } from "./ecom-brands";
import {
  CATALOG_SAMPLE,
  agoLabel,
  bioPlace,
  countryCode,
  countryIn,
  countryName,
  nicheMatch,
  nicheTheme,
  nicheWords,
  pageText,
  plainCountryEnding,
  priceLabel,
  shopifyCatalog,
  shopifyMeta,
  slowDelivery,
  storePlace,
} from "./ecom-detail";

const US = ecomMarket("us");
const GB = ecomMarket("gb");
const page = (html: string, path = "/") => ({ path, html });
/** A shop whose pages say this, and nothing else. */
const says = (text: string, more: Partial<Parameters<typeof storePlace>[0]> = {}) =>
  storePlace({
    domain: "kaijuclothing.com",
    pages: [page(`<main><p>${text}</p></main>`)],
    ...more,
  });

describe("countries", () => {
  it("reads a country however a shop writes it", () => {
    expect(countryCode("US")).toBe("US");
    expect(countryCode("us")).toBe("US");
    expect(countryCode("usa")).toBe("US");
    expect(countryCode("United States")).toBe("US");
    expect(countryCode("UK")).toBe("GB");
    expect(countryCode("u.k.")).toBe("GB");
    expect(countryCode("Deutschland")).toBe("DE");
    // Any two letters are a country: Vietnam is still somewhere else.
    expect(countryCode("vn")).toBe("VN");
  });

  it("returns nothing for what is not a country", () => {
    expect(countryCode("")).toBe("");
    expect(countryCode("Worldwide")).toBe("");
    expect(countryCode(42)).toBe("");
    expect(countryCode(null)).toBe("");
    expect(countryCode("x".repeat(60))).toBe("");
  });

  it("names a country for the screen", () => {
    expect(countryName("US")).toBe("United States");
    expect(countryName("us")).toBe("United States");
    expect(countryName("VN")).toBe("VN");
    expect(countryName("")).toBe("");
    expect(countryIn("us")).toBe("the United States");
    expect(countryIn("NL")).toBe("the Netherlands");
    expect(countryIn("gb")).toBe("the United Kingdom");
    expect(countryIn("CA")).toBe("Canada");
  });

  it("has a name for every country a scan can ask for", () => {
    for (const m of ECOM_MARKETS.filter((m) => m.id)) expect(countryName(m.id)).toBe(m.label);
  });
});

describe("a Shopify shop's own files", () => {
  it("reads where the shop is registered and how much it sells", () => {
    expect(
      shopifyMeta({
        id: 1,
        name: "Kaiju Clothing",
        city: "Austin",
        province: "Texas",
        country: "US",
        currency: "usd",
        description: "Anime streetwear,\n  made in Texas.",
        ships_to_countries: ["US", "ca", 7, "Canada"],
        published_products_count: 148,
      }),
    ).toEqual({
      name: "Kaiju Clothing",
      country: "US",
      province: "Texas",
      city: "Austin",
      currency: "USD",
      shipsTo: ["US", "CA"],
      products: 148,
      about: "Anime streetwear, made in Texas.",
    });
  });

  it("is empty for a file that is missing or not a shop file", () => {
    const empty = {
      name: "",
      country: "",
      province: "",
      city: "",
      currency: "",
      shipsTo: [],
      products: null,
      about: "",
    };
    expect(shopifyMeta(null)).toEqual(empty);
    expect(shopifyMeta("<html>")).toEqual(empty);
    expect(shopifyMeta([{ country: "US" }])).toEqual(empty);
    expect(shopifyMeta({ country: 1, currency: "dollars", published_products_count: -4 })).toEqual(
      empty,
    );
  });

  const product = (n: number, more: Record<string, unknown> = {}) => ({
    title: `Kaiju Hoodie ${n}`,
    product_type: n % 3 ? "Hoodies" : "Tees",
    tags: ["anime", "streetwear"],
    published_at: "2026-03-01T10:00:00-05:00",
    updated_at: "2026-05-01T10:00:00-05:00",
    variants: [{ price: String(20 + n) }, { price: String(40 + n) }],
    ...more,
  });

  it("reads the catalogue: prices, the newest product, what it calls its products", () => {
    const products = Array.from({ length: 20 }, (_, i) => product(i));
    products[0] = product(0, { variants: [{ price: "1.00" }] }); // a sticker
    products[19] = product(19, {
      variants: [{ price: "900.00" }],
      published_at: "2026-10-20T08:00:00Z",
    });
    const c = shopifyCatalog({ products });
    expect(c.sample).toBe(20);
    expect(c.whole).toBe(true);
    // The cheapest and the dearest tenth are left out of the range.
    expect(c.priceFrom).toBe(22);
    expect(c.priceTo).toBe(37);
    expect(c.newest).toBe("2026-10-20");
    expect(c.types).toEqual(["Hoodies", "Tees"]);
    expect(c.titles).toHaveLength(20);
    expect(c.titles[1]).toBe("kaiju hoodie 1");
    expect(c.words).toContain("anime");
  });

  it("takes each product's lowest price and reads tags written as one line", () => {
    const c = shopifyCatalog({
      products: [
        {
          title: "Soap",
          tags: "lavender, vegan",
          variants: [{ price: "12.50" }, { price: "9.00" }, { price: "free" }],
        },
        { title: "Gift card", variants: [] },
      ],
    });
    expect(c.priceFrom).toBe(9);
    expect(c.priceTo).toBe(9);
    expect(c.words).toContain("lavender, vegan");
    expect(c.types).toEqual([]);
  });

  it("knows when the sample is not the whole shop", () => {
    const full = shopifyCatalog({
      products: Array.from({ length: CATALOG_SAMPLE }, (_, i) => product(i)),
    });
    expect(full.sample).toBe(CATALOG_SAMPLE);
    expect(full.whole).toBe(false);
  });

  it("dates the last change in the shop, from the products and their variants", () => {
    const c = shopifyCatalog({
      products: [
        product(1, { updated_at: "2026-01-10T00:00:00Z" }),
        product(2, {
          updated_at: "2026-02-10T00:00:00Z",
          variants: [{ price: "10", updated_at: "2026-11-02T09:30:00Z" }],
        }),
      ],
    });
    expect(c.updated).toBe("2026-11-02");
    // A shop file without change dates: a product cannot have changed before it was added.
    const bare = shopifyCatalog({
      products: [{ title: "Soap", published_at: "2025-06-01T00:00:00Z" }],
    });
    expect(bare.newest).toBe("2025-06-01");
    expect(bare.updated).toBe("2025-06-01");
  });

  it("is empty for a file that is missing or not a catalogue", () => {
    for (const junk of [null, undefined, "nope", { products: "many" }, { items: [] }]) {
      const c = shopifyCatalog(junk);
      expect(c).toMatchObject({
        sample: 0,
        whole: false,
        priceFrom: null,
        priceTo: null,
        newest: "",
        updated: "",
      });
      expect(c.titles).toEqual([]);
    }
    expect(shopifyCatalog({ products: [null, 4, "x"] }).sample).toBe(0);
  });
});

describe("reading a page as text", () => {
  it("keeps what a visitor reads and drops code", () => {
    const text = pageText(
      `<html><head><style>p{color:red}</style><script>var made = "made in China";</script></head>
       <body><h1>Kaiju&nbsp;Clothing</h1><p>Tees &amp; hoodies</p><!-- made in China --><footer>Austin,<br>TX 78701</footer></body></html>`,
    );
    expect(text).toBe("Kaiju Clothing\nTees & hoodies\nAustin,\nTX 78701");
  });

  it("keeps the top and the bottom of a long page, where the address is", () => {
    const long = `<p>Welcome to Kaiju</p>${"<p>Another product line here.</p>".repeat(3000)}<footer>Kaiju Clothing LLC, Austin, TX 78701</footer>`;
    const text = pageText(long, 2000);
    expect(text.length).toBeLessThanOrEqual(2001);
    expect(text.startsWith("Welcome to Kaiju")).toBe(true);
    expect(text.endsWith("Austin, TX 78701")).toBe(true);
  });
});

describe("where a shop is based", () => {
  it("takes the shop's own registration first", () => {
    const meta = shopifyMeta({ country: "US", city: "Austin", province: "Texas", currency: "USD" });
    expect(storePlace({ domain: "kaijuclothing.com", meta })).toEqual({
      country: "US",
      sure: true,
      place: "Austin, Texas",
      why: "their shop is registered in Austin, Texas",
    });
  });

  it("writes a state out and copes with a registration that names no town", () => {
    expect(
      storePlace({
        domain: "x.com",
        meta: shopifyMeta({ country: "US", city: "Boise", province: "ID" }),
      }).place,
    ).toBe("Boise, Idaho");
    expect(
      storePlace({
        domain: "x.com",
        meta: shopifyMeta({ country: "CA", city: "Toronto", province: "ON" }),
      }).place,
    ).toBe("Toronto, Ontario");
    expect(storePlace({ domain: "x.com", meta: shopifyMeta({ country: "US" }) })).toEqual({
      country: "US",
      sure: true,
      place: "",
      why: "their shop is registered in the United States",
    });
  });

  it("reads the address a shop puts in its page data", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","address":{"@type":"PostalAddress","addressLocality":"Denver","addressRegion":"CO","addressCountry":"US"}}</script>`;
    expect(storePlace({ domain: "peakgear.com", pages: [page(html)] })).toEqual({
      country: "US",
      sure: true,
      place: "Denver, Colorado",
      why: "the address in their page data",
    });
    // The country written as an object of its own, and the type written last.
    const named = `<script type="application/ld+json">{"address":{"@type":"PostalAddress","addressLocality":"Leeds","addressCountry":{"@type":"Country","name":"United Kingdom"}}}</script>`;
    expect(storePlace({ domain: "peakgear.com", pages: [page(named)] })).toMatchObject({
      country: "GB",
      sure: true,
      place: "Leeds",
    });
    const last = `<script type="application/ld+json">{"@type":"Organization","address":{"streetAddress":"1 Pine St","addressLocality":"Boise","addressRegion":"ID","postalCode":"83702","addressCountry":"US","@type":"PostalAddress"}}</script>`;
    expect(storePlace({ domain: "peakgear.com", pages: [page(last)] })).toMatchObject({
      country: "US",
      sure: true,
      place: "Boise, Idaho",
    });
  });

  it("does not take the countries a shop delivers to for the country it is in", () => {
    // What shop themes print for search engines: where a product can be sent, and which country's offers these are.
    const delivers = `<script type="application/ld+json">{"@type":"Product","name":"Hoodie","offers":{"@type":"Offer","price":"60","priceCurrency":"USD","shippingDetails":{"@type":"OfferShippingDetails","shippingDestination":{"@type":"DefinedRegion","addressCountry":"US"}},"areaServed":{"@type":"Country","name":"United States"},"eligibleRegion":{"@type":"Country","addressCountry":"US"}}}</script>`;
    expect(storePlace({ domain: "tokyothreads.com", pages: [page(delivers)] })).toEqual({
      country: "",
      sure: false,
      place: "",
      why: "",
    });
    // With the shop's own address next to it, only the address counts.
    const own = `<script type="application/ld+json">{"@type":"Organization","address":{"@type":"PostalAddress","addressLocality":"Osaka","addressCountry":"JP"}}</script>`;
    expect(storePlace({ domain: "tokyothreads.com", pages: [page(delivers + own)] })).toMatchObject(
      {
        country: "JP",
        sure: true,
        place: "Osaka",
      },
    );
    // An address object that never closes is not read past its limits.
    const broken = `{"@type":"PostalAddress","addressCountry":"US"` + " ".repeat(3000);
    expect(storePlace({ domain: "x.com", pages: [page(broken)] }).country).toBe("");
  });

  it("reads an American postal address, with the state as a code or written out", () => {
    expect(says("Kaiju Clothing LLC<br>500 Main Street, Austin, TX 78701")).toEqual({
      country: "US",
      sure: true,
      place: "Austin, Texas",
      why: "a US address on their site",
    });
    expect(says("Returns: 12 Pine Rd, Suite 4, Portland, Oregon 97205-1234").place).toBe(
      "Portland, Oregon",
    );
    expect(says("Visit us: Salt Lake City, UT 84101").place).toBe("Salt Lake City, Utah");
    // A street line that runs into the town is cut off it.
    expect(says("500 Main Street Austin, TX 78701").place).toBe("Austin, Texas");
    // A footer set in capitals reads as a town all the same.
    expect(says("KAIJU CLOTHING LLC<br>SALT LAKE CITY, UT 84101").place).toBe(
      "Salt Lake City, Utah",
    );
    expect(says("WINSTON-SALEM, NC 27101").place).toBe("Winston-Salem, North Carolina");
  });

  it("finds an address in the footer of a long homepage", () => {
    const html = `<h1>Kaiju</h1>${"<p>New drop: oversized tee in washed black.</p>".repeat(2500)}<footer>Kaiju Clothing LLC · 500 Main St · Austin, TX 78701</footer>`;
    expect(storePlace({ domain: "kaijuclothing.com", pages: [page(html)] })).toMatchObject({
      country: "US",
      sure: true,
      place: "Austin, Texas",
    });
  });

  it("reads Canadian, Australian and British addresses", () => {
    expect(says("Unit 4, 200 King St W, Toronto, ON M5H 3T4")).toMatchObject({
      country: "CA",
      sure: true,
      place: "Toronto, Ontario",
    });
    expect(says("12 Smith Street, Fitzroy VIC 3065")).toMatchObject({
      country: "AU",
      sure: true,
      place: "Fitzroy, VIC",
    });
    expect(says("Unit 3, Mill Lane, Leeds LS1 4AP, United Kingdom")).toMatchObject({
      country: "GB",
      sure: true,
    });
    // A postcode alone looks like a product code: it needs the country next to it.
    expect(says("Our best seller: the SW1A 2AA tote")).toEqual({
      country: "",
      sure: false,
      place: "",
      why: "",
    });
  });

  it("reads company numbers only one country hands out", () => {
    expect(says("Ondernemingsnummer BE 0123.456.789")).toMatchObject({ country: "BE", sure: true });
    expect(says("KvK 12345678")).toMatchObject({ country: "NL", sure: true });
    expect(says("ABN 12 345 678 901")).toMatchObject({ country: "AU", sure: true });
    expect(says("SIRET 123 456 789 00012")).toMatchObject({ country: "FR", sure: true });
  });

  it("reads a country web address, and nothing from .com", () => {
    expect(storePlace({ domain: "teaandtoast.co.uk" })).toEqual({
      country: "GB",
      sure: true,
      place: "",
      why: "their web address ends in .uk",
    });
    expect(storePlace({ domain: "maplewear.ca" })).toMatchObject({ country: "CA", sure: true });
    expect(storePlace({ domain: "kaijuclothing.com" })).toEqual({
      country: "",
      sure: false,
      place: "",
      why: "",
    });
    expect(storePlace({ domain: "kaiju.co" }).country).toBe("");
  });

  it("knows which web addresses leave no doubt about the country", () => {
    expect(plainCountryEnding("teaandtoast.co.uk")).toBe("GB");
    expect(plainCountryEnding("otaku.com.au")).toBe("AU");
    expect(plainCountryEnding("kaiju.de")).toBe("DE");
    expect(plainCountryEnding("maplewear.ca")).toBe("CA");
    expect(plainCountryEnding("KAIJU.CO.JP")).toBe("JP");
    // Letters that also spell words: such a shop is opened and judged on everything it says.
    for (const d of ["wear.it", "look.at", "plug.in", "kaiju.be", "hi.fi", "kaiju.us", "kaiju.es"])
      expect(plainCountryEnding(d), d).toBe("");
    for (const d of ["kaijuclothing.com", "kaiju.co", "kaiju.shop", "kaiju.io", ""])
      expect(plainCountryEnding(d), d).toBe("");
    // A company ending of a country that has no name here is still read as nothing, not as a wrong country.
    expect(plainCountryEnding("kaiju.co.th")).toBe("");
  });

  it("takes a brand at its word about where it is", () => {
    expect(says("We are a small team based in Sweden.")).toEqual({
      country: "SE",
      sure: true,
      place: "",
      why: "“based in Sweden” on their site",
    });
    expect(says("Every order ships from the UK within two days.")).toMatchObject({
      country: "GB",
      sure: true,
    });
    expect(says("A US-based family business.")).toMatchObject({ country: "US", sure: true });
    expect(says("Headquartered in the United States of America")).toMatchObject({
      country: "US",
      sure: true,
    });
  });

  it("reads the many ways an American brand says where it is", () => {
    const lines: [string, string][] = [
      // what a shop's pages really say                                              → the town or state it names ("" = the country only)
      [
        "Trade name: Kaiju Clothing LLC<br>Physical address: 1234 S Congress Ave, Austin TX 78704, United States",
        "Austin, Texas",
      ],
      ["To return an item, mail it to: 123 Main Street, Brooklyn NY 11201", "Brooklyn, New York"],
      ["We're a small team based out of Denver, Colorado.", "Denver, Colorado"],
      ["Proudly designed and printed in Brooklyn.", "Brooklyn"],
      ["Family owned and operated in North Carolina since 1998.", "North Carolina"],
      ["Founded in Portland, Oregon in 2015.", "Portland, Oregon"],
      ["We are located in the heart of Nashville, Tennessee.", "Nashville, Tennessee"],
      ["All orders ship from our warehouse in Ohio.", "Ohio"],
      ["Every order ships from the US within 2 business days.", ""],
      ["Made in the U.S.A.", ""],
      ["Made in America with imported fabric", ""],
      ["Handcrafted in the USA", ""],
      ["Assembled in USA from global parts", ""],
      ["Printed on demand in the United States", ""],
      ["Made in small batches in Vermont", "Vermont"],
      ["Designed, printed and shipped from Austin, Texas", "Austin, Texas"],
      ["A Brooklyn-based streetwear label", "Brooklyn"],
      ["An LA-based studio", "Los Angeles"],
      ["California based, family run", "California"],
      ["Veteran owned. US-based support team.", ""],
      ["Designed in California. Assembled in China.", "California"],
      ["Imported from Japan. Ships from Los Angeles.", "Los Angeles"],
    ];
    for (const [line, place] of lines)
      expect(says(line, { market: US }), line).toMatchObject({ country: "US", sure: true, place });
  });

  it("is not fooled by lines that only sound like a place", () => {
    for (const line of [
      "Free shipping from $50",
      "Shipping from 3 to 5 business days",
      "Made from 100% cotton",
      "Designed in-house by our team",
      "Based on a manga classic",
      "Located in the Arts District",
      "All shirts are made in US sizes",
      "Prices in US dollars",
      "As seen in USA Today",
      "Formula-based skincare",
      "Rule-based pricing",
      "Established in 1998",
      "Founded in 2015 by two friends",
      "Operated by Kaiju Clothing",
      "We ship worldwide from our warehouses",
      "Fast shipping from our US warehouse",
      "Join us. Based on your order history we recommend",
    ])
      expect(says(line, { market: US }).country, line).toBe("");
  });

  it("reads where brands from elsewhere say they are, so they are left out", () => {
    const elsewhere: [string, string][] = [
      ["Authentic anime merchandise shipped directly from Japan", "JP"],
      ["Registered in England and Wales. Company No. 01234567", "GB"],
      ["VAT Registration Number: GB 123 4567 89", "GB"],
      ["Australian owned and operated", "AU"],
      ["Proudly Canadian-owned", "CA"],
      ["All parcels are dispatched from the Netherlands", "NL"],
      ["We are based in Shenzhen, China", "CN"],
      ["Based in Toronto, Canada", "CA"],
      ["Our team is based in London, UK", "GB"],
      ["Our studio is located in Germany", "DE"],
    ];
    for (const [line, country] of elsewhere) {
      const at = says(line, { market: US });
      expect(at.country, line).toBe(country);
      if (country) expect(at.sure, line).toBe(true);
    }
    expect(says("Based in Toronto, Canada", { market: US }).place).toBe("Toronto");
    // Where the goods come from is a hint, with the town or without it.
    expect(says("Made in Florence, Italy", { market: US })).toMatchObject({
      country: "IT",
      sure: false,
    });
    // A Canadian town tells a scan for America nothing either way.
    expect(says("Made in Vancouver, BC", { market: US }).country).toBe("");
    expect(says("Made in Vancouver, BC", { market: ecomMarket("ca") })).toMatchObject({
      country: "CA",
      sure: true,
    });
  });

  it("reads whose law a shop says it trades under", () => {
    expect(
      says(
        "These Terms shall be governed by and construed in accordance with the laws of the State of Texas.",
      ),
    ).toEqual({
      country: "US",
      sure: true,
      place: "Texas",
      why: "“laws of the State of Texas” on their site",
    });
    expect(says("governed by the laws of United States")).toMatchObject({
      country: "US",
      sure: true,
      place: "",
    });
    expect(says("governed by the laws of the United States of America")).toMatchObject({
      country: "US",
    });
    expect(says("governed by the laws of the Commonwealth of Massachusetts")).toMatchObject({
      country: "US",
      place: "Massachusetts",
    });
    expect(says("governed by the laws of England and Wales")).toMatchObject({
      country: "GB",
      sure: true,
    });
    expect(says("governed by the laws of the Province of Ontario")).toMatchObject({
      country: "CA",
      place: "Ontario",
    });
    expect(says("governed by the laws of British Columbia")).toMatchObject({
      country: "CA",
      place: "British Columbia",
    });
    expect(says("governed by the laws of the Netherlands")).toMatchObject({
      country: "NL",
      sure: true,
    });
    // A state that is also a country only counts when the line says it is the state.
    expect(says("governed by the laws of the State of Georgia")).toMatchObject({
      country: "US",
      place: "Georgia",
    });
    expect(says("governed by the laws of Georgia").country).toBe("");
    // Only the line that says whose law governs: a privacy page that mentions American law says nothing about the shop.
    expect(
      says("Your data may be stored on servers subject to the laws of the United States.").country,
    ).toBe("");
    expect(says("the laws of physics do not apply to our hoodies").country).toBe("");
    expect(
      says("These terms are governed by common sense. We obey the laws of the land.").country,
    ).toBe("");
  });

  it("reads the places of the country that was asked for", () => {
    expect(says("Handmade in Portland, Oregon since 2015.", { market: US })).toEqual({
      country: "US",
      sure: true,
      place: "Portland, Oregon",
      why: "“Handmade in Portland, Oregon” on their site",
    });
    expect(says("Designed in california, worn everywhere.", { market: US })).toMatchObject({
      country: "US",
      sure: true,
      place: "California",
    });
    expect(says("Proudly based in Austin, TX.", { market: US })).toMatchObject({
      country: "US",
      place: "Austin, Texas",
    });
    expect(says("Roasted in Brooklyn in small batches.", { market: US })).toMatchObject({
      country: "US",
      place: "Brooklyn",
    });
    expect(says("Made in New Mexico", { market: US })).toMatchObject({
      country: "US",
      place: "New Mexico",
    });
    expect(says("Designed and based in Manchester.", { market: GB })).toMatchObject({
      country: "GB",
      sure: true,
      place: "Manchester",
    });
    // Without a country asked for, a town says nothing: there is a Manchester in New Hampshire too.
    expect(says("Designed and based in Manchester.").country).toBe("");
    expect(says("Handmade in Portland, Oregon since 2015.").country).toBe("");
  });

  it("lets “made in” settle it only for the country that was asked for", () => {
    // The goods come from Italy; the brand is in New York.
    expect(
      says("Made in Italy. Kaiju LLC, 12 Wall St, New York, NY 10005", { market: US }),
    ).toMatchObject({
      country: "US",
      sure: true,
      place: "New York, New York",
    });
    expect(says("Proudly made in the USA", { market: US })).toMatchObject({
      country: "US",
      sure: true,
    });
    expect(says("American-made denim", { market: US })).toMatchObject({
      country: "US",
      sure: true,
    });
    // Asked for America, and all the shop says is where its goods come from: a hint, not an answer.
    expect(says("All our pieces are made in China.", { market: US })).toMatchObject({
      country: "CN",
      sure: false,
    });
    expect(says("Designed in Los Angeles, made in China.", { market: US })).toMatchObject({
      country: "US",
      sure: true,
    });
    // Anywhere: shown as the brand's own word, never as confirmed.
    expect(says("Proudly made in the USA")).toMatchObject({ country: "US", sure: false });
  });

  it("does not read a country into everyday words", () => {
    for (const line of [
      "Contact us based on your order number.",
      "Made with love, shipped worldwide.",
      "Made in small batches",
      "Based on a true story",
      "Our tees are made in or near the mountains",
      "Shipping from 3 to 5 days",
      "We ship from our warehouse",
    ])
      expect(says(line, { market: US }).country).toBe("");
    // A state that is also a country is only read in an address.
    expect(says("Made in Georgia", { market: US }).country).toBe("");
    expect(says("Made in Indiana", { market: US })).toMatchObject({
      country: "US",
      place: "Indiana",
    });
    expect(says("Proudly made in Ukraine", { market: US }).country).not.toBe("GB");
  });

  it("treats a currency, a phone code and a language as hints only", () => {
    // Shops everywhere price in dollars: that is no hint at all.
    expect(storePlace({ domain: "x.com", currency: "USD" })).toEqual({
      country: "",
      sure: false,
      place: "",
      why: "",
    });
    expect(storePlace({ domain: "x.com", currency: "GBP" })).toEqual({
      country: "GB",
      sure: false,
      place: "",
      why: "prices in GBP",
    });
    expect(storePlace({ domain: "x.com", phones: ["+44 20 7946 0958"], currency: "GBP" })).toEqual({
      country: "GB",
      sure: false,
      place: "",
      why: "a phone number from the United Kingdom",
    });
    expect(
      storePlace({ domain: "x.com", pages: [page('<html lang="en-AU"><body></body></html>')] }),
    ).toEqual({
      country: "AU",
      sure: false,
      place: "",
      why: "the language setting of their pages",
    });
    // An American number is not a country code: 860 is Connecticut, 917 New York, 440 Ohio, 312 Chicago.
    for (const phone of [
      "860-555-0100",
      "(917) 555-0100",
      "440.555.0100",
      "312 555 0100",
      "617-555-0100",
      "+1 860 555 0100",
    ])
      expect(storePlace({ domain: "x.com", phones: [phone] }).country, phone).toBe("");
    expect(storePlace({ domain: "x.com", phones: ["0044 20 7946 0958"] }).country).toBe("GB");
    expect(storePlace({ domain: "x.com", phones: ["+86 755 5550 100"] }).country).toBe("CN");
    // A hint never outweighs what the shop says: American prices, a Canadian address.
    expect(says("44 Queen St, Ottawa, ON K1P 5C5", { currency: "USD" })).toMatchObject({
      country: "CA",
      sure: true,
    });
  });

  it("adds signs up, and gives no answer when two countries are equally likely", () => {
    // A British web address and a British address against an American registration.
    const meta = shopifyMeta({ country: "US" });
    expect(
      says("Unit 3, Mill Lane, Leeds LS1 4AP, United Kingdom", {
        domain: "teaandtoast.co.uk",
        meta,
      }),
    ).toMatchObject({ country: "GB", sure: true });
    expect(says("Based in the USA.", { domain: "teaandtoast.co.uk" })).toEqual({
      country: "",
      sure: false,
      place: "",
      why: "",
    });
  });

  it("names the town from the strongest sign", () => {
    const meta = shopifyMeta({ country: "US", city: "Austin", province: "Texas" });
    expect(says("Warehouse: 9 Dock Rd, Reno, NV 89501", { meta }).place).toBe("Austin, Texas");
  });
});

describe("where an Instagram page says a brand is", () => {
  it("reads a flag, when there is only one", () => {
    expect(bioPlace("Kaiju Clothing 🇺🇸 anime streetwear", US)).toEqual({
      country: "US",
      sure: false,
      place: "",
      why: "the flag on their Instagram page",
    });
    expect(bioPlace("Shipping 🇺🇸 🇨🇦 🇬🇧", US).country).toBe("");
    expect(bioPlace("Tea and toast 🇬🇧", US).country).toBe("GB");
  });

  it("reads what the page says about itself", () => {
    expect(bioPlace("Small batch soap. Handmade in Colorado.", US)).toEqual({
      country: "US",
      sure: false,
      place: "Colorado",
      why: "“Handmade in Colorado” on their Instagram page",
    });
    expect(bioPlace("Streetwear, made in Italy. Based in Canada", US)).toMatchObject({
      country: "CA",
    });
    expect(bioPlace("Designed in London, worn everywhere", GB)).toMatchObject({
      country: "GB",
      place: "London",
    });
  });

  it("reads the country's name, short names only in capitals", () => {
    expect(bioPlace("Anime tees | USA | free shipping", US)).toEqual({
      country: "US",
      sure: false,
      place: "",
      why: "their Instagram page",
    });
    expect(bioPlace("UK streetwear label", US).country).toBe("GB");
    expect(bioPlace("follow us for drops", US).country).toBe("");
    expect(bioPlace("Australia's favourite candle brand", US).country).toBe("AU");
    // Tableware and a bird are not countries.
    expect(bioPlace("Bone china mugs and turkey feathers", US).country).toBe("");
  });

  it("reads American places when America was asked for", () => {
    expect(bioPlace("Kaiju Clothing • Austin, TX • DM to order", US)).toEqual({
      country: "US",
      sure: false,
      place: "Austin, Texas",
      why: "their Instagram page",
    });
    expect(bioPlace("candles poured in small batches | colorado", US)).toMatchObject({
      country: "US",
      place: "Colorado",
    });
    expect(bioPlace("NYC streetwear", US)).toMatchObject({ country: "US", place: "NYC" });
    // Everyday words in capitals are not states, and a first name is not one either.
    expect(bioPlace("SHOP NOW, OR miss out", US).country).toBe("");
    expect(bioPlace("Virginia's candle studio", US).country).toBe("");
    // Asked for Britain, an American town says nothing.
    expect(bioPlace("NYC streetwear", GB).country).toBe("");
    expect(bioPlace("Leeds streetwear label", GB)).toMatchObject({ country: "GB", place: "Leeds" });
  });

  it("is never sure, and says nothing for a page that names no place", () => {
    expect(bioPlace("", US)).toEqual({ country: "", sure: false, place: "", why: "" });
    expect(bioPlace("Anime streetwear. New drop every Friday.", US).country).toBe("");
    expect(bioPlace("Anime streetwear. Worldwide shipping.", ecomMarket("")).country).toBe("");
    for (const bio of ["🇺🇸", "Made in USA", "USA", "Austin, TX"])
      expect(bioPlace(bio, US).sure).toBe(false);
  });
});

describe("does a shop sell what the scan asked for", () => {
  const anime = (resolveNiche("anime") ?? { id: "missing", label: "missing", noun: "missing", terms: [] });
  const soap = (resolveNiche("handmade soap") ?? { id: "missing", label: "missing", noun: "missing", terms: [] });

  it("takes the words that carry a niche", () => {
    // "handmade" fits any product: the niche is soap.
    expect(nicheWords(soap)).toEqual(["soap"]);
    expect(
      nicheWords({ terms: ["cat trees", "cat's toys"], noun: "cat trees", label: "Cat trees" }),
    ).toEqual(["cat", "tree", "toy"]);
    // One spelling per word, so the plural and the singular are the same word.
    expect(
      nicheWords({
        terms: ["pet supplies", "dresses", "the best glass", "hoodies", "hoodie"],
        noun: "",
        label: "",
      }),
    ).toEqual(["pet", "supply", "dress", "glass", "hoody"]);
    const words = nicheWords(anime);
    expect(words).toEqual(expect.arrayContaining(["anime", "manga", "streetwear", "poster"]));
    for (const empty of ["brand", "shop", "accessories", "accessory"])
      expect(words).not.toContain(empty);
  });

  it("knows which words a shop must use to belong to a niche", () => {
    expect(nicheTheme(anime)).toEqual(["anime", "manga", "kawaii", "otaku", "cosplay"]);
    // Typed niches: the word every term shares.
    expect(nicheTheme((resolveNiche("cat furniture, cat trees") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toEqual(["cat"]);
    // One term, or terms with nothing in common: any of the words will do.
    expect(nicheTheme(soap)).toEqual([]);
    expect(nicheTheme((resolveNiche("candles, soap") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toEqual([]);
    expect(nicheTheme((resolveNiche("household") ?? { id: "missing", label: "missing", noun: "missing", terms: [] }))).toEqual([]);
  });

  it("does not take a clothing shop for an anime brand because it sells hoodies", () => {
    const catalog = shopifyCatalog({
      products: Array.from({ length: 8 }, (_, i) => ({
        title: `Heavyweight hoodie ${i}`,
        product_type: "Streetwear",
      })),
    });
    expect(
      nicheMatch(anime, { name: "Blue Clothing Co", about: "Streetwear and merch", catalog }),
    ).toBe("none");
    expect(
      nicheMatch(anime, {
        name: "Blue Clothing Co",
        about: "Streetwear for manga readers",
        catalog,
      }),
    ).toBe("some");
    // A furniture shop is not a cat furniture shop.
    const cats = (resolveNiche("cat furniture, cat trees") ?? { id: "missing", label: "missing", noun: "missing", terms: [] });
    expect(nicheMatch(cats, { name: "Oak & Pine", about: "Solid wood furniture" })).toBe("none");
    expect(nicheMatch(cats, { name: "Oak & Pine", about: "Furniture your cats will climb" })).toBe(
      "strong",
    );
  });

  it("is strong when the shop's own words and its products both speak of it", () => {
    const catalog = shopifyCatalog({
      products: [{ title: "Lavender soap bar" }, { title: "Gift box" }],
    });
    expect(
      nicheMatch(soap, { name: "Suds & Co", about: "Handmade soap from Vermont", catalog }),
    ).toBe("strong");
  });

  it("is strong when a good share of the products speak of it, whatever the shop calls itself", () => {
    const products = [
      ...Array.from({ length: 4 }, (_, i) => ({ title: `Oat soap ${i}` })),
      ...Array.from({ length: 6 }, (_, i) => ({ title: `Candle ${i}` })),
    ];
    expect(
      nicheMatch(soap, {
        name: "Suds & Co",
        about: "Things for the bath",
        catalog: shopifyCatalog({ products }),
      }),
    ).toBe("strong");
  });

  it("is some when only one of them does", () => {
    const candles = shopifyCatalog({
      products: Array.from({ length: 8 }, (_, i) => ({ title: `Candle ${i}` })),
    });
    expect(nicheMatch(soap, { name: "Suds & Co", about: "Handmade soap", catalog: candles })).toBe(
      "some",
    );
    const one = shopifyCatalog({
      products: [
        { title: "Soap dish" },
        ...Array.from({ length: 9 }, (_, i) => ({ title: `Candle ${i}` })),
      ],
    });
    expect(nicheMatch(soap, { name: "Glow", about: "Candles", catalog: one })).toBe("some");
    expect(
      nicheMatch(soap, {
        name: "Glow",
        about: "Candles",
        text: "we also stock soap",
        catalog: candles,
      }),
    ).toBe("some");
  });

  it("is none when nothing on the shop speaks of it", () => {
    const candles = shopifyCatalog({
      products: Array.from({ length: 8 }, (_, i) => ({ title: `Candle ${i}` })),
    });
    expect(
      nicheMatch(soap, {
        name: "Glow",
        about: "Candles",
        text: "Scented candles, poured by hand.",
        catalog: candles,
      }),
    ).toBe("none");
    expect(nicheMatch(anime, { name: "Glow", about: "Candles" })).toBe("none");
  });

  it("goes by the shop's own words when its catalogue could not be read", () => {
    expect(nicheMatch(anime, { name: "Kaiju Clothing", about: "Anime streetwear drops" })).toBe(
      "strong",
    );
    expect(
      nicheMatch(anime, { name: "Kaiju Clothing", about: "", text: "tees inspired by anime" }),
    ).toBe("some");
  });

  it("matches whole words, in the singular or the plural, never letters inside another word", () => {
    const cats = { terms: ["cat"], noun: "cat", label: "Cat" };
    for (const about of [
      "Shop by category",
      "Find our location",
      "Catering supplies",
      "Soapstone carvings",
    ])
      expect(nicheMatch(cats, { name: "Homeware", about }), about).toBe("none");
    for (const about of ["Beds for cats", "Your cat's new bed", "CAT BEDS", "cat-safe plants"])
      expect(nicheMatch(cats, { name: "Homeware", about }), about).toBe("strong");
    const hoodies = { terms: ["hoodies"], noun: "hoodie", label: "Hoodies" };
    for (const about of [
      "One hoodie, three colours",
      "Hoodies and tees",
      "The hoody you live in",
      "A hoodie’s best friend",
    ])
      expect(nicheMatch(hoodies, { name: "Homeware", about }), about).toBe("strong");
    expect(nicheMatch(hoodies, { name: "Homeware", about: "Hoods and hats" })).toBe("none");
    const supplies = { terms: ["art supplies"], noun: "art supply", label: "Art supplies" };
    expect(nicheMatch(supplies, { name: "Homeware", about: "Supplies for your studio" })).toBe(
      "strong",
    );
    expect(nicheMatch(supplies, { name: "Homeware", about: "A supply of paint" })).toBe("strong");
    const dresses = { terms: ["dresses"], noun: "dress", label: "Dresses" };
    expect(nicheMatch(dresses, { name: "Homeware", about: "A dresser for every bedroom" })).toBe(
      "none",
    );
    expect(nicheMatch(dresses, { name: "Homeware", about: "Linen dresses" })).toBe("strong");
  });

  it("has no opinion when the niche has no words to go by", () => {
    expect(
      nicheMatch(
        { terms: ["handmade"], noun: "handmade", label: "Handmade" },
        { name: "Glow", about: "Candles" },
      ),
    ).toBe("some");
  });
});

describe("long delivery times", () => {
  it("hears a shop speak of two weeks or more", () => {
    for (const line of [
      "Delivery takes 15-30 business days.",
      "Please allow 2-4 weeks for delivery.",
      "Shipping time: 12 to 20 days",
      "Your order will arrive in 10–25 working days",
      "3-5 weeks shipping to the US",
    ])
      expect(slowDelivery(line), line).toBe(true);
  });

  it("stays quiet about ordinary delivery and about other numbers", () => {
    for (const line of [
      "Ships in 1-3 business days.",
      "Delivery in 5-7 days",
      "30 day returns on every order",
      "Free shipping over $50",
      "Founded 15 years ago. We ship worldwide.",
      "",
    ])
      expect(slowDelivery(line), line).toBe(false);
    expect(slowDelivery(null)).toBe(false);
  });
});

describe("labels for the list", () => {
  it("writes a price range in the shop's currency", () => {
    expect(priceLabel(18, 64, "USD")).toBe("$18 to $64");
    expect(priceLabel(24, 24.4, "usd")).toBe("$24");
    expect(priceLabel(12.5, 40, "GBP")).toBe("£13 to £40");
    expect(priceLabel(20, 55, "SEK")).toBe("SEK 20 to SEK 55");
    expect(priceLabel(20, 55)).toBe("20 to 55");
    expect(priceLabel(0.4, 0.9, "USD")).toBe("$1");
  });

  it("writes no price when none is known", () => {
    expect(priceLabel(null, null, "USD")).toBe("");
    expect(priceLabel(undefined, 20, "USD")).toBe("");
    expect(priceLabel(0, 20, "USD")).toBe("");
    expect(priceLabel(Number.NaN, 20, "USD")).toBe("");
  });

  it("says how long ago a day was", () => {
    const now = Date.parse("2026-11-16T12:00:00Z");
    expect(agoLabel("2026-11-01", now)).toBe("this month");
    expect(agoLabel("2026-10-01", now)).toBe("1 month ago");
    expect(agoLabel("2026-05-16", now)).toBe("6 months ago");
    expect(agoLabel("2025-11-10", now)).toBe("1 year ago");
    expect(agoLabel("2023-01-01", now)).toBe("3 years ago");
    // A date ahead of today (a product scheduled for release) is still "this month".
    expect(agoLabel("2026-12-01", now)).toBe("this month");
    expect(agoLabel("", now)).toBe("");
    expect(agoLabel("soon", now)).toBe("");
    expect(agoLabel(null, now)).toBe("");
  });
});
