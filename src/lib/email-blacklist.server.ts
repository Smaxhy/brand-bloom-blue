import { addSuppression, type VerifyStatus } from "./bounce";
import type { Db } from "./db";

/** Unknown/risky/MX-only outcomes never mean a dead mailbox. */
export async function blacklistConfirmedInvalid(db: Db, email: string, status: VerifyStatus) {
  if (status !== "invalid") return;
  await addSuppression(db, { email, reason: "bounce", note: "Confirmed invalid during email check" });
  await db.update("leads", `email=eq.${encodeURIComponent(email)}`, { email_verified: "invalid" });
}