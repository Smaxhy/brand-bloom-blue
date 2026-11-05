/**
 * Reply intelligence: Claude Haiku reads an inbound reply, labels the intent
 * and drafts the answer you'd send. The draft is shown in the Outreach →
 * Replies tab; nothing is sent without a click.
 */

import type { Lead } from "./sequencer";

type Env = Record<string, string | undefined>;
const secret = (e: Env, k: string) => e[k] || process.env?.[k];

export type ReplyIntent =
  "interested" | "later" | "question" | "not_interested" | "wrong_person" | "auto" | "unknown";

export interface ReplyAnalysis {
  intent: ReplyIntent;
  summary: string;
  draft: string;
}

export async function classifyReply(
  env: Env,
  input: {
    replyText: string;
    lead: Lead | null;
    ourFirstEmail: string;
    senderName: string;
    company: string;
    signature: string;
    /** Owner's AI instructions (Settings → AI instructions). */
    instructions?: string;
  },
): Promise<ReplyAnalysis | null> {
  const key = secret(env, "ANTHROPIC_API_KEY");
  if (!key) return null;
  const text = (input.replyText || "").trim().slice(0, 4000);
  if (!text) return null;

  const system = `You handle inbound replies to cold outreach for ${input.company}, a small marketing agency that sells websites, paid ads and lead automation to local service businesses. You write as ${input.senderName || "the sender"}: warm, brief, concrete, no hype, no exclamation marks, plain English.

Classify the reply and draft the next message. Respond with ONLY a JSON object:
{
  "intent": "interested" | "later" | "question" | "not_interested" | "wrong_person" | "unknown",
  "summary": string,   // one line: what they said / want
  "draft": string      // the reply we should send, plain text, 2-6 short sentences, no subject line, no signature
}

Rules:
- "interested": they want to talk, asked for a call, pricing, or more info with buying intent → propose two concrete call slots (e.g. "Thursday 10:00 or Friday 14:00") and ask which works, or answer the pricing question at a high level and offer a call.
- "question": they asked something without clear buying intent → answer it directly, then one light next step.
- "later": not now / busy / after a date → acknowledge, name the time they mentioned, say you'll follow up then; no pushing.
- "not_interested" or "wrong_person": draft a one-line gracious close (and ask who the right person is only for wrong_person). Never argue.
- Never invent prices, results or facts about ${input.company}. If pricing is asked, say it depends on scope and offer a 10-minute call to scope it.
- Use the lead's first name if known. Keep it under 90 words.${
    input.instructions?.trim()
      ? `

OWNER'S INSTRUCTIONS (what we sell, tone — follow these):
"""
${input.instructions.trim().slice(0, 3000)}
"""`
      : ""
  }`;

  const user = `Lead: ${input.lead?.contact_name || "(unknown name)"} at ${input.lead?.company || "(unknown company)"} (${input.lead?.industry || ""}, ${input.lead?.city || ""})

Our first email to them:
"""
${input.ourFirstEmail.slice(0, 1500)}
"""

Their reply:
"""
${text}
"""`;

  try {
    const call = (model: string) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 500,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
    let res = await call("claude-haiku-4-5");
    if (!res.ok && (res.status === 404 || res.status === 400))
      res = await call("claude-3-5-haiku-latest");
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { text?: string }[] };
    const raw = data.content?.[0]?.text || "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]) as Partial<ReplyAnalysis>;
    const ok: ReplyIntent[] = [
      "interested",
      "later",
      "question",
      "not_interested",
      "wrong_person",
      "unknown",
    ];
    return {
      intent: ok.includes(j.intent as ReplyIntent) ? (j.intent as ReplyIntent) : "unknown",
      summary: String(j.summary || "").slice(0, 300),
      draft: String(j.draft || "")
        .trim()
        .slice(0, 1500),
    };
  } catch {
    return null;
  }
}
