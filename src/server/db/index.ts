import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { lockDatabase } from "./lock";
import * as schema from "./schema";

// Neon when DATABASE_URL is set (Vercel); otherwise an embedded PGlite
// database on disk so local development needs no external services.
function createDb() {
  const url = process.env.DATABASE_URL;
  if (url) return { kind: "neon" as const, db: drizzleNeon(neon(url), { schema }) };
  return { kind: "pglite" as const, db: drizzlePglite(openPglite(), { schema }) };
}

/**
 * The local database. A production build only imports server code (several
 * workers at once) and never queries, so it gets a throwaway in-memory one;
 * otherwise one process at a time holds the folder, and closes it cleanly
 * when stopped.
 */
function openPglite() {
  if (process.env.NEXT_PHASE === "phase-production-build") return new PGlite();
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  mkdirSync(dir, { recursive: true });
  const release = lockDatabase(dir);
  const client = new PGlite(dir);
  const close = async () => {
    await client.close().catch(() => {});
    release();
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void close().finally(() => process.exit(0)));
  }
  process.once("exit", release);
  return client;
}

// Reuse one connection across dev hot reloads.
const globalForDb = globalThis as { __hargana_db?: ReturnType<typeof createDb> };
export const database = (globalForDb.__hargana_db ??= createDb());
export const db = database.db;
