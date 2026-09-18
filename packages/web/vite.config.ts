import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  // MapLibre GL ships its own web worker; Vite's dep optimizer otherwise
  // tries (and fails) to pre-bundle it. See maplibre/maplibre-gl-js#2154.
  worker: { format: "es" },
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
});
