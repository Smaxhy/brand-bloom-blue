import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import logo from "@/assets/inspirova-logo.png";
import proof1 from "@/assets/proof-1.png";
import proof2 from "@/assets/proof-2.png";
import proof3 from "@/assets/proof-3.png";
import proof4 from "@/assets/proof-4.png";
import proof5 from "@/assets/proof-5.png";
import proof6 from "@/assets/proof-6.png";
import proof7 from "@/assets/proof-7.png";
import { ArrowLeft, TrendingUp, Target, Megaphone, Sparkles, Mail, ShoppingBag, Camera } from "lucide-react";

const proofs = [
  { src: proof4, caption: "2× revenue in 60 days — client broke their first $35K month." },
  { src: proof5, caption: "$68K in conversion value from $2.4K ad spend — 28× blended ROAS." },
  { src: proof3, caption: "4,056 leads from a single lead-gen campaign." },
  { src: proof7, caption: "Conversion rate up to 11.45% on top retargeting segment." },
  { src: proof1, caption: "Scaling individual campaigns to 89× purchase ROAS." },
  { src: proof2, caption: "1,508× return on a single hero ad — $18.8K conversion value." },
  { src: proof6, caption: "Shopify store green for 4 straight months under our system." },
];

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Results & Portfolio — Inspirova Marketing" },
      {
        name: "description",
        content:
          "Real numbers from real brands. Inspirova's portfolio of paid ads, email and lead-gen campaigns generating millions in client revenue.",
      },
      { property: "og:title", content: "Results & Portfolio — Inspirova" },
      {
        property: "og:description",
        content: "Real client results: 89× ROAS, $293K Q1 revenue, 4,000+ leads and counting.",
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
  return (
    <main className="min-h-screen">
      <header className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="Inspirova" className="h-9 w-9 rounded-md object-cover" />
            <span className="text-lg font-semibold tracking-tight">Inspirova</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back home
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden pt-32 pb-20 md:pt-44 md:pb-28">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--brand-purple) 22%, transparent) 0%, transparent 70%), radial-gradient(40% 40% at 80% 20%, color-mix(in oklab, var(--brand-blue) 25%, transparent) 0%, transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight md:text-7xl">
            Real businesses <span className="text-gradient-brand">real numbers.</span>
          </h1>

          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
            {headlineStats.map((s) => (
              <div key={s.v} className="rounded-2xl border border-border bg-card p-6 shadow-card">
                <s.icon className="h-5 w-5 text-primary" />
                <div className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">{s.k}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-soft py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Case studies</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              Selected <span className="text-gradient-brand">client work.</span>
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2">
            {caseStudies.map((c) => (
              <article
                key={c.title}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-card transition-all hover:-translate-y-1 hover:shadow-glow"
              >
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <c.icon className="h-3.5 w-3.5" />
                  {c.tag}
                </div>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.body}</p>

                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-5">
                  {c.metrics.map((m) => (
                    <div key={m.v}>
                      <div className="text-lg font-semibold tracking-tight text-gradient-brand md:text-xl">
                        {m.k}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{m.v}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <Camera className="h-3.5 w-3.5" /> Picture proof
            </div>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              Receipts from real <span className="text-gradient-brand">client dashboards.</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Screenshots straight from Meta Ads Manager, Shopify and our analytics — no edits, no fluff.
            </p>
          </div>

          <div className="mt-12 columns-1 gap-6 sm:columns-2 lg:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
            {proofs.map((p, i) => (
              <figure
                key={i}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-1 hover:shadow-glow"
              >
                <img src={p.src} alt={p.caption} loading="lazy" className="block w-full" />
                <figcaption className="border-t border-border p-4 text-sm text-muted-foreground">
                  {p.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 md:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">
            Want to be the <span className="text-gradient-brand">next case study?</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Slide into the DMs. We'll come back with a plan tailored to your brand.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://instagram.com/max.grchv"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-medium text-white shadow-glow transition-transform hover:scale-[1.03]"
            >
              DM @max.grchv
            </a>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" /> Back home
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" className="h-6 w-6 rounded object-cover" />
            <span>© {new Date().getFullYear()} Inspirova Marketing</span>
          </div>
          <div>Built to market.</div>
        </div>
      </footer>
    </main>
  );
}
