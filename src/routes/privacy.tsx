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
      'Welcome to Inspirova ("Inspirova," "we," "our," or "us"). Your privacy is important to us. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our website and services.',
      "By accessing or using our website, you agree to the practices described in this Privacy Policy.",
    ],
  },
  {
    heading: "2. Eligibility",
    body: [
      "Our services are intended only for individuals who are 16 years of age or older.",
      "By using our website, you represent and warrant that you are at least 16 years old. If we discover that an account belongs to someone under the age of 16, we reserve the right to suspend or permanently delete the account and any associated data.",
    ],
  },
  {
    heading: "3. Information We Collect",
    body: ["We may collect:"],
    list: [
      "Your name",
      "Email address",
      "Phone number",
      "Company information",
      "Billing information (if applicable)",
      "Account credentials",
      "Communications with our team",
      "Website usage information",
      "Device and browser information",
      "IP address",
      "Cookies and similar technologies",
    ],
    after: ["We only collect information necessary to provide and improve our services."],
  },
  {
    heading: "4. How We Use Your Information",
    body: ["We use your information to:"],
    list: [
      "Create and manage your account.",
      "Provide our services.",
      "Process requests and inquiries.",
      "Improve our website and services.",
      "Provide customer support.",
      "Detect fraud, abuse, or security issues.",
      "Comply with legal obligations.",
      "Communicate important updates regarding your account.",
    ],
  },
  {
    heading: "5. Access to Your Information",
    body: [
      "Members of the Inspirova team, including the owners and authorized staff, may access user accounts and associated information when necessary for:",
    ],
    list: [
      "Customer support",
      "Technical troubleshooting",
      "Security monitoring",
      "Fraud prevention",
      "Service maintenance",
      "Compliance with applicable laws",
      "Improving our services",
    ],
    after: [
      "Access to user information is limited to authorized personnel and is handled with appropriate confidentiality.",
    ],
  },
  {
    heading: "6. Ownership and Administrative Rights",
    body: [
      "Inspirova retains full administrative control over its platform.",
      "We reserve the right to:",
    ],
    list: [
      "Access user accounts when reasonably necessary.",
      "Suspend, restrict, or terminate accounts.",
      "Remove or modify content that violates our Terms of Service.",
      "Investigate suspected misuse or illegal activity.",
      "Preserve account information where required by law or for legitimate business purposes.",
    ],
    after: [
      "These rights are exercised responsibly and in accordance with applicable privacy laws.",
    ],
  },
  {
    heading: "7. Data Sharing",
    body: [
      "We do not sell your personal information to third parties.",
      "Your information may only be shared:",
    ],
    list: [
      "With trusted service providers who help operate our business.",
      "When required by law.",
      "To protect the rights, property, or safety of Inspirova, our users, or others.",
      "During a business transfer such as a merger or acquisition.",
    ],
  },
  {
    heading: "8. Data Security",
    body: [
      "We implement reasonable technical and organizational safeguards designed to protect your personal information from:",
    ],
    list: [
      "Unauthorized access",
      "Unauthorized disclosure",
      "Alteration",
      "Loss",
      "Misuse",
    ],
    after: [
      "While no system can guarantee absolute security, we continuously work to maintain appropriate safeguards.",
    ],
  },
  {
    heading: "9. Data Retention",
    body: ["We retain personal information only as long as necessary to:"],
    list: [
      "Provide our services.",
      "Meet legal obligations.",
      "Resolve disputes.",
      "Enforce our agreements.",
    ],
    after: [
      "We may retain certain information after account closure where legally required or reasonably necessary.",
    ],
  },
  {
    heading: "10. Cookies",
    body: ["Our website may use cookies and similar technologies to:"],
    list: [
      "Maintain login sessions.",
      "Remember user preferences.",
      "Improve website performance.",
      "Analyze website traffic.",
    ],
    after: [
      "You may disable cookies through your browser settings, although some features may not function correctly.",
    ],
  },
  {
    heading: "11. User Rights",
    body: ["Where required by applicable law, users may have the right to:"],
    list: [
      "Request access to their personal data.",
      "Request correction of inaccurate information.",
      "Request deletion of personal data.",
      "Request restriction of processing.",
      "Request a copy of their data.",
      "Object to certain processing activities.",
    ],
    after: [
      "Requests may be denied where we are legally permitted or required to retain information.",
    ],
  },
  {
    heading: "12. Account Termination",
    body: [
      "We reserve the right to suspend or permanently terminate any account for violations of our Terms of Service, fraudulent activity, abuse of the platform, or any conduct that may harm Inspirova or its users.",
    ],
  },
  {
    heading: "13. International Users",
    body: [
      "If you access our services from outside our operating jurisdiction, your information may be transferred to and processed in countries where our service providers operate. We take reasonable steps to protect such information in accordance with applicable laws.",
    ],
  },
  {
    heading: "14. Changes to this Privacy Policy",
    body: [
      "We may update this Privacy Policy at any time.",
      "Changes become effective upon publication on this page. Continued use of our services after updates constitutes acceptance of the revised Privacy Policy.",
    ],
  },
  {
    heading: "15. Contact",
    body: [
      "If you have questions regarding this Privacy Policy or your personal information, please contact us using the contact information provided on our website.",
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
