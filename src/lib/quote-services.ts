export const QUOTE_SERVICES = [
  { id: "ads_setup", name: "Ads Setup", price: 750, billing: "upfront" },
  { id: "ads_management", name: "Ads Management / Creation", price: 500, billing: "monthly" },
  { id: "video_creation", name: "Video Creation", price: 250, billing: "monthly" },
  { id: "email_sms", name: "Email & SMS Automations", price: 700, billing: "monthly" },
  { id: "website", name: "Website Design / Creation", price: 250, billing: "upfront" },
  { id: "pixel_ecom", name: "E-commerce Pixel Setup", price: 100, billing: "upfront" },
  { id: "pixel_leadgen", name: "Lead-gen Pixel Setup", price: 100, billing: "upfront" },
  { id: "seo", name: "SEO Optimization", price: 250, billing: "upfront" },
  { id: "sea", name: "SEA / Google Search Ads", price: 400, billing: "monthly" },
  { id: "sea_setup", name: "SEA / Google Ads Setup", price: 100, billing: "upfront" },
] as const;

export function quoteDetails(ids: string[]) {
  const services = QUOTE_SERVICES.filter((s) => ids.includes(s.id));
  const monthly = services.filter((s) => s.billing === "monthly").reduce((n, s) => n + s.price, 0);
  const upfront = services.filter((s) => s.billing === "upfront").reduce((n, s) => n + s.price, 0);
  return { services, estimates: { monthly, upfront, total: monthly + upfront } };
}