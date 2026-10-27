import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// APLQ_STATE=<folder> runs the dev server on a separate local database (e.g. for the e2e tests),
// leaving your own local test data in .wrangler/state untouched.
const STATE = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.APLQ_STATE;

export default defineConfig({
  plugins: [react(), cloudflare(STATE ? { persistState: { path: STATE } } : {})],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: { chunkSizeWarningLimit: 900 },
});
