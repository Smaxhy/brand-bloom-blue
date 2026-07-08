import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy & data deletion — Inspirova Marketing" },
      {
        name: "description",
        content:
          "How Inspirova Marketing collects, stores, protects, and deletes your data, plus how to request a copy or erasure.",
      },
      { property: "og:title", content: "Privacy & data deletion — Inspirova Marketing" },
      {
        property: "og:description",
        content:
          "How Inspirova Marketing collects, stores, protects, and deletes your data, plus how to request a copy or erasure.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-12 text-foreground">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Inspirova Marketing
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Privacy &amp; data deletion
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated: {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}.
        This page is maintained by Inspirova Marketing to answer common privacy and data
        questions.
      </p>

      <section className="mt-8 space-y-2">
        <h2 className="font-display text-xl font-bold">What we store</h2>
        <p className="text-sm text-muted-foreground">
          When you become a client we keep the business details you share with us —
          company name, contact person, email, phone, address, project notes and any
          campaign material you provide. Admin users of our internal suite also have a
          login (email + hashed password) held by our authentication provider.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-display text-xl font-bold">How we protect it</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Data is stored in an EU-hosted database with row-level access rules — each account only sees its own data.</li>
          <li>Passwords are hashed by our authentication provider; we never see the plain text.</li>
          <li>Admin sessions expire and refresh automatically; sign-out revokes them.</li>
          <li>API keys and integration secrets are stored server-side and never shipped to the browser.</li>
        </ul>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-display text-xl font-bold">Retention</h2>
        <p className="text-sm text-muted-foreground">
          Client records are kept for as long as we're actively working together, plus up
          to 24 months afterwards for accounting and continuity. Cold outreach data
          scraped for prospecting is removed within 12 months if no engagement follows.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-display text-xl font-bold">Your rights</h2>
        <p className="text-sm text-muted-foreground">
          You can ask us to export a copy of your data, correct anything that's wrong, or
          delete it entirely. We respond within 30 days. To make a request, email{" "}
          <a
            href="mailto:privacy@inspirovamarketing.com"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            privacy@inspirovamarketing.com
          </a>{" "}
          from the address associated with the account.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-display text-xl font-bold">Cookies</h2>
        <p className="text-sm text-muted-foreground">
          Public marketing pages use no tracking cookies. The admin suite stores your
          sign-in session in your browser's local storage so you don't have to log in on
          every visit.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="font-display text-xl font-bold">Reporting a security issue</h2>
        <p className="text-sm text-muted-foreground">
          If you think you've found a vulnerability, please email{" "}
          <a
            href="mailto:security@inspirovamarketing.com"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            security@inspirovamarketing.com
          </a>{" "}
          with a description and reproduction steps. Please don't publish details until
          we've had a chance to fix it.
        </p>
      </section>

      <div className="mt-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          ← Back to Inspirova
        </Link>
      </div>
    </main>
  );
}
