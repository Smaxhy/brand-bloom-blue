import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import logo from "@/assets/inspirova-logo.png";
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
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Target, Megaphone, Sparkles, Mail, ShoppingBag, Camera, BadgeCheck } from "lucide-react";

const proofs = [
  { src: proof4, caption: "2× revenue in 60 days — client broke their first $35K month." },
  { src: proof5, caption: "$68K in conversion value from $2.4K ad spend — 28× blended ROAS." },
  { src: proof3, caption: "4,056 leads from a single lead-gen campaign." },
  { src: proof7, caption: "Conversion rate up to 11.45% on top retargeting segment." },
  { src: proof1, caption: "Scaling individual campaigns to 89× purchase ROAS." },
  { src: proof2, caption: "1,508× return on a single hero ad — $18.8K conversion value." },
  { src: proof6, caption: "Shopify store green for 4 straight months under our system." },
  { src: proof8, caption: "$116,355 in sales and 1,300 orders in 30 days — up 79% and 74% on the period before." },
  { src: proof9, caption: "$72,804 generated from ads alone in 60 days — individual campaigns at 74×, 78× and 89× purchase ROAS." },
  { src: proof10, caption: "$49,834 in 7 days — 370 orders at a 12.84% conversion rate, +171% week over week." },
  { src: proof11, caption: "Client shoutout: $71,595 gross sales (+165%) to open Q4, plus 115 qualified website leads at $21.51 each." },
  { src: proof12, caption: "Lead-gen client closing a $4,000 job from a single lead." },
];

const REVENUE_TOTAL = 1037785;

function useCountUp(target: number, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
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
        content: "A 7-figure milestone, screenshotted straight from client dashboards. See the receipts.",
      },
    ],
  }),
  component: ResultsPage,
});

const headlineStats = [
  { k: "$293.9K", v: "Q1 2026 revenue", icon: TrendingUp },
  { k: "89×", v: "Peak ROAS", icon: Target },
  { k: "4,056", v: "Leads in one campaign", icon: Sparkles },
  { k: "$68K", v: "Generated from ads (1 month)", icon: Megaphone },
];

const caseStudies = [
  {
    tag: "E-commerce · Paid Ads",
    icon: ShoppingBag,
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
    icon: Megaphone,
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
    icon: Sparkles,
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
    icon: TrendingUp,
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
    icon: Target,
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
    icon: Mail,
    title: "Always-on revenue from the list",
    body: "Welcome flows, FOMO sequences, win-back and post-purchase automations — predictable revenue, done-for-you.",
    metrics: [
      { k: "30+", v: "Brands served" },
      { k: "2 yrs", v: "Track record" },
      { k: "100%", v: "Done-for-you" },
    ],
  },
];

function ResultsPage() {
  const animated = useCountUp(REVENUE_TOTAL);
  return (
    <main id="main-content" className="public-site results-site min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2 text-lg font-medium">
            <img src={logo} alt="" className="h-7 w-7 object-contain" /> Inspirova®
          </Link>
          <Button asChild variant="outline" className="min-h-11 rounded-md shadow-none">
            <Link to="/"><ArrowLeft /> Back home</Link>
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 pt-12 pb-12 sm:px-8 sm:pt-16">
        <div className="flex justify-between border-b border-border pb-4 text-xs text-muted-foreground">
          <span>THE WORK, IN NUMBERS</span><span>CLIENT RESULTS</span>
        </div>
        <h1 className="mt-8 text-3xl font-medium sm:text-4xl">Inspirova. The results.</h1>
        <div className="mt-5 text-4xl font-medium tabular-nums text-primary sm:text-6xl">
          ${animated.toLocaleString("en-US")}
        </div>
        <p className="mt-5 max-w-xl text-base text-muted-foreground">
          In tracked client revenue. Shopify, Meta Ads and GHL — the numbers, straight from client dashboards.
        </p>
        <div className="mt-6 flex flex-col items-start gap-3">
          <Button asChild className="min-h-12 rounded-md px-6">
            <a href="/#quoteForm">Request your quote <span aria-hidden="true">↗</span></a>
          </Button>
          <p className="max-w-xl text-sm text-muted-foreground"><strong className="text-foreground">Estimate only.</strong> Prices shown are not final and may change based on your business and agreed services.</p>
        </div>
        <div className="mt-8 grid grid-cols-2 border-y border-border md:grid-cols-4">
          {headlineStats.map((stat) => (
            <div key={stat.v} className="py-6 pr-4">
              <div className="text-2xl font-medium">{stat.k}</div>
              <div className="mt-2 text-xs text-muted-foreground">{stat.v}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-secondary py-12 text-foreground sm:py-16">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <p className="text-xs text-accent">SELECTED CLIENT WORK</p>
          <h2 className="mt-4 text-3xl font-medium">Behind the numbers.</h2>
          <div className="mt-8">
            {caseStudies.map((study, index) => (
              <article key={study.title} className="grid gap-5 border-t border-border py-7 md:grid-cols-[180px_1fr_1fr] md:gap-8">
                <div className="text-xs text-accent">0{index + 1} / {study.tag}</div>
                <div>
                  <h3 className="text-xl font-medium">{study.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{study.body}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {study.metrics.map((metric) => (
                    <div key={metric.v}>
                      <div className="text-lg font-medium">{metric.k}</div>
                      <div className="mt-2 text-xs text-muted-foreground">{metric.v}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs text-primary">THE RECEIPTS</p>
        <h2 className="mt-4 text-3xl font-medium">From real client dashboards.</h2>
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">Campaign performance and store results, shown in the platforms where the work happens.</p>
        <div className="mt-8 grid items-start gap-8 md:grid-cols-2">
          {proofs.map((proof, index) => (
            <figure key={proof.src} className={index === 0 ? "md:col-span-2" : ""}>
              <div className={index === 4 || index === 5 ? "proof-image-frame proof-image-frame-wide" : "proof-image-frame"}>
                <img src={proof.src} alt={proof.caption} loading="lazy" />
              </div>
              <figcaption className="border-b border-border py-4 text-sm text-muted-foreground"><span className="mr-3 text-primary">0{index + 1}</span>{proof.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="bg-secondary py-12 text-foreground sm:py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 sm:px-8 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-medium">Let's get to work.</h2>
            <p className="mt-4 max-w-lg text-sm text-muted-foreground">Tell us about your brand. We'll build a growth plan around your business.</p>
          </div>
          <Button asChild className="min-h-12 rounded-md bg-primary px-6 text-primary-foreground shadow-none hover:bg-primary/90">
            <a href="/#quoteForm">Request your quote <span aria-hidden="true">↗</span></a>
          </Button>
        </div>
      </section>
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl justify-between gap-4 px-5 text-sm text-muted-foreground sm:px-8">
          <span>Inspirova. Built to market.</span><Link to="/privacy" className="hover:text-primary">Privacy Policy</Link>
        </div>
      </footer>
    </main>
  );
}
