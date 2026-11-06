/** Snapshot people once per bulk action; never accelerate future follow-ups. */
export function eligibleSendBatches(people: { id: string; status: string; current_step: number; next_send_at?: string | null }[], now = Date.now()): string[][] {
  const ids = [...new Set(people.filter((person) =>
    ["queued", "active", "paused"].includes(person.status) &&
    (person.current_step === 0 || (person.next_send_at && Date.parse(person.next_send_at) <= now))
  ).map((person) => person.id))];
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) batches.push(ids.slice(i, i + 20));
  return batches;
}