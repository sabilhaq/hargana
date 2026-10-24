import type { Clock } from "./clock";
import { CoreError } from "./errors";
import { activeRegion } from "./places";
import { effective, localDay, priceUnit, resolveStores, withoutCorrected } from "./prices";
import { live } from "./removed";
import type { HarganaStorage } from "./storage";
import type { Category, EntryUnit, Item, PriceObservation, Region, Store } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type BrowseSort = "name" | "price" | "recent";

/** One item as the browse list shows it: its current price at the store (or its cheapest, across all). */
export type BrowseEntry = {
  item: Item;
  unit: EntryUnit;
  /** Where this price is: the chosen store, or the cheapest one for "all stores". */
  store: Store;
  price: number;
  regularPrice: number;
  priceMax: number | null;
  promoUntil: string | null;
  observedAt: string;
  ageDays: number;
  stale: boolean;
};

export type BrowseResult = {
  region: Region;
  /** The store browsed, or null for all stores. */
  store: Store | null;
  /** Stores in the region, by name, to pick from. */
  stores: Store[];
  /** In the categories' order; items without one last (`category` null). */
  groups: { category: Category | null; entries: BrowseEntry[] }[];
  count: number;
};

/** Browsing what a store has (or every store), by the current-price rules, in the active region. */
export function browser(storage: HarganaStorage, clock: Clock) {
  return {
    async browse({ storeId = null, sort = "name" }: { storeId?: string | null; sort?: BrowseSort } = {}): Promise<BrowseResult> {
      const regionId = await activeRegion(storage);
      const [region, stores, categories, items, observations, corrections] = await Promise.all([
        storage.regions.get(regionId),
        storage.stores.where({ regionId }).filter(live).toArray(),
        storage.categories.orderBy("sortOrder").toArray(),
        storage.items.filter(live).toArray(),
        storage.observations.filter((o) => o.regionId === regionId).toArray(),
        storage.priceCorrections.toArray(),
      ]);
      const store = storeId ? stores.find((s) => s.id === storeId) : null;
      if (storeId && !store) throw new CoreError("not_found", `Store ${storeId} not found`);
      const now = clock.now().getTime();
      const today = localDay(clock.now());

      const byItem = new Map<string, PriceObservation[]>();
      for (const o of withoutCorrected(observations, corrections).live) {
        byItem.set(o.itemId, [...(byItem.get(o.itemId) ?? []), o]);
      }
      const entry = (item: Item, at: Store, observation: PriceObservation): BrowseEntry => {
        const ageDays = Math.floor((now - new Date(observation.observedAt).getTime()) / DAY_MS);
        const threshold = at.type === "traditional_market" ? region!.staleDaysMarket : region!.staleDaysSupermarket;
        return {
          item,
          unit: priceUnit(item),
          store: at,
          ...effective(observation, today),
          priceMax: observation.priceMax,
          observedAt: observation.observedAt,
          ageDays,
          stale: ageDays > threshold,
        };
      };

      const entries: BrowseEntry[] = [];
      for (const item of items) {
        const list = byItem.get(item.id);
        if (!list) continue;
        const { resolved } = resolveStores(list, store ? [store] : stores);
        const candidates = (store ? [store] : stores).flatMap((s) => {
          const observation = resolved.get(s.id);
          return observation ? [entry(item, s, observation)] : [];
        });
        // One row per item: at this store, or at the cheapest one.
        const best = candidates.sort((a, b) => a.price - b.price || a.store.name.localeCompare(b.store.name))[0];
        if (best) entries.push(best);
      }

      const order = {
        name: (a: BrowseEntry, b: BrowseEntry) => a.item.name.localeCompare(b.item.name),
        price: (a: BrowseEntry, b: BrowseEntry) => a.price - b.price || a.item.name.localeCompare(b.item.name),
        recent: (a: BrowseEntry, b: BrowseEntry) => b.observedAt.localeCompare(a.observedAt) || a.item.name.localeCompare(b.item.name),
      }[sort];
      // An item whose category is unset or unknown goes under "Lainnya" (null), last.
      const known = new Set(categories.map((c) => c.id));
      const groupOf = (e: BrowseEntry) => (e.item.categoryId && known.has(e.item.categoryId) ? e.item.categoryId : null);
      const groups = [...categories, null]
        .map((category) => ({ category, entries: entries.filter((e) => groupOf(e) === (category?.id ?? null)).sort(order) }))
        .filter((g) => g.entries.length > 0);

      return {
        region: region!,
        store: store ?? null,
        stores: [...stores].sort((a, b) => a.name.localeCompare(b.name)),
        groups,
        count: entries.length,
      };
    },
  };
}
