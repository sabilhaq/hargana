import type { Clock } from "./clock";
import { HarganaStorage } from "./storage";

export type { Clock } from "./clock";

export type CoreStatus = {
  itemCount: number;
  pendingSyncCount: number;
};

/**
 * The Hargana core: the only interface the UI uses. Reads and writes on-device
 * storage; the server is reached only through sync.
 */
export type HarganaCore = {
  status(): Promise<CoreStatus>;
};

export type CoreDeps = {
  storage?: HarganaStorage;
  clock?: Clock;
};

export function createCore({ storage = new HarganaStorage() }: CoreDeps = {}): HarganaCore {
  return {
    async status() {
      const [itemCount, pendingSyncCount] = await Promise.all([
        storage.items.count(),
        storage.outbox.count(),
      ]);
      return { itemCount, pendingSyncCount };
    },
  };
}
