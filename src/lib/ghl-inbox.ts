export interface InboxEmail {
  id: string; direction: string; dateAdded: string; body?: string; subject?: string; status?: string; messageType?: string; type?: string | number;
}
export function emailMessages(messages: InboxEmail[]) {
  return messages.filter((m) => /email/i.test(m.messageType || "") || m.type === 3 || m.type === "3")
    .sort((a, b) => a.dateAdded.localeCompare(b.dateAdded));
}
export function replyState(messages: InboxEmail[]) {
  const emails = emailMessages(messages);
  if (emails.some((m) => m.direction === "inbound" && m.status !== "failed")) return "Replied";
  return "No reply in loaded history";
}