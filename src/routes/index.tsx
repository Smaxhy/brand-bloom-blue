import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/inspirova-logo.png";
import { Megaphone, Mail, Globe, Video, ArrowRight, Sparkles, Target, TrendingUp, Instagram } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inspirova — Marketing Agency That Scales Brands" },
      {
        name: "description",
        content:
          "Inspirova is a full-service digital marketing agency helping brands scale with paid ads, email funnels, websites and short-form video.",
      },
      { property: "og:title", content: "Inspirova — Marketing Agency" },
      {
        property: "og:description",
        content: "We build paid ads, email funnels, websites and video that turn attention into revenue.",
      },
    ],
  }),
  component: Index,
});

function Nav() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2">
          <img src={logo} alt="Inspirova" className="h-9 w-9 rounded-md object-cover" />
          <span className="text-lg font-semibold tracking-tight">Inspirova</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#services" className="transition-colors hover:text-foreground">Services</a>
          <a href="#about" className="transition-colors hover:text-foreground">About</a>
          <Link to="/results" className="transition-colors hover:text-foreground">Results</Link>
          <a href="#team" className="transition-colors hover:text-foreground">Team</a>
          <a href="#contact" className="transition-colors hover:text-foreground">Contact</a>
        </nav>
        <a
          href="#contact"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-4 py-2 text-sm font-medium text-white shadow-glow transition-transform hover:scale-[1.03]"
        >
          Work with us <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-24 md:pt-44 md:pb-36">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--brand-purple) 22%, transparent) 0%, transparent 70%), radial-gradient(40% 40% at 80% 20%, color-mix(in oklab, var(--brand-blue) 25%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-6xl px-6 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Full-service digital marketing agency
        </div>
        <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight md:text-7xl">
          We create to <span className="text-gradient-brand">inspire.</span>
        </h1>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-medium text-white shadow-glow transition-transform hover:scale-[1.03]"
          >
            Start scaling <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#services"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            What we do
          </a>
        </div>

        <div className="mx-auto mt-20 grid max-w-3xl grid-cols-3 gap-6 border-t border-border pt-10">
          {[
            { k: "30+", v: "Brands scaled" },
            { k: "28×", v: "Average ROAS" },
            { k: "$293K", v: "Generated in Q1" },
          ].map((s) => (
            <div key={s.v} className="text-center">
              <div className="text-3xl font-semibold tracking-tight text-gradient-brand md:text-4xl">{s.k}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const services = [
  {
    icon: Megaphone,
    title: "Paid Advertising",
    desc: "Pixel setup, audience research, retargeting and ROAS-driven Meta & Google campaigns built to scale.",
  },
  {
    icon: Mail,
    title: "Email Marketing",
    desc: "FOMO sequences, discount funnels and re-engagement flows that turn your list into a revenue engine.",
  },
  {
    icon: Globe,
    title: "Websites + AI",
    desc: "Full store builds, conversion-focused UX and AI chatbots handling customers around the clock.",
  },
  {
    icon: Video,
    title: "Short-Form Video",
    desc: "Hook-optimised Reels, TikToks and ad creative engineered to stop the scroll and convert.",
  },
];

function Services() {
  return (
    <section id="services" className="bg-gradient-soft py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-widest text-primary">What we do</div>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Four levers. <span className="text-gradient-brand">Compounding growth.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Every service plugs into the same system — built so each part makes the others perform better.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {services.map((s) => (
            <div
              key={s.title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-card transition-all hover:-translate-y-1 hover:shadow-glow"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2 md:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-primary">About</div>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Marketing built to <span className="text-gradient-brand">move numbers.</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Inspirova is a full-service digital marketing agency partnering with brands that are ready to
            treat marketing like the growth engine it actually is.
          </p>
          <p className="mt-4 text-muted-foreground">
            We plug into your business across paid ads, email, websites and short-form content — running
            the system end-to-end so you can stay focused on the product.
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-brand opacity-20 blur-3xl" />
          <div className="text-xs font-semibold uppercase tracking-widest text-primary">
            Recent results from 2026
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {[
              { icon: TrendingUp, k: "$293.9K", v: "Revenue generated" },
              { icon: Target, k: "2,760+", v: "Orders fulfilled" },
              { icon: Sparkles, k: "6.79%", v: "Avg conv. rate" },
              { icon: Megaphone, k: "91×", v: "Peak ROAS" },
            ].map((m) => (
              <div key={m.v} className="rounded-2xl border border-border bg-card p-6 shadow-card">
                <m.icon className="h-5 w-5 text-primary" />
                <div className="mt-4 text-3xl font-semibold tracking-tight">{m.k}</div>
                <div className="mt-1 text-sm text-muted-foreground">{m.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Results() {
  return (
    <section id="results" className="relative overflow-hidden py-24 md:py-32" style={{ background: "var(--brand-ink)" }}>
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(50% 50% at 20% 30%, color-mix(in oklab, var(--brand-blue) 60%, transparent) 0%, transparent 60%), radial-gradient(50% 50% at 80% 70%, color-mix(in oklab, var(--brand-purple) 60%, transparent) 0%, transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-6 text-center text-white">
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "color-mix(in oklab, var(--brand-blue) 80%, white)" }}>
          2026 results so far
        </div>
        <h2 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Q1 2026 outperformed peak holiday season — on the same store.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
          $293.9K in the slowest quarter of the year vs $191.2K in Q4 holiday peak. That's the system working.
        </p>

        <blockquote className="mx-auto mt-16 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
          <p className="text-lg italic text-white/90">
            “Lowkey the only people we've met in the scaling industry who are genuinely interested in
            the best for both sides — and the results speak for themselves.”
          </p>
          <footer className="mt-4 text-sm text-white/60">— Inspirova client</footer>
        </blockquote>

        <div className="mt-12">
          <Link
            to="/results"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            See the full portfolio <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Team() {
  const members = [
    { name: "Max Grachev", role: "Agency Owner", handle: "max.grchv" },
    { name: "Santiago", role: "Founder", handle: "santago.inspirova" },
  ];
  return (
    <section id="team" className="bg-gradient-soft py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-widest text-primary">The team</div>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Operators behind <span className="text-gradient-brand">Inspirova.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A small team obsessed with building systems that move real numbers for real brands.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {members.map((m) => (
            <a
              key={m.handle}
              href={`https://instagram.com/${m.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between rounded-2xl border border-border bg-card p-8 shadow-card transition-all hover:-translate-y-1 hover:shadow-glow"
            >
              <div>
                <div className="text-xl font-semibold tracking-tight">{m.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{m.role}</div>
                <div className="mt-3 text-sm font-medium text-primary">@{m.handle}</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
                <Instagram className="h-5 w-5" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="text-xs font-semibold uppercase tracking-widest text-primary">Get in touch</div>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
          Ready to <span className="text-gradient-brand">scale?</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Tell us about your brand. We'll come back with a plan tailored to where you are and where you want
          to be.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://instagram.com/max.grchv"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-medium text-white shadow-glow transition-transform hover:scale-[1.03]"
          >
            DM @max.grchv on Instagram <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="mailto:inspirovamedia@gmail.com"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Email us
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <img src={logo} alt="" className="h-6 w-6 rounded object-cover" />
          <span>© {new Date().getFullYear()} Inspirova Marketing</span>
        </div>
        <div>Built to market.</div>
      </div>
    </footer>
  );
}

function Index() {
  return (
    <main className="min-h-screen">
      <Nav />
      <Hero />
      <Services />
      <About />
      <Results />
      <Team />
      <Contact />
      <Footer />
    </main>
  );
}
