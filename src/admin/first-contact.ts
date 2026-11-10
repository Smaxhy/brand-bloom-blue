export type ContactHistory = { enrolled: Set<string>; sent: Set<string> };

export function isFirstContact(
  row: { email?: string; lastEmailedAt?: number },
  history: ContactHistory,
): boolean {
  const email = row.email?.trim().toLowerCase();
  return !!email && !row.lastEmailedAt && !history.enrolled.has(email) && !history.sent.has(email);
}