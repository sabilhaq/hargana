import Dexie, { type EntityTable, type Transaction } from "dexie";
import { seedCategories, seedRegions } from "./seed";
import type { Category, Chain, Item, Region, Store } from "./types";

export type OutboxEntry = { id: string; createdAt: string };
export type SettingRecord = { key: string; value: unknown };

export class HarganaStorage extends Dexie {
  items!: EntityTable<Item, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  regions!: EntityTable<Region, "id">;
  chains!: EntityTable<Chain, "id">;
  stores!: EntityTable<Store, "id">;
  categories!: EntityTable<Category, "id">;
  settings!: EntityTable<SettingRecord, "key">;

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
    this.on("populate", seed);
  }
}

async function seed(tx: Transaction) {
  await tx.table("regions").bulkPut(seedRegions);
  await tx.table("categories").bulkPut(seedCategories);
}
