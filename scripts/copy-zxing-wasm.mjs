// Copies zxing-wasm's decoder into public/ so the iOS barcode fallback works
// offline instead of fetching it from a CDN. Runs after every install.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const wasm = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
const pkg = join(dirname(wasm), "..", "..", "package.json");
const { version } = JSON.parse(readFileSync(pkg, "utf8"));
const target = join("public", "zxing", version);

mkdirSync(target, { recursive: true });
copyFileSync(wasm, join(target, "zxing_reader.wasm"));
console.log(`Copied zxing_reader.wasm to ${target}`);
