import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      css: false,
      // vitest recreates a jsdom environment per test file by default,
      // which dominated runtime once the suite grew past a handful of
      // files (measured: 68% of total run time). vmThreads reuses one
      // jsdom per worker while keeping per-file isolation, per vitest's
      // own guidance: https://vitest.dev/guide/improving-performance
      pool: "vmThreads",
    },
  }),
);
