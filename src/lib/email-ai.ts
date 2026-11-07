/**
 * "Write with AI" for sequence steps + the shared owner instructions.
 *
 * The owner edits ONE text (Settings → AI instructions). It is injected into
 * every prompt that writes in their voice: sequence emails, the {{pitch}}
 * and {{gap}} lines produced at scan time, and reply drafts.
 */

import { anthropicProblem } from "./anthropic-error";

type Env = Record<string, string | undefined>;
const secret = (e: Env, k: string) => e[k] || process.env?.[k];

export const DEFAULT_AI_INSTRUCTIONS = `We are a small marketing agency for local service businesses (roofers, tree services, HVAC, landscapers, cleaners, etc.).
What we sell: a fast modern website, Google Ads / Local Services Ads, Google Business Profile optimisation, review automation, and simple lead automation (missed-call text-back, online booking).
Tone: plain, warm, direct. Like one business owner emailing another. No hype, no buzzwords, no exclamation marks, no "I hope this finds you well".
Length: first email under 90 words. Follow-ups under 50 words.
Always: mention one specific thing about THEIR business (use {{pitch}} or {{gap}}), make one clear ask (a 10-minute call), sign off with first name only.
Never: promise results, quote prices, or claim we've worked with them before.`;

export interface WriteStepInput {
  sequenceName: string;
  audience?: string; // "roofers in Denver", from the sequence name if blank
  index: number; // 0 = first email
  previous: { subject: string; body: string }[]; // earlier steps, for follow-ups
  current?: { subject?: string; body?: string }; // what's in the box now (rewrite)
  company: string;
  website?: string;
  instructions?: string;
  extra?: string; // one-off direction from the writer ("shorter", "mention snow season")
}

export interface WrittenStep {
  subject: string;
  subject_b: string;
  body: string;
}

export async function writeStep(
  env: Env,
  input: WriteStepInput,
): Promise<{ ok: true; step: WrittenStep } | { ok: false; error: string }> {
  const key = secret(env, "ANTHROPIC_API_KEY");
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
  const instructions = (input.instructions || "").trim() || DEFAULT_AI_INSTRUCTIONS;
  const followUp = input.index > 0;
  const system = `You write cold outreach emails for ${input.company}${input.website ? ` (${input.website})` : ""}.

OWNER'S INSTRUCTIONS (follow these exactly, they override everything below):
"""
${instructions}
"""

Template variables you may use (they are filled per lead at send time):
{{first_name|there}} {{company}} {{city}} {{industry}} {{website}} {{sender_name}}
{{pitch}} = one-line angle the AI wrote about that specific business when it was scanned
{{gap}} = their biggest marketing gap (e.g. "no online booking")
Use {{pitch}} or {{gap}} in the first email so each message feels written for them.

Respond with ONLY a JSON object:
{ "subject": string, "subject_b": string, "body": string }
- subject: short, lowercase-ish, no clickbait, may use {{company}}.
- subject_b: a different angle for A/B testing (${followUp ? "empty string for follow-ups" : "required for the first email"}).
- body: plain text, real line breaks, no signature block (it is added automatically), no footer, no links unless the owner's instructions say so.
Content guidelines: avoid HTML, images, emoji, ALL CAPS, promotional pressure, shortened URLs and fake Re:/Fwd: subjects. Use at most one relevant full URL. Keep the existing first-email and follow-up length limits. These guidelines may reduce promotional signals; delivery and inbox placement are not guaranteed.
${followUp ? "This is follow-up #" + input.index + ": short, references the earlier email without repeating it, one new reason or angle, one ask. subject should be an empty string so it sends in the same thread." : "This is the FIRST email."}`;

  const user = `Sequence: ${input.sequenceName}
Audience: ${input.audience || input.sequenceName}
${input.previous.length ? "Earlier emails in this sequence:\n" + input.previous.map((p, i) => `--- email ${i + 1} ---\nSubject: ${p.subject}\n${p.body}`).join("\n\n") : ""}
${input.current?.body ? "Current draft to improve (keep what works):\n" + (input.current.subject ? "Subject: " + input.current.subject + "\n" : "") + input.current.body : ""}
${input.extra ? "Extra direction for this one: " + input.extra : ""}`;

  const call = (model: string) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0.7,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(40000),
    });
  try {
    let res = await call("claude-sonnet-4-5");
    if (!res.ok && (res.status === 404 || res.status === 400)) res = await call("claude-haiku-4-5");
    if (!res.ok) return { ok: false, error: await anthropicProblem(res) };
    const d = (await res.json()) as { content?: { text?: string }[] };
    const m = (d.content?.[0]?.text || "").match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: "Claude returned no email" };
    const j = JSON.parse(m[0]) as Partial<WrittenStep>;
    return {
      ok: true,
      step: {
        subject: String(j.subject ?? "").trim(),
        subject_b: String(j.subject_b ?? "").trim(),
        body: String(j.body ?? "").trim(),
      },
    };
  } catch (e) {
    return { ok: false, error: `Claude: ${(e as Error).message}` };
  }
}
