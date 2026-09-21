import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icons/*.png"],
      manifest: {
        id: "/",
        name: "Spout — California Whale Tracker",
        short_name: "Spout",
        description:
          "A mobile-first map of blue whale probability and recent research/citizen sightings along the California coast.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#0b3d5c",
        theme_color: "#0b3d5c",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Every API call this app makes is live model/sighting data whose
        // whole point is honest freshness (ADR 0002/0003) — the service
        // worker must never serve a cached response for one, on this
        // origin (dev) or the API's own separate deploy origin (prod:
        // packages/web talks to Render over VITE_API_URL, a different
        // host than the Vercel-hosted frontend the service worker
        // controls). Matched on pathname alone, not a host-specific
        // regex, so this holds regardless of which origin actually serves
        // it. Precaching (the app shell: JS/CSS/HTML/icons) is unaffected
        // — this only governs runtime fetches, not the build's own assets.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/") || url.pathname === "/health",
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
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
