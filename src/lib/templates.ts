/**
 * Render a sequence step for one lead: fill {{variables}}, add the signature
 * and the legally required footer (US CAN-SPAM or EU/Belgium wording), and
 * produce both plain-text and HTML parts.
 *
 * Variables available in subject/body:
 *   {{first_name}} {{contact_name}} {{company}} {{city}} {{industry}} {{website}}
 *   {{sender_name}} {{sender_company}}
 */

import type { Lead, Mailbox, Step, OutreachSettings } from "./sequencer";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function firstNameOf(name: string): string {
  const n = name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "").trim();
  return n.split(/\s+/)[0] || "";
}

/** Sensible defaults when a lead is missing a field and the template gives no {{x|fallback}}. */
const DEFAULTS: Record<string, string> = {
  first_name: "there",
  contact_name: "there",
  company: "your business",
  city: "your area",
  industry: "",
};

export function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*(?:\|\s*([^}]*))?\}\}/g, (_, k: string, fallback?: string) => {
    const v = vars[k];
    if (v && v.trim()) return v;
    return (fallback ?? DEFAULTS[k] ?? "").trim();
  });
}

export function renderStep(input: {
  step: Step;
  lead: Lead;
  mailbox: Mailbox;
  settings: OutreachSettings;
  unsubscribeUrl: string;
  isFollowUp: boolean;
  firstSubject: string;
}): { subject: string; text: string; html: string } {
  const { step, lead, mailbox, settings } = input;
  const vars: Record<string, string> = {
    first_name: firstNameOf(lead.contact_name),
    contact_name: lead.contact_name,
    company: lead.company,
    city: lead.city,
    industry: lead.industry,
    website: lead.website || lead.domain || "",
    sender_name: mailbox.display_name,
    sender_company: settings.company_name,
  };

  // Follow-ups with a blank subject reply in-thread: "Re: <first subject>".
  let subject = fill(step.subject, vars).trim();
  if (!subject && input.isFollowUp) {
    const first = fill(input.firstSubject, vars).trim();
    subject = first
      ? first.toLowerCase().startsWith("re:")
        ? first
        : `Re: ${first}`
      : "Following up";
  }
  if (!subject) subject = `Quick question for ${lead.company || "you"}`;

  const body = fill(step.body, vars).trim();
  const signature = fill(mailbox.signature, vars).trim();

  const notice = lead.region === "EU" ? settings.eu_notice : settings.us_notice;
  const footerLines = [
    notice,
    [settings.company_name, settings.postal_address].filter(Boolean).join(" · "),
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].filter(Boolean);

  const text = [body, "", signature, "", "--", ...footerLines]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  const para = (s: string) =>
    esc(s)
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`)
      .join("");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2328;max-width:620px;padding:4px 0">
${para(body)}
${signature ? `<div style="margin-top:18px;color:#1f2328">${esc(signature).replace(/\n/g, "<br>")}</div>` : ""}
<div style="margin-top:28px;padding-top:12px;border-top:1px solid #e6e8eb;font-size:12px;line-height:1.5;color:#6b7280">
${esc(notice)}<br>
${esc([settings.company_name, settings.postal_address].filter(Boolean).join(" · "))}<br>
<a href="${esc(input.unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a>
</div></div></body></html>`;

  return { subject, text, html };
}
