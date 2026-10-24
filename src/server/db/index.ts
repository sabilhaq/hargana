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
  return { kind: "pglite" as const, db: drizzlePglite({ client: lazyPglite(), schema }) };
}

/**
 * The local database, opened on the first query rather than on import: the dev
 * server loads route code in short-lived helper processes (and a production
 * build in several workers) that never query, and each of them opening the
 * folder would corrupt it. Once open, one process holds it (see lock.ts) and
 * closes it cleanly when stopped. A production build never queries, so it
 * gets a throwaway in-memory database if anything asks.
 */
function lazyPglite(): PGlite {
  let client: PGlite | undefined;
  function open() {
    if (process.env.NEXT_PHASE === "phase-production-build") return new PGlite();
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    mkdirSync(dir, { recursive: true });
    const release = lockDatabase(dir);
    const opened = new PGlite(dir);
    const close = async () => {
      await opened.close().catch(() => {});
      release();
    };
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => void close().finally(() => process.exit(0)));
    }
    process.once("exit", release);
    return opened;
  }
  const real = () => (client ??= open());
  // Drizzle only calls these two.
  return {
    query: (...args: Parameters<PGlite["query"]>) => real().query(...args),
    transaction: (...args: Parameters<PGlite["transaction"]>) => real().transaction(...args),
  } as unknown as PGlite;
}

// Reuse one connection across dev hot reloads.
const globalForDb = globalThis as { __hargana_db?: ReturnType<typeof createDb> };
export const database = (globalForDb.__hargana_db ??= createDb());
export const db = database.db;
