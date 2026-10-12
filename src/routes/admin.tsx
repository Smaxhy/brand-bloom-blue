import { createFileRoute } from "@tanstack/react-router";
import { AdminApp } from "@/admin/AdminApp";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Inspirova — Admin" },
      { name: "description", content: "Sign in to manage your Inspirova clients, campaigns, tasks and reports." },
      { property: "og:title", content: "Inspirova — Admin" },
      { property: "og:description", content: "Your private Inspirova workspace for clients, campaigns and reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminApp,
});
