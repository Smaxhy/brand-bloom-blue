import { z } from "zod";
import { QUOTE_SERVICES } from "./quote-services";

export const CONTACT_LIMITS = { minute: 3, hour: 5, emailHour: 3, globalMinute: 60 } as const;
export const contactSchema = z.object({
  kind: z.enum(["contact", "quote"]).default("contact"),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
  company: z.string().trim().max(120).default(""),
  message: z.string().trim().min(1).max(2000),
  website: z.string().max(0).optional(),
  consent: z.boolean().optional(),
  phone: z.string().trim().max(40).default(""),
  services: z.array(z.string().refine((id) => QUOTE_SERVICES.some((s) => s.id === id))).max(10).default([]).transform((ids) => [...new Set(ids)].sort()),
  personalMessage: z.string().trim().max(1000).default(""),
  attribution: z.object({ source: z.string().trim().max(200).default(""), medium: z.string().trim().max(200).default(""), campaign: z.string().trim().max(200).default("") }).default({}),
}).superRefine((data, ctx) => {
  if (data.kind === "quote" && data.consent !== true) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["consent"], message: "Consent is required." });
  }
  if (data.kind === "quote" && !data.company) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["company"], message: "Company is required." });
  }
});