import { z } from "zod";
export const emailCheckInput = z.object({ emails: z.array(z.string().min(1).max(254)).min(1).max(50) });