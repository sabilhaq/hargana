import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Versions the service worker; a new value makes installed apps update.
function buildId() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId(),
    // Where scripts/copy-zxing-wasm.mjs puts the decoder; cached for offline use.
    NEXT_PUBLIC_ZXING_WASM: `/zxing/${JSON.parse(readFileSync("node_modules/zxing-wasm/package.json", "utf8")).version}/zxing_reader.wasm`,
  },
  partialPrefetching: true,
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // What next-intl's plugin would set; done by hand to avoid its native SWC dependency.
      "next-intl/config": "./src/i18n/request.ts",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
