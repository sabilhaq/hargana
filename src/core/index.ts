import { catalog } from "./catalog";
import { systemClock, type Clock } from "./clock";
import { places } from "./places";
import { HarganaStorage } from "./storage";

export type { Clock } from "./clock";
export { CoreError, type CoreErrorCode } from "./errors";
export { CURRENT_STORE_TTL_MS, NEARBY_KM } from "./places";
export { PRICING_UNITS } from "./types";
export type * from "./types";

export type CoreStatus = {
  itemCount: number;
  pendingSyncCount: number;
};

export type CoreDeps = {
  storage?: HarganaStorage;
  clock?: Clock;
};

/**
 * The Hargana core: the only interface the UI uses. Reads and writes on-device
 * storage; the server is reached only through sync.
 */
export function createCore({ storage = new HarganaStorage(), clock = systemClock }: CoreDeps = {}) {
  return {
    async status(): Promise<CoreStatus> {
      const [itemCount, pendingSyncCount] = await Promise.all([
        storage.items.count(),
        storage.outbox.count(),
      ]);
      return { itemCount, pendingSyncCount };
    },
    ...places(storage, clock),
    ...catalog(storage, clock),
  };
}

export type HarganaCore = ReturnType<typeof createCore>;
