import { z } from "zod";

export const integrationFields: Record<string, { name: string; label: string }[]> = {
  oauth: [{ name: "GOOGLE_OAUTH_CLIENT_ID", label: "Google client ID" }, { name: "GOOGLE_OAUTH_CLIENT_SECRET", label: "Google client secret" }],
  places: [{ name: "GOOGLE_PLACES_API_KEY", label: "Google Places API key" }],
  anthropic: [{ name: "ANTHROPIC_API_KEY", label: "Anthropic API key" }],
  serper: [{ name: "SERPER_API_KEY", label: "Serper API key" }],
  reoon: [{ name: "REOON_API_KEY", label: "Reoon API key" }],
  apollo: [{ name: "APOLLO_API_KEY", label: "Apollo API key" }],
  hunter: [{ name: "HUNTER_API_KEY", label: "Hunter API key" }],
};
const allowed = new Set(Object.values(integrationFields).flat().map((f) => f.name));
export const integrationInputSchema = z.object({
  values: z.record(z.string().trim().min(1).max(4096).regex(/^\S+$/, "Remove spaces from the credential"))
    .refine((values) => Object.keys(values).length > 0 && Object.keys(values).every((key) => allowed.has(key)), "Unsupported integration"),
});