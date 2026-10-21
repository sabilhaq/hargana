import type { Clock } from "./clock";
import { CoreError } from "./errors";
import type { HarganaStorage } from "./storage";
import type { EntryUnit, Item, ItemPrices, PriceEntry, PriceObservation, Store, StorePrice } from "./types";
import { perUnitPrice } from "./units";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The unit an item's prices are kept per. */
export function priceUnit(item: Item): EntryUnit {
  return item.kind === "commodity" ? item.pricingUnit : "pcs";
}

export function prices(
  storage: HarganaStorage,
  clock: Clock,
  context: () => Promise<{ activeRegion: { id: string }; currentStore: Store | null }>,
) {
  async function mustItem(id: string) {
    const item = await storage.items.get(id);
    if (!item) throw new CoreError("not_found", `Item ${id} not found`);
    return item;
  }

  return {
    /**
     * Records a price seen at the current store as a new observation. The
     * per-unit price is computed here; the typed amount, quantity and unit are
     * kept as entered.
     */
    async recordPrice(entry: PriceEntry): Promise<PriceObservation> {
      const { currentStore: store } = await context();
      if (!store) throw new CoreError("no_current_store");
      const item = await mustItem(entry.itemId);
      if (!Number.isInteger(entry.amount) || entry.amount <= 0) throw new CoreError("invalid", "amount must be a positive integer");
      if (!(entry.qty > 0)) throw new CoreError("invalid", "quantity must be positive");
      const amountMax = entry.amountMax || null;
      if (amountMax !== null && (!Number.isInteger(amountMax) || amountMax < entry.amount)) {
        throw new CoreError("invalid", "the top of a range must not be below its bottom");
      }
      if (amountMax !== null && store.type !== "traditional_market") {
        throw new CoreError("invalid", "only market prices can be a range");
      }

      const unit = priceUnit(item);
      const price = perUnitPrice(entry.amount, entry.qty, entry.unit, unit);
      if (price === null) throw new CoreError("incompatible_unit");
      const priceMax = amountMax === null ? null : perUnitPrice(amountMax, entry.qty, entry.unit, unit);

      const previous = await storage.observations
        .where({ itemId: item.id })
        .filter((o) => o.storeId === store.id)
        .count();
      const observation: PriceObservation = {
        id: crypto.randomUUID(),
        itemId: item.id,
        regionId: store.regionId,
        scope: store.type === "traditional_market" ? "market" : "branch",
        chainId: store.chainId,
        storeId: store.id,
        action: previous ? "change" : "new",
        price,
        priceMax: priceMax === price ? null : priceMax,
        enteredAmount: entry.amount,
        enteredAmountMax: amountMax,
        enteredQty: entry.qty,
        enteredUnit: entry.unit,
        note: entry.note?.trim() || null,
        source: "collector",
        verified: true,
        observedAt: clock.now().toISOString(),
      };
      await storage.observations.add(observation);
      return observation;
    },

    /** Every observation of an item, newest first. */
    async listObservations(itemId: string) {
      const observations = await storage.observations.where({ itemId }).toArray();
      return observations.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    },

    /**
     * The current price of an item at every store in the active region that
     * has one, cheapest first (ranges by their low end).
     */
    async itemPrices(itemId: string): Promise<ItemPrices> {
      const item = await mustItem(itemId);
      const regionId = (await context()).activeRegion.id;
      const [region, observations, stores, chains] = await Promise.all([
        storage.regions.get(regionId),
        storage.observations.where({ itemId, regionId }).toArray(),
        storage.stores.where({ regionId }).toArray(),
        storage.chains.where({ regionId }).toArray(),
      ]);
      const storeById = new Map(stores.map((s) => [s.id, s]));
      const chainById = new Map(chains.map((c) => [c.id, c]));

      // The latest observation per store is its current price.
      const latest = new Map<string, PriceObservation>();
      for (const observation of observations) {
        const current = latest.get(observation.storeId);
        if (!current || observation.observedAt > current.observedAt) latest.set(observation.storeId, observation);
      }

      const now = clock.now().getTime();
      const result: StorePrice[] = [];
      for (const observation of latest.values()) {
        const store = storeById.get(observation.storeId);
        if (!store) continue;
        const ageDays = Math.floor((now - new Date(observation.observedAt).getTime()) / DAY_MS);
        const threshold = store.type === "traditional_market" ? region!.staleDaysMarket : region!.staleDaysSupermarket;
        result.push({
          store,
          chain: store.chainId ? (chainById.get(store.chainId) ?? null) : null,
          price: observation.price,
          priceMax: observation.priceMax,
          note: observation.note,
          observedAt: observation.observedAt,
          ageDays,
          stale: ageDays > threshold,
          observation,
        });
      }
      result.sort((a, b) => a.price - b.price || a.store.name.localeCompare(b.store.name));
      return { region: region!, unit: priceUnit(item), prices: result };
    },
  };
}
