import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, ChartNoAxesCombined, Globe2, Instagram, Mail, Megaphone, Play, ShoppingBag, Sparkles, Store, Video } from "lucide-react";
import logo from "@/assets/inspirova-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Inspirova — Marketing That Moves Brands" },
    { name: "description", content: "Inspirova builds paid media, websites, automation and creative that help ambitious brands grow." },
    { property: "og:title", content: "Inspirova — Marketing That Moves Brands" },
    { property: "og:description", content: "Paid media, websites, automation and creative built for measurable growth." },
  ] }),
  component: HomePage,
});

const services = [
  { icon: Megaphone, name: "Paid media", detail: "Meta and Google campaigns built to scale." },
  { icon: Globe2, name: "Websites", detail: "Fast, clear experiences designed to convert." },
  { icon: Bot, name: "AI automation", detail: "Smarter lead handling, support and workflows." },
  { icon: Mail, name: "Email & SMS", detail: "Automated flows that turn attention into revenue." },
  { icon: Video, name: "Content", detail: "Short-form creative made to stop the scroll." },
  { icon: ChartNoAxesCombined, name: "Growth strategy", detail: "Clear tests, clean data and decisive action." },
];

const audiences = [
  { icon: ShoppingBag, name: "E-commerce brands", detail: "More profitable acquisition and stronger retention." },
  { icon: Store, name: "Local businesses", detail: "More qualified leads and a fuller calendar." },
  { icon: Sparkles, name: "Ambitious founders", detail: "A focused growth partner without the agency bloat." },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return <a href="#top" className="flex items-center gap-3" aria-label="Inspirova home"><img src={logo} alt="" className={compact ? "h-7 w-7 rounded-lg object-cover" : "h-10 w-10 rounded-xl object-cover"} /><span className={compact ? "font-display text-base font-bold" : "font-display text-xl font-bold tracking-tight"}>Inspirova</span></a>;
}

function Nav() {
  return <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl"><nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 md:px-8" aria-label="Main navigation"><Logo /><div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex"><a href="#services" className="transition-colors hover:text-foreground">Services</a><a href="#who" className="transition-colors hover:text-foreground">Who we help</a><a href="#results" className="transition-colors hover:text-foreground">Results</a><a href="#team" className="transition-colors hover:text-foreground">Team</a></div><a href="#contact" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand transition-transform hover:-translate-y-0.5">Work with us <ArrowRight className="h-4 w-4" /></a></nav></header>;
}

function Hero() {
  return <section id="top" className="relative overflow-hidden px-5 pb-20 pt-32 md:px-8 md:pb-28 md:pt-44"><div className="hero-orb hero-orb-one" aria-hidden="true" /><div className="hero-orb hero-orb-two" aria-hidden="true" /><div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.08fr_.92fr]"><div><div className="eyebrow"><span /> Independent growth agency</div><h1 className="mt-7 max-w-4xl font-display text-6xl font-extrabold leading-[.92] tracking-[-.045em] sm:text-7xl lg:text-[6.3rem]">We make brands <span className="text-gradient-warm">impossible to ignore.</span></h1><p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">Strategy, creative and technology built around one goal: growth you can measure.</p><div className="mt-9 flex flex-wrap gap-3"><a href="#contact" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 font-semibold text-primary-foreground shadow-brand transition-transform hover:-translate-y-0.5">Start a project <ArrowRight className="h-4 w-4" /></a><Link to="/results" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 font-semibold transition-colors hover:bg-secondary"><Play className="h-4 w-4 text-primary" /> See our results</Link></div><div className="mt-14 flex gap-9 border-t border-border pt-7 sm:gap-14">{[["30+", "Brands helped"], ["28×", "Average ROAS"], ["$293K", "Generated in Q1"]].map(([value, label]) => <div key={label}><div className="font-display text-2xl font-bold md:text-3xl">{value}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{label}</div></div>)}</div></div><div className="growth-panel"><div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.15em] text-muted-foreground"><span>Growth snapshot · 2026</span><span className="flex items-center gap-2 text-primary"><i className="h-2 w-2 rounded-full bg-primary" /> Live</span></div><svg viewBox="0 0 500 300" className="mt-8 w-full" role="img" aria-label="Upward growth chart"><defs><linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop stopColor="var(--brand-violet)" /><stop offset="1" stopColor="var(--brand-coral)" /></linearGradient><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--brand-violet)" stopOpacity=".22" /><stop offset="1" stopColor="var(--brand-violet)" stopOpacity="0" /></linearGradient></defs><path d="M10 264 C80 250 115 232 165 212 C225 187 265 170 310 126 C360 80 400 78 490 22 L490 280 L10 280Z" fill="url(#area)" /><path d="M10 264 C80 250 115 232 165 212 C225 187 265 170 310 126 C360 80 400 78 490 22" fill="none" stroke="url(#line)" strokeWidth="5" strokeLinecap="round" /></svg><div className="flex items-end justify-between border-t border-border pt-5"><div><span className="metric-label">Q4 holiday peak</span><strong className="mt-1 block font-display text-xl">$191.2K</strong></div><ArrowRight className="mb-2 h-5 w-5 text-primary" /><div className="text-right"><span className="metric-label">Q1 slow season</span><strong className="mt-1 block font-display text-xl">$293.9K</strong></div></div></div></div></section>;
}

function Services() {
  return <section id="services" className="section-space border-y border-border bg-soft-grid"><div className="mx-auto max-w-7xl px-5 md:px-8"><div className="eyebrow"><span /> What we do</div><h2 className="section-title mt-5">Everything your brand needs to grow.</h2><div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-border bg-border md:grid-cols-2 lg:grid-cols-3">{services.map((service, index) => <article key={service.name} className="group bg-card p-7 transition-colors hover:bg-secondary/70 md:p-9"><div className="flex items-center justify-between"><service.icon className="h-8 w-8 text-primary transition-transform group-hover:-rotate-6 group-hover:scale-110" strokeWidth={1.6} /><span className="font-mono text-xs text-muted-foreground">0{index + 1}</span></div><h3 className="mt-10 font-display text-2xl font-bold">{service.name}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{service.detail}</p></article>)}</div></div></section>;
}

function WhoWeHelp() {
  return <section id="who" className="section-space"><div className="mx-auto max-w-7xl px-5 md:px-8"><div className="max-w-2xl"><div className="eyebrow"><span /> Who we help</div><h2 className="section-title mt-5">Built for businesses ready to move.</h2></div><div className="mt-12 grid gap-5 md:grid-cols-3">{audiences.map((audience) => <article key={audience.name} className="rounded-3xl border border-border bg-card p-8 shadow-soft"><audience.icon className="h-7 w-7 text-primary" strokeWidth={1.7} /><h3 className="mt-12 font-display text-2xl font-bold">{audience.name}</h3><p className="mt-2 text-muted-foreground">{audience.detail}</p></article>)}</div></div></section>;
}

function Results() {
  return <section id="results" className="px-5 py-8 md:px-8"><div className="results-panel mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-16 text-primary-foreground md:px-14 md:py-20"><div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-end"><div><div className="text-xs font-semibold uppercase tracking-[.18em] text-brand-light">2026 results</div><h2 className="mt-5 max-w-xl font-display text-5xl font-bold leading-[.95] tracking-tight md:text-7xl">Numbers over noise.</h2><Link to="/results" className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-6 py-3 font-semibold backdrop-blur transition-colors hover:bg-primary-foreground/20">View all results <ArrowRight className="h-4 w-4" /></Link></div><div className="grid grid-cols-2 gap-x-8 gap-y-10 border-t border-primary-foreground/20 pt-10 md:grid-cols-4 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">{[["$293.9K", "Revenue"], ["2,760+", "Orders"], ["6.79%", "Conv. rate"], ["91×", "Peak ROAS"]].map(([value, label]) => <div key={label}><strong className="block font-display text-3xl md:text-4xl">{value}</strong><span className="mt-2 block text-xs uppercase tracking-[.13em] text-primary-foreground/60">{label}</span></div>)}</div></div></div></section>;
}

function Team() {
  const people = [{ initials: "MG", name: "Max Grachev", role: "Agency Owner / Co-Founder", handle: "max.grchv" }, { initials: "S", name: "Santiago", role: "Founder", handle: "santiago.inspirova" }];
  return <section id="team" className="section-space"><div className="mx-auto max-w-7xl px-5 md:px-8"><div className="eyebrow"><span /> The team</div><h2 className="section-title mt-5">Small team. Serious output.</h2><div className="mt-12 grid gap-5 md:grid-cols-2">{people.map((person) => <a key={person.handle} href={`https://instagram.com/${person.handle}`} target="_blank" rel="noreferrer" className="group flex items-center gap-5 rounded-3xl border border-border bg-card p-6 shadow-soft transition-transform hover:-translate-y-1"><div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-gradient font-display text-xl font-bold text-primary-foreground">{person.initials}</div><div className="min-w-0"><h3 className="font-display text-xl font-bold">{person.name}</h3><p className="text-sm text-muted-foreground">{person.role}</p><p className="mt-2 truncate font-mono text-xs text-primary">@{person.handle}</p></div><Instagram className="ml-auto h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" /></a>)}</div></div></section>;
}

function Contact() {
  return <section id="contact" className="px-5 pb-24 md:px-8 md:pb-32"><div className="contact-panel mx-auto max-w-7xl rounded-[2rem] border border-border px-6 py-16 text-center shadow-soft md:px-12 md:py-24"><div className="eyebrow justify-center"><span /> Get in touch</div><h2 className="mx-auto mt-6 max-w-3xl font-display text-5xl font-extrabold leading-none tracking-tight md:text-7xl">Ready to grow?</h2><p className="mx-auto mt-5 max-w-lg text-lg text-muted-foreground">Tell us where you want to go. We’ll show you how to get there.</p><div className="mt-9 flex flex-wrap justify-center gap-3"><a href="https://instagram.com/max.grchv" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 font-semibold text-primary-foreground shadow-brand">DM @max.grchv <ArrowRight className="h-4 w-4" /></a><a href="mailto:inspirovamedia@gmail.com" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 font-semibold"><Mail className="h-4 w-4 text-primary" /> Email us</a></div></div></section>;
}

function HomePage() {
  return <main className="min-h-screen overflow-hidden"><Nav /><Hero /><Services /><WhoWeHelp /><Results /><Team /><Contact /><footer className="border-t border-border py-10"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 text-sm text-muted-foreground md:flex-row md:px-8"><Logo compact /><span>© {new Date().getFullYear()} Inspirova Marketing</span><span className="font-mono text-xs uppercase tracking-[.14em]">Built to market.</span></div></footer></main>;
}