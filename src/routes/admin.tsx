import { createFileRoute } from "@tanstack/react-router";
import { AdminApp } from "@/admin/AdminApp";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Inspirova — Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminApp,
});
