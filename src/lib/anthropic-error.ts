/** Turn an Anthropic error response into one sentence the admin can act on. */
export async function anthropicProblem(res: Response): Promise<string> {
  let msg = "";
  try {
    const j = (await res.json()) as { error?: { type?: string; message?: string } };
    msg = j.error?.message || j.error?.type || "";
  } catch {
    /* no body */
  }
  if (/credit balance/i.test(msg))
    return "Claude: your Anthropic account is out of credit — top up at console.anthropic.com → Billing";
  if (res.status === 401) return "Claude: ANTHROPIC_API_KEY is wrong or revoked";
  if (res.status === 404 || /model/i.test(msg))
    return `Claude: model not available (${msg || res.status})`;
  if (res.status === 429) return "Claude: rate limit hit — try again in a minute";
  if (res.status === 529 || res.status >= 500)
    return "Claude: Anthropic is overloaded — try again shortly";
  return `Claude ${res.status}${msg ? `: ${msg.slice(0, 160)}` : ""}`;
}
