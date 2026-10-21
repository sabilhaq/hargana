import Dexie, { type EntityTable, type Transaction } from "dexie";
import { SEEDED_AT, seedCategories, seedRegions } from "./seed";
import type { Category, Chain, Item, PriceObservation, Region, Store } from "./types";

/** Tables whose records are pushed to and pulled from the server. */
export const SYNCED_TABLES = ["regions", "categories", "chains", "stores", "items", "observations"] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/**
 * A record changed on this device and not yet pushed. One entry per record
 * (`id` is "table:recordId"); the record's current state is what gets pushed.
 */
export type OutboxEntry = { id: string; table: SyncedTable; recordId: string; createdAt: string };
export type SettingRecord = { key: string; value: unknown };

/**
 * A photo's bytes on this device. `image` is kept only until it is uploaded;
 * `thumb` stays for offline display. `pending` is 1 until uploaded (booleans
 * cannot be indexed).
 */
export type PhotoRecord = {
  id: string;
  itemId: string;
  image: ArrayBuffer | null;
  thumb: ArrayBuffer | null;
  pending: 0 | 1;
};

export class HarganaStorage extends Dexie {
  items!: EntityTable<Item, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  regions!: EntityTable<Region, "id">;
  chains!: EntityTable<Chain, "id">;
  stores!: EntityTable<Store, "id">;
  categories!: EntityTable<Category, "id">;
  settings!: EntityTable<SettingRecord, "key">;
  observations!: EntityTable<PriceObservation, "id">;
  photos!: EntityTable<PhotoRecord, "id">;

  constructor(name = "hargana") {
    super(name);
    this.version(1).stores({
      items: "id, barcode",
      outbox: "id, createdAt",
    });
    this.version(2)
      .stores({
        regions: "id",
        chains: "id, regionId",
        stores: "id, regionId, chainId",
        categories: "id, sortOrder",
        settings: "key",
      })
      .upgrade(seed);
    this.version(3).stores({
      items: "id, barcode, categoryId",
    });
    this.version(4).stores({
      observations: "id, itemId, [itemId+regionId], observedAt",
    });
    this.version(5).upgrade(enqueueExisting);
    this.version(6).stores({
      photos: "id, itemId, pending",
    });
    this.on("populate", seed);
  }

  /** Saves a record and queues it for the next push, in one transaction. */
  async saveSynced<T extends { id: string }>(table: SyncedTable, record: T) {
    await this.transaction("rw", this.table(table), this.outbox, async () => {
      await this.table(table).put(record);
      await this.outbox.put(outboxEntry(table, record.id, new Date().toISOString()));
    });
    return record;
  }
}

export function outboxEntry(table: SyncedTable, recordId: string, createdAt: string): OutboxEntry {
  return { id: `${table}:${recordId}`, table, recordId, createdAt };
}

/** Data recorded before sync existed is queued so it reaches the server too; seeds are not. */
async function enqueueExisting(tx: Transaction) {
  const now = new Date().toISOString();
  for (const table of SYNCED_TABLES) {
    const records: { id: string; updatedAt?: string }[] = await tx.table(table).toArray();
    const changed = records.filter((r) => r.updatedAt !== SEEDED_AT);
    await tx.table("outbox").bulkPut(changed.map((r) => outboxEntry(table, r.id, now)));
  }
}

async function seed(tx: Transaction) {
  await tx.table("regions").bulkPut(seedRegions);
  await tx.table("categories").bulkPut(seedCategories);
}
