import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { devCampaignSavePlugin } from "./vite-dev-campaign-save";

/// <summary>
/// Vite config with a dev proxy so the frontend can reach PartyKit on a fixed port.
/// </summary>
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const partykitPort = env.PARTYKIT_DEV_PORT ?? "1999";

  return {
    plugins: [react(), devCampaignSavePlugin()],
    build: {
      rollupOptions: {
        output: {
          // Split the Konva canvas engine into its own long-lived vendor chunk: it changes far
          // less often than app code, so repeat visitors re-download only the small app chunk on
          // an update instead of the whole bundle. Only names `konva` — everything else (notably
          // the already dynamically-imported three.js/Rapier dice engine) keeps its own chunking,
          // so the heavy dice deps stay lazy-loaded and out of the initial download.
          manualChunks(id: string) {
            if (id.includes("node_modules") && id.includes("konva")) {
              return "konva";
            }
          },
        },
      },
    },
    server: {
      proxy: {
        "/parties": {
          target: `http://127.0.0.1:${partykitPort}`,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
