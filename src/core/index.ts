import { liveQuery } from "dexie";
import { catalog } from "./catalog";
import { systemClock, type Clock } from "./clock";
import { places } from "./places";
import { prices } from "./prices";
import { HarganaStorage } from "./storage";
import { sync } from "./sync";

export type { Clock } from "./clock";
export { CoreError, type CoreErrorCode } from "./errors";
export { currencyDigits } from "./money";
export { CURRENT_STORE_TTL_MS, NEARBY_KM } from "./places";
export { priceUnit } from "./prices";
export { PRICING_UNITS, SIZE_UNITS } from "./types";
export type * from "./types";
export { compatibleUnits, perUnitPrice } from "./units";
export { emptyRecords } from "./sync";
export type { PullRequest, PullResponse, PushRequest, PushResponse, SyncRecords, SyncReport, SyncTransport } from "./sync";

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
  const placesApi = places(storage, clock);
  async function status(): Promise<CoreStatus> {
    const [itemCount, pendingSyncCount] = await Promise.all([storage.items.count(), storage.outbox.count()]);
    return { itemCount, pendingSyncCount };
  }
  return {
    status,
    /** Calls `listener` with the status now and whenever it changes; returns an unsubscribe function. */
    watchStatus(listener: (status: CoreStatus) => void) {
      const subscription = liveQuery(status).subscribe({ next: listener });
      return () => subscription.unsubscribe();
    },
    ...placesApi,
    ...catalog(storage, clock),
    ...prices(storage, clock, placesApi.context),
    ...sync(storage),
  };
}

export type HarganaCore = ReturnType<typeof createCore>;
