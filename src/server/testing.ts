import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { SyncTransport } from "@/core";
import * as schema from "./db/schema";
import { createPhotoHandlers, memoryPhotoStore } from "./photos";
import { createSyncHandlers } from "./sync";

/** Accounts on the test server. */
export const TEST_USERS = { owner: { id: "user-owner", name: "Sabil" }, budi: { id: "user-budi", name: "Budi" } };

// Starting PGlite and migrating takes seconds, so each test file shares one.
let shared: Promise<ReturnType<typeof drizzle<typeof schema>>> | undefined;

async function database() {
  shared ??= (async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.insert(schema.user).values(Object.values(TEST_USERS).map((u) => ({ ...u, email: `${u.id}@hargana.test` })));
    return db;
  })();
  const db = await shared;
  await db.execute(sql`truncate regions, categories, chains, stores, items, observations, price_corrections, unknown_barcodes, item_aliases`);
  return db;
}

/**
 * The sync API over an empty in-memory Postgres with the real migrations.
 * `call` goes through the HTTP handlers; `transport` lets a core sync with it.
 * Requests are signed in as the owner until `signInAs` switches user.
 */
export async function testServer() {
  const db = await database();
  let signedIn: string | null = TEST_USERS.owner.id;
  const session = async () => (signedIn ? { user: { id: signedIn } } : null);
  const handlers = createSyncHandlers({ db, session });
  const photoStore = memoryPhotoStore();
  const photos = createPhotoHandlers({ store: photoStore, session });

  const call = (op: "push" | "pull", body: unknown) =>
    handlers[op](new Request(`http://hargana.test/api/sync/${op}`, { method: "POST", body: JSON.stringify(body) }));

  async function json(op: "push" | "pull", body: unknown) {
    const response = await call(op, body);
    if (!response.ok) throw new Error(`${op} failed: ${response.status}`);
    return response.json();
  }
  const upload = (form: FormData) => photos.upload(new Request("http://hargana.test/api/photos", { method: "POST", body: form }));
  const serve = (url: string) => photos.serve(new Request(`http://hargana.test${url}`), url.split("/").pop()!);

  const transport: SyncTransport = {
    push: (batch) => json("push", batch),
    pull: (request) => json("pull", request),
    async uploadPhoto({ id, image, thumb }) {
      const form = new FormData();
      form.set("id", id);
      form.set("image", new Blob([image], { type: "image/jpeg" }));
      form.set("thumb", new Blob([thumb], { type: "image/jpeg" }));
      const response = await upload(form);
      if (!response.ok) throw new Error(`upload failed: ${response.status}`);
      return response.json();
    },
    async download(url) {
      const response = await serve(url);
      if (!response.ok) throw new Error(`download failed: ${response.status}`);
      return response.arrayBuffer();
    },
  };

  return {
    call,
    upload,
    serve,
    photoStore,
    transport,
    signInAs: (user: { id: string }) => (signedIn = user.id),
    signOut: () => (signedIn = null),
  };
}
