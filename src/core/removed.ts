import type { Clock } from "./clock";
import { CoreError } from "./errors";
import type { HarganaStorage } from "./storage";
import type { RemovedRecords } from "./types";

/** Not removed or merged away by the owner: what every list, search and price rule counts. */
export const live = <T extends { removedAt?: string | null; mergedInto?: string | null }>(record: T) =>
  !record.removedAt && !record.mergedInto;

type Kind = "item" | "store" | "chain";
const TABLES = { item: "items", store: "stores", chain: "chains" } as const;

/**
 * Removing hides an item, store or chain for everyone without deleting it or
 * its prices; restoring brings it back as it was. The app offers it to the
 * owner only, and the server refuses it from anyone else.
 */
export function removal(storage: HarganaStorage, clock: Clock) {
  async function set(kind: Kind, id: string, removedAt: string | null) {
    const table = TABLES[kind];
    const record = await storage.table(table).get(id);
    if (!record) throw new CoreError("not_found", `${kind} ${id} not found`);
    if (kind === "chain" && removedAt) {
      const branches = await storage.stores.where({ chainId: id }).filter(live).count();
      if (branches > 0) throw new CoreError("chain_has_branches");
    }
    return storage.saveSynced(table, { ...record, removedAt, updatedAt: clock.now().toISOString() });
  }

  return {
    removeRecord: (kind: Kind, id: string) => set(kind, id, clock.now().toISOString()),
    restoreRecord: (kind: Kind, id: string) => set(kind, id, null),

    /** Everything removed, most recently removed first. */
    async listRemoved(): Promise<RemovedRecords> {
      const newest = <T extends { removedAt?: string | null }>(a: T, b: T) => (b.removedAt ?? "").localeCompare(a.removedAt ?? "");
      const removed = <T extends { removedAt?: string | null }>(record: T) => !!record.removedAt;
      const [items, stores, chains] = await Promise.all([
        storage.items.filter(removed).toArray(),
        storage.stores.filter(removed).toArray(),
        storage.chains.filter(removed).toArray(),
      ]);
      return { items: items.sort(newest), stores: stores.sort(newest), chains: chains.sort(newest) };
    },
  };
}
