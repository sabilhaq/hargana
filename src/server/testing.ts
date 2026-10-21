import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { SyncTransport } from "@/core";
import * as schema from "./db/schema";
import { createSyncHandlers } from "./sync";

// Starting PGlite and migrating takes seconds, so each test file shares one.
let shared: Promise<ReturnType<typeof drizzle<typeof schema>>> | undefined;

async function database() {
  shared ??= (async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    return db;
  })();
  const db = await shared;
  await db.execute(sql`truncate regions, categories, chains, stores, items, observations, item_aliases`);
  return db;
}

/**
 * The sync API over an empty in-memory Postgres with the real migrations.
 * `call` goes through the HTTP handlers; `transport` lets a core sync with it.
 */
export async function testServer() {
  const db = await database();
  let signedIn = true;
  const handlers = createSyncHandlers({ db, session: async () => (signedIn ? { user: { id: "owner" } } : null) });

  const call = (op: "push" | "pull", body: unknown) =>
    handlers[op](new Request(`http://hargana.test/api/sync/${op}`, { method: "POST", body: JSON.stringify(body) }));

  async function json(op: "push" | "pull", body: unknown) {
    const response = await call(op, body);
    if (!response.ok) throw new Error(`${op} failed: ${response.status}`);
    return response.json();
  }
  const transport: SyncTransport = { push: (batch) => json("push", batch), pull: (request) => json("pull", request) };

  return { call, transport, signOut: () => (signedIn = false) };
}
