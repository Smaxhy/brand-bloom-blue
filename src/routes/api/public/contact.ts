import { createFileRoute } from "@tanstack/react-router";
import { handleContactRequest } from "@/lib/contact.server";

export const Route = createFileRoute("/api/public/contact")({
  server: {
    handlers: {
      POST: ({ request }) => handleContactRequest(request, async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return {
          rpc: async (args) => {
            const { data, error } = await supabaseAdmin.rpc("check_rate_limit", args);
            if (error) throw new Error("Request protection unavailable");
            return data === true;
          },
          insert: async (row) => {
            const { error } = await supabaseAdmin.from("contact_submissions").insert(row);
            if (error) throw new Error("Submission unavailable");
          },
        };
      }),
    },
  },
});
