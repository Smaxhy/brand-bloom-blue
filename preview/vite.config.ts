import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), tailwind()],
  resolve: { alias: [
    { find: "@/integrations/supabase/client", replacement: path.resolve(__dirname, "mock-supabase.ts") },
    { find: "@/lib/team-users.functions", replacement: path.resolve(__dirname, "mock-team.ts") },
    { find: "@", replacement: path.resolve(__dirname, "../src") },
  ] },
  server: { host: "127.0.0.1", port: 5174, fs: { allow: [path.resolve(__dirname, "..")] } },
});
