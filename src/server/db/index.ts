import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

// Neon when DATABASE_URL is set (Vercel); otherwise an embedded PGlite
// database on disk so local development needs no external services.
function createDb() {
  const url = process.env.DATABASE_URL;
  if (url) return { kind: "neon" as const, db: drizzleNeon(neon(url), { schema }) };
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  mkdirSync(dir, { recursive: true });
  return { kind: "pglite" as const, db: drizzlePglite(new PGlite(dir), { schema }) };
}

// Reuse one connection across dev hot reloads.
const globalForDb = globalThis as { __hargana_db?: ReturnType<typeof createDb> };
export const database = (globalForDb.__hargana_db ??= createDb());
export const db = database.db;
