import { describe, expect, it } from "vitest";
import funnelHtml from "../inspirova-funnel.html?raw";
import siteHtml from "../inspirova.html?raw";
import { contactSchema } from "./contact-schema";
import { QUOTE_SERVICES } from "./quote-services";

/* The growth check is plain script inside the homepage document. Its rules sit in one marked block
   that never touches the page, so that block is run here exactly as visitors get it. */
interface Option {
  id: string;
  label: string;
  say?: string;
  only?: boolean;
  svc?: string[];
}
interface Question {
  id: string;
  kind: "single" | "multi" | "text";
  label: string;
  title: string;
  max?: number;
  options?: Option[];
  sayOnly?: string;
  sayOne?: string;
  sayMany?: string;
}
type Answers = Record<string, string | string[]>;
interface Day {
  iso: string;
  dow: string;
  day: number;
  mon: string;
  long: string;
  short: string;
}
interface Payload {
  kind: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  services: string[];
  personalMessage: string;
  message: string;
  attribution: { source: string; medium: string; campaign: string };
  consent: boolean;
  website: string;
}
interface Funnel {
  CONFIG: {
    host: string;
    callPrice: number;
    daysAhead: number;
    weekdays: number[];
    slots: { id: string; label: string }[];
    fallbackEmail: string;
    entry: string;
    entryPhones: string;
    entryDelay: number;
    quoteOpensCard: boolean;
  };
  QUESTIONS: Question[];
  clean(a: unknown): Answers;
  answered(a: Answers): number;
  reaction(q: Question, v: unknown): string;
  toggle(q: Question, current: unknown, id: string): string | string[];
  plan(a: Answers): { k: string; v: string }[];
  exampleAd(a: Answers): { place: string; head: string; body: string; cta: string };
  services(a: Answers): string[];
  callDays(now: Date, cfg?: { daysAhead: number; weekdays: number[] }): Day[];
  parseDay(iso: string): Day | null;
  whenShort(day: string, slot: string): string;
  check(f: Record<string, unknown>): { field: string; error: string } | null;
  payload(s: Record<string, unknown>): Payload;
  begun(s: Visit): boolean;
  welcome(
    s: Visit,
    where: { hash?: string; phone?: boolean },
    cfg?: { entry: string; entryPhones: string },
  ): "big" | "bar";
  hello(how: "enter" | "quote", s: Visit): Card;
}
interface Visit {
  hi?: boolean;
  seen?: boolean;
  done?: unknown;
  i?: number;
  a?: Answers;
}
interface Card {
  title: string;
  text: string;
  go: string;
  alt: string;
  to: string;
  stops: string[];
}

const block = /\/\*<fx-logic>\*\/([\s\S]*?)\/\*<\/fx-logic>\*\//.exec(funnelHtml);
const scope: { InspFunnel?: Funnel } = {};
new Function("window", block?.[1] ?? "")(scope);
const F = scope.InspFunnel as Funnel;
const q = (id: string) => F.QUESTIONS.find((x) => x.id === id) as Question;

const full: Answers = {
  type: "ecom",
  name: "Bloom & Co",
  goal: "sales",
  channels: ["instagram", "tiktok", "google"],
  ads: "stopped",
  abo: "no",
  tracking: "clicks",
  blind: "very",
  budget: "u1500",
  help: ["ads", "video", "tracking"],
};
const booking = {
  a: full,
  day: "2026-11-19",
  slot: "afternoon",
  first: "Lena",
  company: "Bloom & Co",
  email: "Lena@BloomAndCo.example",
  phone: "+32 470 12 34 56",
  note: "We launch a new collection in January.",
  consent: true,
  hp: "",
  tz: "Europe/Brussels",
  utm: {},
};

/* Small repeatable random source, so the sampled answer sets are the same on every run. */
function sampler(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe("growth check: the questions", () => {
  it("is found in the homepage file and has its ten questions", () => {
    expect(block).not.toBeNull();
    expect(F.QUESTIONS.map((x) => x.id)).toEqual([
      "type",
      "name",
      "goal",
      "channels",
      "ads",
      "abo",
      "tracking",
      "blind",
      "budget",
      "help",
    ]);
  });
  it("asks whether the visitor runs a service business or an online store, and about ABO and CBO", () => {
    expect(q("type").options?.map((o) => o.id)).toEqual(["service", "ecom", "both", "other"]);
    expect(q("abo").title).toMatch(/ABO.*CBO/);
  });
  it("gives every option its own id and every answer a reaction", () => {
    for (const x of F.QUESTIONS) {
      if (x.kind === "text") continue;
      const ids = (x.options ?? []).map((o) => o.id);
      expect(new Set(ids).size, x.id).toBe(ids.length);
      expect(ids.length, x.id).toBeGreaterThanOrEqual(3);
      for (const o of x.options ?? []) {
        const picked = x.kind === "multi" ? [o.id] : o.id;
        expect(F.reaction(x, picked), `${x.id}/${o.id}`).toMatch(/\S.{12,}/);
        expect(F.reaction(x, picked), `${x.id}/${o.id}`).not.toMatch(/[{}]/);
      }
    }
    expect(F.reaction(q("channels"), ["instagram", "tiktok", "google"])).toBe(
      "3 channels in orbit. Each one gets its own job in the plan.",
    );
    expect(F.reaction(q("channels"), [])).toBe("");
    expect(F.reaction(q("type"), undefined)).toBe("");
  });
  it("lets one choice replace another, a list toggle, and 'not sure' stand alone", () => {
    expect(F.toggle(q("type"), "service", "ecom")).toBe("ecom");
    expect(F.toggle(q("channels"), undefined, "instagram")).toEqual(["instagram"]);
    expect(F.toggle(q("channels"), ["instagram"], "tiktok")).toEqual(["instagram", "tiktok"]);
    expect(F.toggle(q("channels"), ["instagram", "tiktok"], "instagram")).toEqual(["tiktok"]);
    expect(F.toggle(q("channels"), ["instagram", "tiktok"], "unsure")).toEqual(["unsure"]);
    expect(F.toggle(q("channels"), ["unsure"], "google")).toEqual(["google"]);
  });
  it("keeps only real answers from saved progress", () => {
    expect(
      F.clean({
        type: "ecom",
        goal: "world domination",
        channels: ["instagram", "instagram", "myspace", 7],
        help: ["unsure", "ads"],
        name: "  Bloom\n&  Co  ",
        budget: ["u500"],
        extra: "x",
      }),
    ).toEqual({ type: "ecom", channels: ["instagram"], help: ["unsure"], name: "Bloom & Co" });
    expect(F.clean(null)).toEqual({});
    expect(F.clean("nope")).toEqual({});
    expect(F.clean({ name: "x".repeat(200) }).name).toHaveLength(60);
    expect(F.answered(full)).toBe(10);
  });
});

describe("growth check: the plan", () => {
  it("builds every row from the answers", () => {
    expect(F.plan(full)).toEqual([
      { k: "Goal", v: "More orders, and more back from every euro of ad spend" },
      { k: "Channels", v: "Instagram, TikTok and Google Search" },
      { k: "Set-up", v: "Test in ABO, then move the winners into CBO" },
      { k: "First step", v: "Set up tracking so every order is counted" },
      { k: "On board", v: "Ads, Video and Tracking" },
    ]);
  });
  it("adapts to a service business with a small budget and working ads", () => {
    const rows = F.plan({
      type: "service",
      goal: "leads",
      channels: ["unsure"],
      ads: "working",
      abo: "yes",
      tracking: "yes",
      blind: "none",
      budget: "u500",
      help: ["unsure"],
    });
    expect(rows.map((r) => r.v)).toEqual([
      "More enquiries and booked jobs",
      "Facebook, Instagram and Google Search to start",
      "One simple campaign, so the budget is not spread thin",
      "Scale the campaigns that already work",
      "Max advises where to start",
    ]);
  });
  it("still gives five filled rows for any mix of answers", () => {
    const rnd = sampler(7);
    for (let n = 0; n < 300; n++) {
      const a: Answers = {};
      for (const x of F.QUESTIONS) {
        if (rnd() < 0.15) continue;
        if (x.kind === "text") a[x.id] = "Studio " + n;
        else if (x.kind === "single")
          a[x.id] = (x.options as Option[])[Math.floor(rnd() * (x.options as Option[]).length)].id;
        else a[x.id] = (x.options as Option[]).filter(() => rnd() < 0.4).map((o) => o.id);
      }
      const rows = F.plan(a);
      expect(rows).toHaveLength(5);
      for (const r of rows) expect(r.v.trim().length, JSON.stringify(a)).toBeGreaterThan(2);
      const ad = F.exampleAd(a);
      expect(ad.place).toMatch(/^Sponsored · (Instagram|Facebook|TikTok|YouTube)$/);
      expect(ad.head.length).toBeGreaterThan(8);
    }
  });
  it("names the business in the example ad when it is known", () => {
    expect(F.exampleAd(full)).toEqual({
      place: "Sponsored · Instagram",
      head: "Just landed at Bloom & Co",
      body: "Browse the new arrivals and order in a few taps.",
      cta: "Shop now",
    });
    expect(F.exampleAd({ type: "service", name: "Peeters Loodgieterij" }).body).toBe(
      "Tell Peeters Loodgieterij what you need and get a quote.",
    );
    expect(F.exampleAd({ type: "service" }).body).toBe("Tell us what you need and get a quote.");
  });
  it("maps the help a visitor picks onto the site's own price list", () => {
    const known = QUOTE_SERVICES.map((s) => s.id as string);
    expect(F.services(full)).toEqual(["ads_management", "video_creation", "pixel_ecom"]);
    expect(F.services({ type: "service", help: ["tracking"] })).toEqual(["pixel_leadgen"]);
    expect(F.services({ type: "both", help: ["tracking"] })).toEqual([
      "pixel_ecom",
      "pixel_leadgen",
    ]);
    expect(F.services({ type: "other", help: ["tracking"] })).toEqual([]);
    expect(F.services({ type: "ecom", help: ["unsure"] })).toEqual([]);
    const all = F.services({
      type: "both",
      help: ["ads", "video", "website", "email", "seo", "sea", "tracking"],
    });
    expect(all).toHaveLength(8);
    for (const id of all) expect(known).toContain(id);
    for (const o of q("help").options ?? [])
      for (const id of o.svc ?? []) expect(known).toContain(id);
  });
});

describe("growth check: picking a day", () => {
  it("defaults to a free call without an unconfirmed reference price", () => {
    expect(F.CONFIG.callPrice).toBe(0);
  });
  it("offers the next working days, starting tomorrow", () => {
    const days = F.callDays(new Date(2026, 10, 16, 23, 30));
    expect(days.map((d) => d.iso)).toEqual([
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-30",
    ]);
    expect(days[2]).toEqual({
      iso: "2026-11-19",
      dow: "Thu",
      day: 19,
      mon: "Nov",
      long: "Thursday 19 November 2026",
      short: "Thursday 19 November",
    });
  });
  it("crosses the end of a month and a year", () => {
    expect(
      F.callDays(new Date(2026, 11, 30, 10))
        .slice(0, 3)
        .map((d) => d.iso),
    ).toEqual(["2026-12-31", "2027-01-01", "2027-01-04"]);
  });
  it("never comes back empty, even when no weekday is switched on", () => {
    expect(
      F.callDays(new Date(2026, 10, 16), { daysAhead: 3, weekdays: [] }).map((d) => d.iso),
    ).toEqual(["2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(
      F.callDays(new Date(2026, 10, 20), { daysAhead: 2, weekdays: [1, 2, 3, 4, 5] }).map(
        (d) => d.iso,
      ),
    ).toEqual(["2026-11-21", "2026-11-22"]);
  });
  it("reads a day back and refuses anything that is not one", () => {
    expect(F.parseDay("2026-11-19")?.long).toBe("Thursday 19 November 2026");
    for (const bad of ["", "2026-02-30", "19/11/2026", "2026-11-19T10:00", "<b>"])
      expect(F.parseDay(bad), bad).toBeNull();
    expect(F.whenShort("2026-11-19", "afternoon")).toBe("Thursday 19 November, afternoon");
    expect(F.whenShort("2026-11-19", "midnight")).toBe("");
  });
  it("names what is still missing, one thing at a time", () => {
    const f = {
      day: "2026-11-19",
      slot: "afternoon",
      first: "Lena",
      company: "Bloom & Co",
      email: "lena@bloomandco.example",
      consent: true,
    };
    expect(F.check(f)).toBeNull();
    expect(F.check({ ...f, day: "" })?.field).toBe("day");
    expect(F.check({ ...f, slot: "" })?.field).toBe("slot");
    expect(F.check({ ...f, first: "  " })?.field).toBe("first");
    expect(F.check({ ...f, company: "" })?.field).toBe("company");
    expect(F.check({ ...f, email: "lena@bloom" })?.field).toBe("email");
    expect(F.check({ ...f, consent: false })).toEqual({
      field: "consent",
      error: "Tick the box so Max may contact you.",
    });
  });
});

describe("growth check: what is sent to the website inbox", () => {
  it("is accepted by the intake as a quote with the call on the first line", () => {
    const sent = F.payload(booking);
    const parsed = contactSchema.safeParse(sent);
    expect(parsed.success).toBe(true);
    expect(sent.message.split("\n")[0]).toBe(
      "Call requested: Thursday 19 November 2026, afternoon (visitor's time zone: Europe/Brussels)",
    );
    expect(sent.message).toContain("Business type: Online store");
    expect(sent.message).toContain("Knows ABO vs CBO: No idea");
    expect(sent.message).toContain(
      "Wants help with: Running my ads, Videos and creative, Tracking set-up",
    );
    expect(sent.message).toContain("Phone: +32 470 12 34 56");
    expect(sent.personalMessage).toBe(
      "Free strategy call requested for Thursday 19 November 2026, afternoon (visitor's time zone: Europe/Brussels).\nNote: We launch a new collection in January.",
    );
    expect(sent).toMatchObject({
      kind: "quote",
      name: "Lena",
      company: "Bloom & Co",
      consent: true,
      website: "",
      services: ["ads_management", "video_creation", "pixel_ecom"],
      attribution: { source: "growth-check", medium: "", campaign: "" },
    });
    if (parsed.success)
      expect(parsed.data).toMatchObject({
        email: "lena@bloomandco.example",
        services: ["ads_management", "pixel_ecom", "video_creation"],
      });
  });
  it("keeps the campaign a visitor arrived from", () => {
    const sent = F.payload({
      ...booking,
      utm: { source: "instagram", medium: "paid", campaign: "spring" },
    });
    expect(sent.attribution).toEqual({ source: "instagram", medium: "paid", campaign: "spring" });
  });
  it("stays inside every length limit with the longest possible input", () => {
    const everything: Answers = {};
    for (const x of F.QUESTIONS) {
      if (x.kind === "text") everything[x.id] = "W".repeat(500);
      else if (x.kind === "single")
        everything[x.id] = [...(x.options as Option[])].sort(
          (a, b) => b.label.length - a.label.length,
        )[0].id;
      else everything[x.id] = (x.options as Option[]).filter((o) => !o.only).map((o) => o.id);
    }
    const sent = F.payload({
      ...booking,
      a: everything,
      first: "N".repeat(400),
      company: "C".repeat(400),
      phone: "9".repeat(400),
      note: "n ".repeat(2000),
      tz: "America/Argentina/ComodRivadavia<script>",
      utm: { source: "s".repeat(900), medium: "m".repeat(900), campaign: "c".repeat(900) },
    });
    expect(contactSchema.safeParse(sent).success).toBe(true);
    expect(sent.name).toHaveLength(50);
    expect(sent.company).toHaveLength(120);
    expect(sent.phone).toHaveLength(40);
    expect(sent.message.length).toBeLessThanOrEqual(2000);
    expect(sent.personalMessage.length).toBeLessThanOrEqual(1000);
    expect(sent.message).not.toContain("<");
    expect(sent.services).toHaveLength(7);
  });
  it("is accepted for any mix of answers", () => {
    const rnd = sampler(42);
    const days = F.callDays(new Date(2026, 10, 16));
    for (let n = 0; n < 300; n++) {
      const a: Answers = {};
      for (const x of F.QUESTIONS) {
        if (x.kind === "text") {
          if (rnd() < 0.5) a[x.id] = "Atelier Nº " + n;
        } else if (x.kind === "single")
          a[x.id] = (x.options as Option[])[Math.floor(rnd() * (x.options as Option[]).length)].id;
        else
          a[x.id] = F.clean({
            [x.id]: (x.options as Option[]).filter(() => rnd() < 0.45).map((o) => o.id),
          })[x.id] ?? [(x.options as Option[])[0].id];
      }
      const sent = F.payload({
        ...booking,
        a,
        day: days[Math.floor(rnd() * days.length)].iso,
        slot: F.CONFIG.slots[Math.floor(rnd() * F.CONFIG.slots.length)].id,
        note: rnd() < 0.5 ? "" : "Line one\nline two\ttabbed",
        phone: rnd() < 0.5 ? "" : "0470 12 34 56",
      });
      const parsed = contactSchema.safeParse(sent);
      expect(parsed.success, JSON.stringify(parsed.success ? {} : parsed.error.issues)).toBe(true);
      expect(sent.message.startsWith("Call requested: ")).toBe(true);
      expect(sent.message).not.toMatch(/[\t\r]/);
    }
  });
  it("is refused by the intake when a robot fills the hidden field or consent is missing", () => {
    expect(
      contactSchema.safeParse(F.payload({ ...booking, hp: "http://spam.example" })).success,
    ).toBe(false);
    expect(contactSchema.safeParse(F.payload({ ...booking, consent: false })).success).toBe(false);
    expect(contactSchema.safeParse(F.payload({ ...booking, company: "   " })).success).toBe(false);
  });
});

describe("growth check: the welcome card", () => {
  const fresh: Visit = {};
  const mid: Visit = { seen: true, i: 3, a: { type: "ecom", goal: "sales" } };
  it("greets a new visitor with the big card, once per visit", () => {
    expect(F.CONFIG.entry).toBe("big");
    expect(F.welcome(fresh, {})).toBe("big");
    expect(F.welcome({ hi: true }, {})).toBe("bar");
    expect(F.welcome({ seen: true }, {})).toBe("bar");
    expect(F.welcome({ done: { first: "Lena" } }, {})).toBe("bar");
  });
  it("stays out of the way when a link sent the visitor to one part of the page", () => {
    expect(F.welcome(fresh, { hash: "pricing" })).toBe("bar");
    expect(F.welcome(fresh, { hash: "" })).toBe("big");
  });
  it("can be switched to the bar only, for every screen or for phones alone", () => {
    expect(F.welcome(fresh, {}, { ...F.CONFIG, entry: "bar" })).toBe("bar");
    expect(F.welcome(fresh, { phone: true }, { ...F.CONFIG, entryPhones: "bar" })).toBe("bar");
    expect(F.welcome(fresh, { phone: false }, { ...F.CONFIG, entryPhones: "bar" })).toBe("big");
    expect(F.welcome(fresh, { phone: true })).toBe("big");
    expect(F.CONFIG.entryDelay).toBeGreaterThanOrEqual(0);
    expect(F.CONFIG.entryDelay).toBeLessThanOrEqual(10);
  });
  it("says what the visitor gets and leads on to a part of the homepage that exists", () => {
    for (const how of ["enter", "quote"] as const) {
      const c = F.hello(how, fresh);
      expect(c.title).toMatch(/free growth plan/);
      expect(c.text).toContain(`${F.QUESTIONS.length} quick questions`);
      expect(c.go).toBe("Start the growth check");
      expect(c.stops).toEqual(["10 questions", "Your plan", `Call with ${F.CONFIG.host}`]);
      expect(siteHtml).toContain(`id="${c.to}"`);
      // The price drop is the surprise at the end: the card neither gives it away nor promises a price.
      expect(`${c.title} ${c.text} ${c.go} ${c.alt}`).not.toMatch(/€|\d00|free call|discount/i);
    }
    expect(F.hello("enter", fresh)).toMatchObject({ to: "pricing", alt: "Just show me prices" });
    expect(F.hello("quote", fresh)).toMatchObject({
      to: "quoteForm",
      alt: "Go to the price calculator",
    });
    expect(F.hello("quote", fresh).text).toMatch(/price calculator\.$/);
  });
  it("offers to carry on to someone who already started", () => {
    expect(F.begun(mid)).toBe(true);
    expect(F.begun({ seen: true, i: 0, a: {} })).toBe(false);
    expect(F.begun({ seen: false, i: 0, a: { type: "ecom" } })).toBe(false);
    expect(F.hello("enter", mid)).toMatchObject({
      title: "Pick up where you left off.",
      text: "You are at question 4 of 10.",
      go: "Continue the growth check",
    });
    expect(F.hello("quote", { ...mid, i: 10 }).text).toBe(
      "Your plan is ready. Or go straight to the price calculator.",
    );
  });
  it("is tied to the homepage's own quote button, without editing the homepage file", () => {
    expect(F.CONFIG.quoteOpensCard).toBe(true);
    expect(siteHtml).toMatch(/<a href="#quoteForm"[^>]*>Request your quote/);
    expect(funnelHtml).toContain(`a[href="#quoteForm"]`);
    expect(funnelHtml).toContain('data-fx="start"');
    expect(funnelHtml).toContain('data-fx="quote"');
  });
});

describe("growth check: the file itself", () => {
  it("can be placed inside the homepage document without closing it early", () => {
    expect(funnelHtml).not.toMatch(/<\/body>/i);
    expect(funnelHtml).not.toMatch(/<\/html>/i);
    expect((funnelHtml.match(/<script>/g) ?? []).length).toBe(
      (funnelHtml.match(/<\/script>/g) ?? []).length,
    );
  });
  it("loads nothing from outside the site and sets no tracking", () => {
    expect(funnelHtml).not.toMatch(/https?:\/\//i);
    expect(funnelHtml).not.toMatch(/fbq\(|gtag\(|document\.cookie|localStorage/);
  });
  it("keeps every style rule under its own prefix", () => {
    const css = /<style>([\s\S]*?)<\/style>/.exec(funnelHtml)?.[1] ?? "";
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
      .replace(/@property[^{]+\{[^}]*\}/g, "")
      .replace(/@media[^{]+\{/g, "")
      .split("}")
      .map((rule) => rule.split("{")[0].trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(150);
    for (const group of selectors)
      for (const sel of group.split(",")) {
        expect(sel.trim(), sel).toMatch(/^(\.fx|\[data-phase|body\.fx-|body\.contact-open \.fx)/);
      }
  });
});
