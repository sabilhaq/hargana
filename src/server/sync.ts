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
  type Refusal,
  type Role,
  type SyncRecords,
} from "@/core";
import * as schema from "./db/schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** The signed-in user of a request, or null. */
type Session = (request: Request) => Promise<{ user: { id: string; role?: string | null } } | null>;

/** Who is pushing. Anyone not marked owner is treated as a contributor. */
export type Pusher = { id: string; role: Role };

/**
 * The sync API: POST handlers for push and pull. Both require a signed-in
 * session (`session` resolves to null without one).
 */
export function createSyncHandlers({ db, session }: { db: Db; session: Session }) {
  async function handle(request: Request, run: (body: unknown, pusher: Pusher) => Promise<unknown>) {
    const signedIn = await session(request);
    if (!signedIn) return Response.json({ error: "unauthorized" }, { status: 401 });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    try {
      const pusher: Pusher = { id: signedIn.user.id, role: signedIn.user.role === "owner" ? "owner" : "contributor" };
      return Response.json(await run(body, pusher));
    } catch (error) {
      if (error instanceof BadRequest) return Response.json({ error: error.message }, { status: 400 });
      throw error;
    }
  }

  return {
    push: (request: Request) => handle(request, (body, pusher) => push(db, parsePush(body), pusher)),
    pull: (request: Request) => handle(request, (body) => pull(db, parsePull(body))),
  };
}

/**
 * Stores pushed records. Newer `updatedAt` wins; an equal or older one changes
 * nothing, and observations are only ever inserted, so a repeated push is a
 * no-op. A product whose barcode is already stored under another id is not
 * stored: the response maps it to the stored one. Prices, corrections and
 * scans are stamped with the pushing user, whatever the device claimed.
 *
 * Roles: the owner may change anything. A contributor may add chains, stores,
 * items and prices, change only what they added, and remove only prices they
 * recorded; never remove, restore or merge records. Anything else is refused (listed in the response, with the
 * server's version to restore) and the rest of the batch is still stored.
 */
export async function push(db: Db, batch: PushRequest, pusher: Pusher): Promise<PushResponse> {
  const { regions, categories, chains, stores, items, observations, priceCorrections, unknownBarcodes, itemAliases } = schema;
  const userId = pusher.id;
  const outcome = refusals();
  const allowed = <R extends OwnedRecord>(
    table: MutableTable,
    name: keyof SyncRecords,
    records: R[],
    contributorsMayAdd: boolean,
  ) => vet(db, table, name, records, pusher, contributorsMayAdd, outcome);

  await upsert(db, regions, (await allowed(regions, "regions", batch.regions, false)).map((r) => row(r)));
  await upsert(db, categories, (await allowed(categories, "categories", batch.categories, false)).map((r) => row(r)));
  await upsert(db, chains, (await allowed(chains, "chains", batch.chains, true)).map((r) => ({ ...row(r), regionId: r.regionId })));
  await upsert(db, stores, (await allowed(stores, "stores", batch.stores, true)).map((r) => ({ ...row(r), regionId: r.regionId })));

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
  const permitted = await allowed(items, "items", newItems, true);
  await upsert(db, items, permitted.map((i) => ({ ...row(i), barcode: i.kind === "product" ? i.barcode : null })));
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
    const data: PriceObservation = { ...o, itemId: aliases.get(o.itemId) ?? o.itemId, recordedBy: userId };
    return { id: o.id, updatedAt: o.observedAt, data, regionId: o.regionId, itemId: data.itemId };
  });
  if (rows.length) await db.insert(observations).values(rows).onConflictDoNothing();

  // A contributor may only take back their own prices.
  const targets = new Map(
    pusher.role === "owner" || batch.priceCorrections.length === 0
      ? []
      : (
          await db
            .select({ id: observations.id, data: observations.data })
            .from(observations)
            .where(inArray(observations.id, batch.priceCorrections.map((c) => c.observationId)))
        ).map((o) => [o.id, (o.data as PriceObservation).recordedBy]),
  );
  const ownCorrections = batch.priceCorrections.filter((c) => {
    if (pusher.role === "owner" || (targets.get(c.observationId) ?? null) === userId) return true;
    outcome.refuse("priceCorrections", c.id);
    return false;
  });
  const corrections = ownCorrections.map((c) => ({
    id: c.id,
    updatedAt: c.correctedAt,
    data: { ...c, recordedBy: userId },
    regionId: c.regionId,
  }));
  if (corrections.length) await db.insert(priceCorrections).values(corrections).onConflictDoNothing();

  const scans = batch.unknownBarcodes.map((s) => ({
    id: s.id,
    updatedAt: s.scannedAt,
    data: { ...s, recordedBy: userId },
    regionId: s.regionId,
  }));
  if (scans.length) await db.insert(unknownBarcodes).values(scans).onConflictDoNothing();

  return { mappings, items: kept, ...outcome.result() };
}

/**
 * Records changed after the cursor: global ones everywhere, regional ones only
 * in the given regions. Also every user's name, for "dicatat oleh …".
 */
export async function pull(db: Db, { regionIds, cursor }: PullRequest): Promise<PullResponse> {
  const { regions, categories, chains, stores, items, observations, priceCorrections, unknownBarcodes } = schema;
  const regional = regionIds.length > 0;
  const [r, c, ch, st, it, ob, pc, ub] = await Promise.all([
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
    regional
      ? db
          .select({ seq: priceCorrections.seq, data: priceCorrections.data })
          .from(priceCorrections)
          .where(and(inArray(priceCorrections.regionId, regionIds), gt(priceCorrections.seq, cursor)))
      : [],
    regional
      ? db
          .select({ seq: unknownBarcodes.seq, data: unknownBarcodes.data })
          .from(unknownBarcodes)
          .where(and(inArray(unknownBarcodes.regionId, regionIds), gt(unknownBarcodes.seq, cursor)))
      : [],
  ]);
  const all = [r, c, ch, st, it, ob, pc, ub].flat();
  const data = <T>(rows: { data: unknown }[]) => rows.map((row) => row.data as T);
  return {
    regions: data(r),
    categories: data(c),
    chains: data(ch),
    stores: data(st),
    items: data(it),
    observations: data(ob),
    priceCorrections: data(pc),
    unknownBarcodes: data(ub),
    cursor: Math.max(cursor, ...all.map((row) => row.seq)),
    users: await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user),
  };
}

function row(record: { id: string; updatedAt: string }) {
  return { id: record.id, updatedAt: record.updatedAt, data: record };
}

/** Collects refused records and the server's versions of them. */
function refusals() {
  const refused: Refusal[] = [];
  const restore: Partial<Record<keyof SyncRecords, unknown[]>> = {};
  return {
    refuse(table: keyof SyncRecords, id: string, stored?: unknown) {
      refused.push({ table, id });
      if (stored) (restore[table] ??= []).push(stored);
    },
    result: () => (refused.length ? { refused, restore: restore as Partial<SyncRecords> } : {}),
  };
}

/**
 * The records this user may store, with `createdBy` set by the server: the
 * pusher on a new record, kept as stored on an update.
 */
async function vet<R extends OwnedRecord>(
  db: Db,
  table: MutableTable,
  name: keyof SyncRecords,
  records: R[],
  pusher: Pusher,
  contributorsMayAdd: boolean,
  outcome: ReturnType<typeof refusals>,
): Promise<R[]> {
  if (records.length === 0) return [];
  // Every synced table has the same id and data columns.
  const t = table as typeof schema.regions;
  const rows = await db.select({ id: t.id, data: t.data }).from(t).where(inArray(t.id, records.map((r) => r.id)));
  const stored = new Map(rows.map((r) => [r.id, r.data as R]));
  const owner = pusher.role === "owner";
  return records.flatMap((record) => {
    const current = stored.get(record.id);
    // Removing, restoring and merging are the owner's alone, even for what a contributor added.
    const ownersChange =
      (record.removedAt ?? null) !== (current?.removedAt ?? null) || (record.mergedInto ?? null) !== (current?.mergedInto ?? null);
    if (ownersChange && !owner) {
      outcome.refuse(name, record.id, current);
      return [];
    }
    if (!current) {
      if (owner || contributorsMayAdd) return [{ ...record, createdBy: pusher.id }];
    } else if (owner || (!!current.createdBy && current.createdBy === pusher.id)) {
      return [{ ...record, createdBy: current.createdBy ?? null }];
    }
    outcome.refuse(name, record.id, current);
    return [];
  });
}

type OwnedRecord = { id: string; createdBy?: string | null; removedAt?: string | null; mergedInto?: string | null };
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

/** The timestamp field of append-only records; the others have updatedAt. */
const STAMPS: Partial<Record<keyof SyncRecords, string>> = {
  observations: "observedAt",
  priceCorrections: "correctedAt",
  unknownBarcodes: "scannedAt",
};
const REGIONAL: (keyof SyncRecords)[] = ["chains", "stores", "observations", "priceCorrections", "unknownBarcodes"];

function parsePush(body: unknown): PushRequest {
  if (!isObject(body)) throw new BadRequest("expected an object");
  const batch = emptyRecords();
  for (const table of Object.keys(batch) as (keyof SyncRecords)[]) {
    const records = body[table] ?? [];
    if (!Array.isArray(records)) throw new BadRequest(`${table} must be an array`);
    const stamp = STAMPS[table] ?? "updatedAt";
    for (const record of records) {
      if (!isObject(record) || typeof record.id !== "string" || typeof record[stamp] !== "string") {
        throw new BadRequest(`${table}: every record needs an id and ${stamp}`);
      }
      if (REGIONAL.includes(table) && typeof record.regionId !== "string") {
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
