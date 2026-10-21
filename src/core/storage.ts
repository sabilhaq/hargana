import Dexie, { type EntityTable } from "dexie";

// Minimal on-device tables; later tickets add stores, observations, etc.
export type ItemRecord = { id: string; barcode?: string; name: string };
export type OutboxEntry = { id: string; createdAt: string };

export class HarganaStorage extends Dexie {
  items!: EntityTable<ItemRecord, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;

  constructor(name = "hargana") {
    super(name);
    this.version(1).stores({
      items: "id, barcode",
      outbox: "id, createdAt",
    });
  }
}
