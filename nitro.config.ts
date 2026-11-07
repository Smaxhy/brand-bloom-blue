import { fileURLToPath } from "node:url";

// Nitro's own config supports runtime plugins; the Lovable Vite wrapper
// deliberately exposes only deployment options in its `nitro` setting.
export default {
  plugins: [fileURLToPath(new URL("./src/nitro/scheduled.ts", import.meta.url))],
};