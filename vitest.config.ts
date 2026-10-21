import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // IndexedDB must exist before Dexie is imported.
  test: { include: ["src/**/*.test.ts"], environment: "node", setupFiles: ["fake-indexeddb/auto"] },
});
