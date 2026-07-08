import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Inspirova Marketing" },
      {
        name: "description",
        content:
          "How Inspirova collects, uses, stores, and protects your personal information.",
      },
      { property: "og:title", content: "Privacy Policy — Inspirova Marketing" },
      {
        property: "og:description",
        content:
          "How Inspirova collects, uses, stores, and protects your personal information.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

type Section = {
  heading: string;
  body?: string[];
  list?: string[];
  after?: string[];
};

const SECTIONS: Section[] = [
  {
    heading: "1. Introduction",
    body: [
      'Welcome to Inspirova ("Inspirova," "we," "our," or "us").',
      "We are committed to protecting your privacy and handling any information available through our platform responsibly. This Privacy Policy explains how information is handled when you use our website and services.",
      "By using our website, you agree to this Privacy Policy.",
    ],
  },
  {
    heading: "2. Eligibility",
    body: [
      "Our services are intended only for individuals who are 16 years of age or older.",
      "By creating an account or using our services, you confirm that you are at least 16 years old. If we become aware that an account belongs to someone under the age of 16, we reserve the right to suspend or permanently remove the account.",
    ],
  },
  {
    heading: "3. Information Available Through the Platform",
    body: [
      "When you use Inspirova, certain information may be provided by you as part of creating an account, requesting services, or communicating with us.",
      "This information remains within the platform and is used solely for providing and maintaining our services.",
      "Inspirova does not sell your personal information.",
      "Members of the Inspirova team do not intentionally download, copy, or maintain personal copies of user information outside of our operational systems except where required for legal, security, backup, or technical purposes.",
    ],
  },
  {
    heading: "4. How Information Is Used",
    body: ["Information available through the platform may be used to:"],
    list: [
      "Operate and maintain our services.",
      "Respond to customer support requests.",
      "Verify accounts.",
      "Improve the functionality of our website.",
      "Detect fraud or unauthorized activity.",
      "Protect the security of our users and platform.",
      "Comply with applicable laws and legal obligations.",
    ],
  },
  {
    heading: "5. Administrative Access",
    body: [
      "The owners of Inspirova and authorized team members retain full administrative control over the platform.",
      "This includes the ability to:",
    ],
    list: [
      "Review account information when reasonably necessary.",
      "Investigate reports of abuse, fraud, or misuse.",
      "Assist users with technical or account-related issues.",
      "Monitor platform security.",
      "Suspend, restrict, or terminate accounts that violate our Terms of Service.",
      "Remove content that violates our policies.",
    ],
    after: [
      "Administrative access is used only for legitimate operational, security, support, or legal purposes.",
    ],
  },
  {
    heading: "6. Data Sharing",
    body: [
      "Inspirova does not sell, rent, or trade user information.",
      "Information may only be disclosed when:",
    ],
    list: [
      "Required by law.",
      "Necessary to protect the rights, safety, or security of Inspirova or its users.",
      "Required to investigate fraud, abuse, or unlawful activity.",
      "Necessary for trusted service providers who help us operate our services under appropriate confidentiality obligations.",
    ],
  },
  {
    heading: "7. Data Security",
    body: [
      "We implement reasonable administrative, technical, and organizational measures to protect information available through our platform against unauthorized access, alteration, disclosure, or destruction.",
      "Although no online service can guarantee absolute security, we continually work to protect user information.",
    ],
  },
  {
    heading: "8. Account Management",
    body: [
      "The owners and authorized administrators of Inspirova reserve the right to access, modify, suspend, restrict, or terminate user accounts whenever reasonably necessary to:",
    ],
    list: [
      "Enforce our Terms of Service.",
      "Maintain platform integrity.",
      "Protect users.",
      "Investigate suspected violations.",
      "Resolve technical issues.",
      "Comply with legal obligations.",
    ],
  },
  {
    heading: "9. Cookies",
    body: [
      "Our website may use cookies or similar technologies to improve functionality, maintain user sessions, remember preferences, and analyze website performance.",
      "You may disable cookies through your browser settings, although doing so may affect certain features of the website.",
    ],
  },
  {
    heading: "10. Third-Party Services",
    body: [
      "Our website may integrate with trusted third-party services necessary for operating the platform. These providers may process information only as required to deliver their services and are expected to maintain appropriate security measures.",
    ],
  },
  {
    heading: "11. User Rights",
    body: [
      "Where required by applicable law, users may have rights regarding their personal information, including the right to request access, correction, or deletion of certain information, subject to legal and operational requirements.",
    ],
  },
  {
    heading: "12. Changes to This Privacy Policy",
    body: [
      "We may update this Privacy Policy at any time. Any changes become effective immediately upon publication on this page. Continued use of the website after updates constitutes acceptance of the revised Privacy Policy.",
    ],
  },
  {
    heading: "13. Contact",
    body: [
      "If you have any questions regarding this Privacy Policy or our privacy practices, please contact Inspirova through the contact information provided on our website.",
    ],
  },
];

function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-12 text-foreground">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Inspirova Marketing
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated:{" "}
        {new Date().toLocaleDateString("en-GB", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        .
      </p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.heading} className="space-y-3">
            <h2 className="font-display text-xl font-bold">{s.heading}</h2>
            {s.body?.map((p, i) => (
              <p key={`b-${i}`} className="text-sm text-muted-foreground">
                {p}
              </p>
            ))}
            {s.list && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {s.list.map((item, i) => (
                  <li key={`l-${i}`}>{item}</li>
                ))}
              </ul>
            )}
            {s.after?.map((p, i) => (
              <p key={`a-${i}`} className="text-sm text-muted-foreground">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

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
