import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/logo-new-transparent.png";
import proof1 from "@/assets/results/proof-01.webp";
import proof2 from "@/assets/results/proof-02.webp";
import proof3 from "@/assets/results/proof-03.webp";
import proof4 from "@/assets/results/proof-04.webp";
import proof5 from "@/assets/results/proof-05.webp";
import proof6 from "@/assets/results/proof-06.webp";
import proof7 from "@/assets/results/proof-07.webp";
import proof8 from "@/assets/results/proof-08.webp";
import proof9 from "@/assets/results/proof-09.webp";
import proof10 from "@/assets/results/proof-10.webp";
import proof11 from "@/assets/results/proof-11.webp";
import proof12 from "@/assets/results/proof-12.webp";

// Styled to match the homepage (src/inspirova.html): same colours, Poppins / Inter /
// JetBrains Mono, pill navigation, gradient buttons and glass cards. Styles are scoped
// under .results-site in src/styles.css so the admin is unaffected.

const proofs: { src: string; caption: string; wide?: boolean }[] = [
  {
    src: proof4,
    wide: true,
    caption: "2× revenue in 60 days — client broke their first $35K month.",
  },
  { src: proof5, caption: "$68K in conversion value from $2.4K ad spend — 28× blended ROAS." },
  { src: proof3, caption: "4,056 leads from a single lead-gen campaign." },
  { src: proof7, caption: "Conversion rate up to 11.45% on top retargeting segment." },
  { src: proof1, wide: true, caption: "Scaling individual campaigns to 89× purchase ROAS." },
  {
    src: proof2,
    wide: true,
    caption: "1,508× return on a single hero ad — $18.8K conversion value.",
  },
  { src: proof6, caption: "Shopify store green for 4 straight months under our system." },
  {
    src: proof8,
    caption: "$116,355 in sales and 1,300 orders in 30 days — up 79% and 74% on the period before.",
  },
  {
    src: proof9,
    caption:
      "$72,804 generated from ads alone in 60 days — individual campaigns at 74×, 78× and 89× purchase ROAS.",
  },
  {
    src: proof10,
    caption: "$49,834 in 7 days — 370 orders at a 12.84% conversion rate, +171% week over week.",
  },
  {
    src: proof11,
    caption:
      "Client shoutout: $71,595 gross sales (+165%) to open Q4, plus 115 qualified website leads at $21.51 each.",
  },
  { src: proof12, caption: "Lead-gen client closing a $4,000 job from a single lead." },
];

const REVENUE_TOTAL = 1037785;

const headlineStats = [
  { k: "$293.9K", v: "Q1 2026 revenue", sub: "Across client accounts" },
  { k: "89×", v: "Peak ROAS", sub: "Individual campaign, purchase ROAS" },
  { k: "4,056", v: "Leads in one campaign", sub: "Single lead-gen test window" },
  { k: "$68K", v: "Generated from ads", sub: "In one month, from $2.4K spend" },
];

const caseStudies = [
  {
    tag: "E-commerce · Paid Ads",
    title: "From flat months to a $35K breakout",
    body: "From sub-$10K months to breaking $35K in 60 days — now climbing toward $200K.",
    metrics: [
      { k: "+27%", v: "Total sales" },
      { k: "+23%", v: "Orders" },
      { k: "+17%", v: "Conversion rate" },
    ],
  },
  {
    tag: "DTC · Meta Ads",
    title: "$68K in 1 month from paid alone",
    body: "$2.4K ad spend returned $68K in conversion value — 28× blended ROAS.",
    metrics: [
      { k: "28×", v: "Blended ROAS" },
      { k: "$2.4K", v: "Ad spend" },
      { k: "$68K", v: "Conversion value" },
    ],
  },
  {
    tag: "Lead Gen · Meta Ads",
    title: "4,056 leads from a single campaign",
    body: "Lead-gen creative at scale. Top campaign drove 4,056 leads; 6,657 total across the test window.",
    metrics: [
      { k: "4,056", v: "Top campaign leads" },
      { k: "15,869", v: "Reach" },
      { k: "6,657", v: "Total leads" },
    ],
  },
  {
    tag: "Shopify · Retention",
    title: "2× revenue in 60 days",
    body: "Retargeting and email restructured. Revenue doubled, conversion rate climbed, repeat customers growing monthly.",
    metrics: [
      { k: "2×", v: "Revenue vs Jan" },
      { k: "6.91%", v: "Conv. rate" },
      { k: "11.45%", v: "Top segment CR" },
    ],
  },
  {
    tag: "Premium Ads",
    title: "1,508× return on a hero ad",
    body: "One creative hit 1,508% ROAS, $18.8K value and 1.96% CTR — hook-first short-form framework.",
    metrics: [
      { k: "83×", v: "Purchase ROAS" },
      { k: "1.96%", v: "CTR" },
      { k: "$18.8K", v: "Conv. value" },
    ],
  },
  {
    tag: "Email Marketing",
    title: "Always-on revenue from the list",
    body: "Welcome flows, FOMO sequences, win-back and post-purchase automations — predictable revenue, done-for-you.",
    metrics: [
      { k: "30+", v: "Brands served" },
      { k: "2 yrs", v: "Track record" },
      { k: "100%", v: "Done-for-you" },
    ],
  },
];

// Same business types and icons as the homepage scroller.
const tradesServices: [string, string][] = [
  ["Roofers", "M3 11l9-7 9 7M5 10v10h14V10"],
  ["HVAC", "M12 10V3c3 0 4 3 2 5M14 12h7c0 3-3 4-5 2M12 14v7c-3 0-4-3-2-5M10 12H3c0-3 3-4 5-2"],
  ["Tree services", "M12 22v-6M12 2l6 9h-3l4 5H5l4-5H6z"],
  ["Landscapers", "M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7"],
  ["Cleaning companies", "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"],
  [
    "Plumbers",
    "M14.5 6.5a4 4 0 0 0-5.4 5l-6 6 2.4 2.4 6-6a4 4 0 0 0 5-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  ],
  ["Solar installers", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2"],
  ["Gutter cleaning", "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
  ["Fencing", "M5 21V7l2-3 2 3v14M15 21V7l2-3 2 3v14M3 11h18M3 17h18"],
  ["Garage doors", "M3 21V9l9-5 9 5v12M7 21v-9h10v9M7 15h10M7 18h10"],
  ["Window installers", "M4 3h16v18H4zM12 3v18M4 12h16"],
  ["Concrete & paving", "M3 20h18M5 20l3-12h8l3 12M10 8l-1 12M14 8l1 12"],
];
const tradesOnline: [string, string][] = [
  ["Shopify stores", "M6 8h12l-1 13H7zM9 8a3 3 0 0 1 6 0"],
  ["DTC brands", "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"],
  ["E-commerce brands", "M3 4h2l2.4 11h11l2-8H6.2M9 20h.01M17 20h.01"],
  [
    "Local service businesses",
    "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  ],
  ["B2B services", "M3 7h18v13H3zM9 7V5h6v2M3 13h18"],
  ["Home improvement", "M15 4l5 5-3 3-5-5zM12 7l-9 9 3 3 9-9"],
];

function TradeRow({
  items,
  copies,
  coral,
  reverse,
}: {
  items: [string, string][];
  copies: number;
  coral?: boolean;
  reverse?: boolean;
}) {
  return (
    <div className={reverse ? "rs-marquee rs-rev" : "rs-marquee"}>
      <div
        className="rs-marquee-track"
        style={{ animationDuration: `${items.length * copies * 2.6}s` }}
      >
        {Array.from({ length: copies * 2 }, (_, copy) =>
          items.map(([name, d]) => (
            <span
              key={`${copy}-${name}`}
              className={coral ? "rs-trade rs-c" : "rs-trade"}
              aria-hidden={copy > 0 ? true : undefined}
            >
              <span className="rs-ti">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={d} />
                </svg>
              </span>
              {name}
            </span>
          )),
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "$1M+ in tracked client revenue — Inspirova Marketing" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "$1,037,785 in verified client revenue tracked across Shopify, Meta Ads and GHL dashboards. Real screenshots, real numbers, real brands.",
      },
      { property: "og:title", content: "$1,037,785 generated for clients — Inspirova" },
      {
        property: "og:description",
        content:
          "A 7-figure milestone, screenshotted straight from client dashboards. See the receipts.",
      },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  return (
    <main id="main-content" className="results-site">
      <header className="rs-header">
        <div className="rs-wrap">
          <div className="rs-nav-shell">
            <Link to="/" className="rs-brand" aria-label="Inspirova home">
              <img src={logo} alt="" width={22} height={16} /> Inspirova
            </Link>
            <nav className="rs-nav-links" aria-label="Main">
              <a href="/#services">Marketing</a>
              <a href="/#how">How it works</a>
              <a href="/#pricing">Pricing</a>
              <Link to="/results" className="rs-active" aria-current="page">
                Results
              </Link>
              <a href="/#faq">FAQ</a>
            </nav>
            <div className="rs-nav-cta">
              <a href="/#quoteForm" className="rs-btn rs-btn-primary rs-btn-small">
                Get a quote
              </a>
              <Link to="/admin" className="rs-btn rs-btn-outline rs-btn-small">
                Login
              </Link>
            </div>
          </div>
        </div>
      </header>

      <section className="rs-hero">
        <div className="rs-wrap rs-hero-grid">
          <div className="rs-hero-copy">
            <div className="rs-eye">The work, in numbers</div>
            <h1>
              Inspirova. <span className="rs-lime">The results.</span>
            </h1>
            <div className="rs-total">${REVENUE_TOTAL.toLocaleString("en-US")}</div>
            <p className="rs-sub">
              In tracked client revenue. Shopify, Meta Ads and GHL — the numbers, straight from
              client dashboards.
            </p>
            <div className="rs-cta">
              <a href="/#quoteForm" className="rs-btn rs-btn-primary">
                Request your quote{" "}
                <span className="rs-arr" aria-hidden="true">
                  →
                </span>
              </a>
              <a href="#receipts" className="rs-btn rs-btn-ghost">
                See the receipts
              </a>
            </div>
            <p className="rs-note">
              <strong>Estimate only.</strong> Prices shown are not final and may change based on
              your business and agreed services.
            </p>
          </div>
          <figure className="rs-hero-shot">
            <img
              src={proof8}
              alt="Shopify live view: $116,355 in sales and 1,300 orders in 30 days"
              width={1000}
              height={860}
            />
            <figcaption>$116,355 in 30 days, from a client&apos;s Shopify dashboard.</figcaption>
          </figure>
        </div>
      </section>

      <section className="rs-stats-wrap" aria-label="Headline numbers">
        <div className="rs-wrap rs-stats">
          {headlineStats.map((stat) => (
            <div key={stat.v} className="rs-pstat">
              <div className="rs-pstat-num">{stat.k}</div>
              <div className="rs-pstat-lbl">{stat.v}</div>
              <div className="rs-pstat-sub">{stat.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rs-trades" aria-labelledby="rs-trades-title">
        <div className="rs-head rs-center">
          <div className="rs-eye">Who we work with</div>
          <h2 id="rs-trades-title">
            Built for <span className="rs-v">service businesses</span> and{" "}
            <span className="rs-c-text">online brands</span>.
          </h2>
        </div>
        <TradeRow items={tradesServices} copies={2} />
        <TradeRow items={tradesOnline} copies={3} coral reverse />
      </section>

      <section className="rs-section" aria-labelledby="rs-behind">
        <div className="rs-wrap">
          <div className="rs-head rs-center">
            <div className="rs-eye">Selected client work</div>
            <h2 id="rs-behind">
              Behind the <span className="rs-grad">numbers.</span>
            </h2>
          </div>
          <div className="rs-cases">
            {caseStudies.map((study) => (
              <article key={study.title} className="rs-pcard">
                <div className="rs-tag">{study.tag}</div>
                <h3>{study.title}</h3>
                <p>{study.body}</p>
                <div className="rs-metrics">
                  {study.metrics.map((m) => (
                    <div key={m.v}>
                      <b>{m.k}</b>
                      <span>{m.v}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rs-section" id="receipts" aria-labelledby="rs-receipts-title">
        <div className="rs-wrap">
          <div className="rs-head rs-center">
            <div className="rs-eye">The receipts</div>
            <h2 id="rs-receipts-title">
              From real <span className="rs-grad">client dashboards.</span>
            </h2>
            <p className="rs-sub">
              Campaign performance and store results, shown in the platforms where the work happens.
              Tap any screenshot to see it full size.
            </p>
          </div>
          <div className="rs-gallery">
            {proofs.map((proof, index) => (
              <figure key={proof.src} className={proof.wide ? "rs-shot rs-wide" : "rs-shot"}>
                <a
                  href={proof.src}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Open full size: ${proof.caption}`}
                >
                  <img src={proof.src} alt={proof.caption} loading={index < 2 ? "eager" : "lazy"} />
                </a>
                <figcaption>{proof.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="rs-close">
        <div className="rs-wrap">
          <div className="rs-close-card">
            <div className="rs-eye">Your business next</div>
            <h2>
              Let&apos;s get to <span className="rs-grad">work.</span>
            </h2>
            <p className="rs-sub">
              Tell us about your brand. We&apos;ll build a growth plan around your business.
            </p>
            <div className="rs-cta rs-center-row">
              <a href="/#quoteForm" className="rs-btn rs-btn-primary">
                Request your quote{" "}
                <span className="rs-arr" aria-hidden="true">
                  →
                </span>
              </a>
              <Link to="/" className="rs-btn rs-btn-ghost">
                Back home
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="rs-footer">
        <div className="rs-wrap rs-foot">
          <nav className="rs-foot-links" aria-label="Footer">
            <a href="/#services">Marketing</a>
            <a href="/#how">How it works</a>
            <a href="/#pricing">Pricing</a>
            <Link to="/results">Results</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/admin">Login</Link>
          </nav>
          <div>© 2024 Inspirova. Built to inspire.</div>
        </div>
      </footer>
    </main>
  );
}
