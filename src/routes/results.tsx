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

// Every figure below is the client's own, read from their dashboards. Design
// rules for this page and the homepage live in DESIGN.md ("the honest quote").

const proofs = [
  {
    src: proof4,
    wide: true,
    caption: "2× revenue in 60 days. The client broke their first $35K month.",
  },
  { src: proof5, caption: "$68K in conversion value from $2.4K ad spend, a 28× blended ROAS." },
  { src: proof3, caption: "4,056 leads from a single lead-gen campaign." },
  { src: proof7, caption: "Conversion rate up to 11.45% on the top retargeting segment." },
  { src: proof1, wide: true, caption: "Scaling individual campaigns to 89× purchase ROAS." },
  {
    src: proof2,
    wide: true,
    caption: "1,508× return on a single hero ad, with $18.8K in conversion value.",
  },
  { src: proof6, caption: "A Shopify store green for 4 straight months under our system." },
  {
    src: proof8,
    caption: "$116,355 in sales and 1,300 orders in 30 days, up 79% and 74% on the period before.",
  },
  {
    src: proof9,
    caption:
      "$72,804 from ads alone in 60 days, with individual campaigns at 74×, 78× and 89× purchase ROAS.",
  },
  {
    src: proof10,
    caption: "$49,834 in 7 days: 370 orders at a 12.84% conversion rate, up 171% week over week.",
  },
  {
    src: proof11,
    caption:
      "Client shoutout: $71,595 gross sales (+165%) to open Q4, plus 115 qualified website leads at $21.51 each.",
  },
  { src: proof12, caption: "A lead-gen client closing a $4,000 job from a single lead." },
];

const REVENUE_TOTAL = 1037785;

const highlights = [
  { label: "Q1 2026 revenue", value: "$293.9K" },
  { label: "Peak ROAS", value: "89×" },
  { label: "Leads in one campaign", value: "4,056" },
  { label: "Generated from ads in one month", value: "$68K" },
];

const caseStudies = [
  {
    tag: "E-commerce, paid ads",
    title: "From flat months to a $35K breakout",
    body: "From sub-$10K months to breaking $35K in 60 days, and now climbing toward $200K.",
    metrics: [
      { k: "+27%", v: "Total sales" },
      { k: "+23%", v: "Orders" },
      { k: "+17%", v: "Conversion rate" },
    ],
  },
  {
    tag: "DTC, Meta ads",
    title: "$68K in 1 month from paid alone",
    body: "$2.4K in ad spend returned $68K in conversion value, a 28× blended ROAS.",
    metrics: [
      { k: "28×", v: "Blended ROAS" },
      { k: "$2.4K", v: "Ad spend" },
      { k: "$68K", v: "Conversion value" },
    ],
  },
  {
    tag: "Lead generation, Meta ads",
    title: "4,056 leads from a single campaign",
    body: "Lead-gen creative at scale. The top campaign drove 4,056 leads, with 6,657 in total across the test window.",
    metrics: [
      { k: "4,056", v: "Top campaign leads" },
      { k: "15,869", v: "Reach" },
      { k: "6,657", v: "Total leads" },
    ],
  },
  {
    tag: "Shopify, retention",
    title: "2× revenue in 60 days",
    body: "Retargeting and email restructured. Revenue doubled, the conversion rate climbed and repeat customers grow every month.",
    metrics: [
      { k: "2×", v: "Revenue vs Jan" },
      { k: "6.91%", v: "Conversion rate" },
      { k: "11.45%", v: "Top segment CR" },
    ],
  },
  {
    tag: "Paid ads creative",
    title: "1,508× return on a hero ad",
    body: "One creative hit a 1,508% ROAS, $18.8K in value and a 1.96% CTR, using a hook-first short-form framework.",
    metrics: [
      { k: "83×", v: "Purchase ROAS" },
      { k: "1.96%", v: "CTR" },
      { k: "$18.8K", v: "Conversion value" },
    ],
  },
  {
    tag: "Email marketing",
    title: "Always-on revenue from the list",
    body: "Welcome flows, FOMO sequences, win-back and post-purchase automations, for predictable revenue that is done for you.",
    metrics: [
      { k: "30+", v: "Brands served" },
      { k: "2 yrs", v: "Track record" },
      { k: "100%", v: "Done for you" },
    ],
  },
];

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
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,600..900&family=Public+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  return (
    <main id="main-content" className="results-site">
      <header className="rs-header">
        <div className="rs-wrap rs-nav">
          <Link to="/" className="rs-brand" aria-label="Inspirova home">
            <img src={logo} alt="" width={34} height={25} /> Inspirova
          </Link>
          <div className="rs-nav-actions">
            <Link to="/" className="rs-btn rs-btn-quiet rs-hide-small">
              Back home
            </Link>
            <a href="/#quoteForm" className="rs-btn rs-btn-primary">
              Request your quote
            </a>
          </div>
        </div>
      </header>

      <section className="rs-hero">
        <div className="rs-wrap rs-hero-grid">
          <div className="rs-hero-copy">
            <h1>
              <span className="rs-total">${REVENUE_TOTAL.toLocaleString("en-US")}</span> in tracked
              client revenue.
            </h1>
            <p className="rs-lead">
              Shopify, Meta Ads and GHL. Every number on this page is screenshotted straight from
              client dashboards.
            </p>
            <div className="rs-actions">
              <a href="/#quoteForm" className="rs-btn rs-btn-primary">
                Request your quote
              </a>
              <a href="#receipts" className="rs-btn rs-btn-quiet">
                See the screenshots
              </a>
            </div>
            <p className="rs-note">
              <strong>Estimate only.</strong> Prices shown are not final and may change based on
              your business and agreed services.
            </p>
          </div>
          <aside className="rs-statement" aria-labelledby="rs-highlights">
            <h2 id="rs-highlights">Highlights from client accounts</h2>
            <dl>
              {highlights.map((h) => (
                <div key={h.label} className="rs-line">
                  <dt>{h.label}</dt>
                  <dd>{h.value}</dd>
                </div>
              ))}
            </dl>
            <p className="rs-small">From Shopify, Meta Ads and GHL dashboards.</p>
          </aside>
        </div>
      </section>

      <section className="rs-band" aria-labelledby="rs-behind">
        <div className="rs-wrap">
          <div className="rs-head">
            <h2 id="rs-behind">Behind the numbers.</h2>
            <p className="rs-lead">
              Six pieces of client work, what we changed and what it returned.
            </p>
          </div>
          <div className="rs-cases">
            {caseStudies.map((study) => (
              <article key={study.title} className="rs-case">
                <div className="rs-case-text">
                  <h3>{study.title}</h3>
                  <p className="rs-case-tag">{study.tag}</p>
                  <p>{study.body}</p>
                </div>
                <dl className="rs-case-ledger">
                  {study.metrics.map((m) => (
                    <div key={m.v} className="rs-line">
                      <dt>{m.v}</dt>
                      <dd>{m.k}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rs-receipts" id="receipts" aria-labelledby="rs-receipts-title">
        <div className="rs-wrap">
          <div className="rs-head">
            <h2 id="rs-receipts-title">From real client dashboards.</h2>
            <p className="rs-lead">
              Campaign performance and store results, shown in the platforms where the work happens.
              Select a screenshot to open it full size.
            </p>
          </div>
          <div className="rs-gallery">
            {proofs.map((proof, index) => (
              <figure
                key={proof.src}
                className={"wide" in proof && proof.wide ? "rs-shot rs-shot-wide" : "rs-shot"}
              >
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
            <div>
              <h2>Let's get to work.</h2>
              <p className="rs-lead">
                Tell us about your brand. We'll build a growth plan around your business.
              </p>
            </div>
            <a href="/#quoteForm" className="rs-btn rs-btn-primary">
              Request your quote
            </a>
          </div>
        </div>
      </section>

      <footer className="rs-footer">
        <div className="rs-wrap rs-foot">
          <span>Inspirova. Built to market.</span>
          <nav aria-label="Footer">
            <Link to="/">Home</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
