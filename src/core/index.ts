import { liveQuery } from "dexie";
import { catalog } from "./catalog";
import { exporter } from "./export";
import { systemClock, type Clock } from "./clock";
import { people } from "./people";
import { photos } from "./photos";
import { places } from "./places";
import { prices } from "./prices";
import { HarganaStorage } from "./storage";
import { sync } from "./sync";
import type { ProductMetadata } from "./types";

export type { Clock } from "./clock";
export { CoreError, type CoreErrorCode } from "./errors";
export { currencyDigits } from "./money";
export { CURRENT_STORE_TTL_MS, NEARBY_KM } from "./places";
export { priceUnit } from "./prices";
export { PRICING_UNITS, SIZE_UNITS } from "./types";
export type * from "./types";
export { compatibleUnits, perUnitPrice } from "./units";
export { emptyRecords } from "./sync";
export type { ExportData } from "./export";
export { MAX_PHOTO_BYTES, MAX_THUMB_BYTES } from "./photos";
export type * from "./sync";

export type CoreStatus = {
  itemCount: number;
  pendingSyncCount: number;
};

export type CoreDeps = {
  storage?: HarganaStorage;
  clock?: Clock;
  /** Outside product database for pre-filling new products; none means always by hand. */
  metadata?: ProductMetadata;
};

/**
 * The Hargana core: the only interface the UI uses. Reads and writes on-device
 * storage; the server is reached only through sync.
 */
export function createCore({ storage = new HarganaStorage(), clock = systemClock, metadata }: CoreDeps = {}) {
  const placesApi = places(storage, clock);
  async function status(): Promise<CoreStatus> {
    const [itemCount, changes, photoUploads] = await Promise.all([
      storage.items.count(),
      storage.outbox.count(),
      storage.photos.where("pending").equals(1).count(),
    ]);
    return { itemCount, pendingSyncCount: changes + photoUploads };
  }
  return {
    status,
    /** Calls `listener` with the status now and whenever it changes; returns an unsubscribe function. */
    watchStatus(listener: (status: CoreStatus) => void) {
      const subscription = liveQuery(status).subscribe({ next: listener });
      return () => subscription.unsubscribe();
    },
    ...placesApi,
    ...catalog(storage, clock, metadata),
    ...prices(storage, clock, placesApi.context),
    ...people(storage),
    ...photos(storage, clock),
    ...exporter(storage, clock),
    ...sync(storage, clock),
  };
}

export type HarganaCore = ReturnType<typeof createCore>;
