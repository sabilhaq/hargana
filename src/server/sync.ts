import { and, gt, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  emptyRecords,
  type Item,
  type PriceObservation,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncRecords,
} from "@/core";
import * as schema from "./db/schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
type Session = (request: Request) => Promise<unknown>;

/**
 * The sync API: POST handlers for push and pull. Both require a signed-in
 * session (`session` resolves to null without one).
 */
export function createSyncHandlers({ db, session }: { db: Db; session: Session }) {
  async function handle(request: Request, run: (body: unknown) => Promise<unknown>) {
    if (!(await session(request))) return Response.json({ error: "unauthorized" }, { status: 401 });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    try {
      return Response.json(await run(body));
    } catch (error) {
      if (error instanceof BadRequest) return Response.json({ error: error.message }, { status: 400 });
      throw error;
    }
  }

  return {
    push: (request: Request) => handle(request, (body) => push(db, parsePush(body))),
    pull: (request: Request) => handle(request, (body) => pull(db, parsePull(body))),
  };
}

/**
 * Stores pushed records. Newer `updatedAt` wins; an equal or older one changes
 * nothing, and observations are only ever inserted, so a repeated push is a
 * no-op. A product whose barcode is already stored under another id is not
 * stored: the response maps it to the stored one.
 */
export async function push(db: Db, batch: PushRequest): Promise<PushResponse> {
  const { regions, categories, chains, stores, items, observations, itemAliases } = schema;

  await upsert(db, regions, batch.regions.map((r) => row(r)));
  await upsert(db, categories, batch.categories.map((r) => row(r)));
  await upsert(db, chains, batch.chains.map((r) => ({ ...row(r), regionId: r.regionId })));
  await upsert(db, stores, batch.stores.map((r) => ({ ...row(r), regionId: r.regionId })));

  const mappings: Record<string, string> = {};
  const kept: Item[] = [];
  const barcodes = batch.items.flatMap((i) => (i.kind === "product" ? [i.barcode] : []));
  const owners = barcodes.length
    ? await db.select({ id: items.id, barcode: items.barcode, data: items.data }).from(items).where(inArray(items.barcode, barcodes))
    : [];
  const newItems = batch.items.filter((item) => {
    const owner = item.kind === "product" && owners.find((o) => o.barcode === item.barcode);
    if (!owner || owner.id === item.id) return true;
    mappings[item.id] = owner.id;
    kept.push(owner.data as Item);
    return false;
  });
  await upsert(db, items, newItems.map((i) => ({ ...row(i), barcode: i.kind === "product" ? i.barcode : null })));
  const newAliases = Object.entries(mappings).map(([fromId, toId]) => ({ fromId, toId }));
  if (newAliases.length) await db.insert(itemAliases).values(newAliases).onConflictDoNothing();

  // Observations may point at an item id that was mapped, now or in an earlier push.
  const itemIds = [...new Set(batch.observations.map((o) => o.itemId))];
  const aliases = new Map(
    itemIds.length
      ? (await db.select().from(itemAliases).where(inArray(itemAliases.fromId, itemIds))).map((a) => [a.fromId, a.toId])
      : [],
  );
  const rows = batch.observations.map((o) => {
    const data: PriceObservation = { ...o, itemId: aliases.get(o.itemId) ?? o.itemId };
    return { id: o.id, updatedAt: o.observedAt, data, regionId: o.regionId, itemId: data.itemId };
  });
  if (rows.length) await db.insert(observations).values(rows).onConflictDoNothing();

  return { mappings, items: kept };
}

/** Records changed after the cursor: global ones everywhere, regional ones only in the given regions. */
export async function pull(db: Db, { regionIds, cursor }: PullRequest): Promise<PullResponse> {
  const { regions, categories, chains, stores, items, observations } = schema;
  const regional = regionIds.length > 0;
  const [r, c, ch, st, it, ob] = await Promise.all([
    db.select({ seq: regions.seq, data: regions.data }).from(regions).where(gt(regions.seq, cursor)),
    db.select({ seq: categories.seq, data: categories.data }).from(categories).where(gt(categories.seq, cursor)),
    regional
      ? db.select({ seq: chains.seq, data: chains.data }).from(chains).where(and(inArray(chains.regionId, regionIds), gt(chains.seq, cursor)))
      : [],
    regional
      ? db.select({ seq: stores.seq, data: stores.data }).from(stores).where(and(inArray(stores.regionId, regionIds), gt(stores.seq, cursor)))
      : [],
    db.select({ seq: items.seq, data: items.data }).from(items).where(gt(items.seq, cursor)),
    regional
      ? db
          .select({ seq: observations.seq, data: observations.data })
          .from(observations)
          .where(and(inArray(observations.regionId, regionIds), gt(observations.seq, cursor)))
      : [],
  ]);
  const all = [r, c, ch, st, it, ob].flat();
  const data = <T>(rows: { data: unknown }[]) => rows.map((row) => row.data as T);
  return {
    regions: data(r),
    categories: data(c),
    chains: data(ch),
    stores: data(st),
    items: data(it),
    observations: data(ob),
    cursor: Math.max(cursor, ...all.map((row) => row.seq)),
  };
}

function row(record: { id: string; updatedAt: string }) {
  return { id: record.id, updatedAt: record.updatedAt, data: record };
}

type MutableTable = typeof schema.regions | typeof schema.categories | typeof schema.chains | typeof schema.stores | typeof schema.items;

/** Inserts rows, or replaces stored ones that are older. Only a real change gets a new `seq`. */
async function upsert<T extends MutableTable>(db: Db, table: T, rows: T["$inferInsert"][]) {
  if (rows.length === 0) return;
  const extra = Object.keys(rows[0]).filter((key) => !["id", "updatedAt", "data"].includes(key));
  const set: Record<string, unknown> = {
    updatedAt: sql`excluded.updated_at`,
    data: sql`excluded.data`,
    seq: sql`nextval('sync_seq')`,
  };
  for (const key of extra) set[key] = sql.raw(`excluded.${toSnake(key)}`);
  await (db.insert(table) as ReturnType<Db["insert"]>)
    .values(rows as never)
    .onConflictDoUpdate({ target: table.id, set, setWhere: sql`${table.updatedAt} < excluded.updated_at` });
}

function toSnake(key: string) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

class BadRequest extends Error {}

function parsePush(body: unknown): PushRequest {
  if (!isObject(body)) throw new BadRequest("expected an object");
  const batch = emptyRecords();
  for (const table of Object.keys(batch) as (keyof SyncRecords)[]) {
    const records = body[table] ?? [];
    if (!Array.isArray(records)) throw new BadRequest(`${table} must be an array`);
    const stamp = table === "observations" ? "observedAt" : "updatedAt";
    for (const record of records) {
      if (!isObject(record) || typeof record.id !== "string" || typeof record[stamp] !== "string") {
        throw new BadRequest(`${table}: every record needs an id and ${stamp}`);
      }
      if (["chains", "stores", "observations"].includes(table) && typeof record.regionId !== "string") {
        throw new BadRequest(`${table}: every record needs a regionId`);
      }
      if (table === "observations" && typeof record.itemId !== "string") throw new BadRequest("observations need an itemId");
      if (table === "items" && record.kind === "product" && typeof record.barcode !== "string") {
        throw new BadRequest("products need a barcode");
      }
    }
    (batch[table] as unknown[]) = records;
  }
  return batch;
}

function parsePull(body: unknown): PullRequest {
  if (!isObject(body)) throw new BadRequest("expected an object");
  const { regionIds, cursor } = body;
  if (!Array.isArray(regionIds) || !regionIds.every((id) => typeof id === "string")) {
    throw new BadRequest("regionIds must be an array of ids");
  }
  if (typeof cursor !== "number" || !Number.isInteger(cursor) || cursor < 0) throw new BadRequest("cursor must be a whole number");
  return { regionIds, cursor };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
