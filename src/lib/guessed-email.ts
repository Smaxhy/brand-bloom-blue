export function canEnrollGuessedEmail(status: string, allowGuessed: unknown): boolean {
  return status !== "invalid" && (status === "valid" || allowGuessed === true);
}