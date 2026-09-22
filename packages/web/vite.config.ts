import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";

/**
 * Resolved via Node's own module resolution (not a hardcoded
 * `node_modules/maplibre-gl/...` path) because npm workspaces hoists
 * `maplibre-gl` to the monorepo root's `node_modules`, not
 * `packages/web/node_modules` — a relative path guess failed the build
 * outright ("No file was found to copy") the first time this was tried.
 */
function resolveMaplibreDistFile(filename: string): string {
  return fileURLToPath(import.meta.resolve(`maplibre-gl/dist/${filename}`));
}

export default defineConfig({
  plugins: [
    react(),
    // Copies MapLibre's own pre-built worker bundle (and the shared chunk
    // it imports via a plain relative `./maplibre-gl-shared.mjs`) into the
    // build output verbatim, filenames preserved and sitting side by side
    // — see useMapInstance.ts's doc comment for why this is needed at all
    // (Rollup won't otherwise emit these; MapLibre's own default worker
    // URL resolution silently resolves to a path that doesn't exist in
    // this app's production build). A content-hashed `?url` import of
    // just the worker file isn't enough on its own: the worker's internal
    // import of maplibre-gl-shared.mjs is a literal, un-rewritten string
    // baked into that file's own source, so the shared chunk has to keep
    // that exact filename and sit next to the worker, not get its own
    // hashed name.
    viteStaticCopy({
      targets: [
        // `rename` is required, not cosmetic: given an absolute `src`,
        // this plugin otherwise preserves the source's full directory
        // structure under `dest` (landing at
        // dist/maplibre/node_modules/maplibre-gl/dist/*.mjs) instead of
        // flattening to dist/maplibre/*.mjs — confirmed by inspecting the
        // actual build output, not assumed.
        { src: resolveMaplibreDistFile("maplibre-gl-worker.mjs"), dest: "maplibre", rename: { stripBase: true } },
        { src: resolveMaplibreDistFile("maplibre-gl-shared.mjs"), dest: "maplibre", rename: { stripBase: true } },
      ],
    }),
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
