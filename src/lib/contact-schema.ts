import { z } from "zod";

export const CONTACT_LIMITS = { minute: 3, hour: 5, emailHour: 3, globalMinute: 60 } as const;
export const contactSchema = z.object({
  kind: z.enum(["contact", "quote"]).default("contact"),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
  company: z.string().trim().max(120).default(""),
  message: z.string().trim().min(1).max(2000),
  website: z.string().max(0).optional(),
  consent: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.kind === "quote" && data.consent !== true) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["consent"], message: "Consent is required." });
  }
  if (data.kind === "quote" && !data.company) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["company"], message: "Company is required." });
  }
});