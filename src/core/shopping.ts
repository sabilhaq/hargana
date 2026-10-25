import type { Clock } from "./clock";
import { CoreError } from "./errors";
import { merges } from "./merge";
import { activeRegion } from "./places";
import { effective, localDay, priceUnit, resolveStores, withoutCorrected } from "./prices";
import { live as notRemoved } from "./removed";
import type { HarganaStorage, ListEntry } from "./storage";
import type { Chain, EntryUnit, Item, Region, Store } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** An entry on the list with its item. */
export type ShoppingEntry = ListEntry & { item: Item; unit: EntryUnit };

/** What one item on the list costs at one store. */
export type StoreCost = {
  item: Item;
  qty: number;
  unit: EntryUnit;
  /** Per unit, as the result screen shows it (the promo price while it runs; a range's low end). */
  price: number;
  /** price × qty, rounded to the currency's minor unit. */
  cost: number;
  stale: boolean;
};

export type StoreTotal = {
  store: Store;
  chain: Chain | null;
  /** The cost of the items this store has a price for. */
  total: number;
  costs: StoreCost[];
  /** Items on the list with no known price here. */
  missing: Item[];
};

export type ShoppingPlan = {
  region: Region;
  /** Unticked entries the plan covers. */
  count: number;
  /** Every store with a price for at least one item: most items covered first, then cheapest. */
  stores: StoreTotal[];
  /** Each item at its cheapest store, grouped by store, cheapest group first. */
  split: { stores: StoreTotal[]; total: number; saving: number };
  /** Items with no known price anywhere in the region. */
  unpriced: Item[];
};

/**
 * The shopping list (on this device only) and where to buy it. Quantities are
 * in each item's price unit: its pricing unit for commodities, pieces for
 * products.
 */
export function shopping(storage: HarganaStorage, clock: Clock) {
  async function entries(): Promise<ShoppingEntry[]> {
    const list = await storage.shoppingList.orderBy("createdAt").toArray();
    const items = await storage.items.bulkGet(list.map((e) => e.itemId));
    return list.flatMap((entry, i) => (items[i] ? [{ ...entry, item: items[i], unit: priceUnit(items[i]) }] : []));
  }

  async function mustEntry(id: string) {
    const entry = await storage.shoppingList.get(id);
    if (!entry) throw new CoreError("not_found", `List entry ${id} not found`);
    return entry;
  }

  return {
    listShopping: entries,

    /** Adds an item, or adds to its quantity when it is already on the list (and unticks it). */
    async addToList(itemId: string, qty = 1) {
      if (!(qty > 0)) throw new CoreError("invalid", "quantity must be positive");
      if (!(await storage.items.get(itemId))) throw new CoreError("not_found", `Item ${itemId} not found`);
      const existing = await storage.shoppingList.where({ itemId }).first();
      if (existing) {
        await storage.shoppingList.update(existing.id, { qty: existing.qty + qty, checked: false });
        return existing.id;
      }
      // The list is in the order things were added: keep each entry strictly after the last.
      const last = await storage.shoppingList.orderBy("createdAt").last();
      const at = Math.max(clock.now().getTime(), last ? new Date(last.createdAt).getTime() + 1 : 0);
      const id = crypto.randomUUID();
      await storage.shoppingList.add({ id, itemId, qty, checked: false, createdAt: new Date(at).toISOString() });
      return id;
    },

    async setListQty(id: string, qty: number) {
      if (!(qty > 0)) throw new CoreError("invalid", "quantity must be positive");
      await mustEntry(id);
      await storage.shoppingList.update(id, { qty });
    },

    async tickListEntry(id: string, checked: boolean) {
      await mustEntry(id);
      await storage.shoppingList.update(id, { checked });
    },

    removeFromList: (id: string) => storage.shoppingList.delete(id),

    /** Removes everything ticked off. */
    clearTicked: () => storage.shoppingList.filter((e) => e.checked).delete(),

    /** Where the unticked items cost least, in the active region, by the current-price rules. */
    async planShopping(): Promise<ShoppingPlan> {
      const regionId = await activeRegion(storage);
      const wanted = (await entries()).filter((e) => !e.checked && notRemoved(e.item));
      const merged = await merges(storage);
      const itemIds = wanted.flatMap((e) => merged.group(e.itemId));
      const [region, stores, chains, observations, corrections] = await Promise.all([
        storage.regions.get(regionId),
        storage.stores.where({ regionId }).filter(notRemoved).toArray(),
        storage.chains.where({ regionId }).toArray(),
        itemIds.length ? storage.observations.where("itemId").anyOf(itemIds).toArray() : [],
        itemIds.length ? storage.priceCorrections.where("itemId").anyOf(itemIds).toArray() : [],
      ]);
      const live = withoutCorrected(
        observations.filter((o) => o.regionId === regionId),
        corrections,
      ).live.map(merged.asRoot);
      const chainById = new Map(chains.map((c) => [c.id, c]));
      const now = clock.now().getTime();
      const today = localDay(clock.now());

      // Each item's cost at each store it has a price at.
      const costsByStore = new Map<string, StoreCost[]>();
      const cheapest = new Map<string, { store: Store; cost: StoreCost }>();
      for (const entry of wanted) {
        const { resolved } = resolveStores(
          live.filter((o) => o.itemId === entry.itemId),
          stores,
        );
        for (const store of stores) {
          const observation = resolved.get(store.id);
          if (!observation) continue;
          const price = effective(observation, today).price;
          const days = Math.floor((now - new Date(observation.observedAt).getTime()) / DAY_MS);
          const threshold = store.type === "traditional_market" ? region!.staleDaysMarket : region!.staleDaysSupermarket;
          const cost: StoreCost = {
            item: entry.item,
            qty: entry.qty,
            unit: entry.unit,
            price,
            cost: Math.round(price * entry.qty),
            stale: days > threshold,
          };
          costsByStore.set(store.id, [...(costsByStore.get(store.id) ?? []), cost]);
          const best = cheapest.get(entry.itemId);
          if (!best || cost.cost < best.cost.cost) cheapest.set(entry.itemId, { store, cost });
        }
      }

      const totalFor = (store: Store, costs: StoreCost[]): StoreTotal => ({
        store,
        chain: store.chainId ? (chainById.get(store.chainId) ?? null) : null,
        total: costs.reduce((sum, c) => sum + c.cost, 0),
        costs,
        missing: wanted.filter((e) => !costs.some((c) => c.item.id === e.itemId)).map((e) => e.item),
      });
      const storeTotals = stores
        .filter((s) => costsByStore.has(s.id))
        .map((s) => totalFor(s, costsByStore.get(s.id)!))
        .sort((a, b) => b.costs.length - a.costs.length || a.total - b.total || a.store.name.localeCompare(b.store.name));

      const groups = new Map<string, { store: Store; costs: StoreCost[] }>();
      for (const { store, cost } of cheapest.values()) {
        groups.set(store.id, { store, costs: [...(groups.get(store.id)?.costs ?? []), cost] });
      }
      const split = [...groups.values()].map((g) => ({ ...totalFor(g.store, g.costs), missing: [] })).sort((a, b) => a.total - b.total);

      // What splitting saves on the items the best single store has.
      const best = storeTotals[0];
      const saving = best ? best.costs.reduce((sum, c) => sum + c.cost - cheapest.get(c.item.id)!.cost.cost, 0) : 0;

      return {
        region: region!,
        count: wanted.length,
        stores: storeTotals,
        split: { stores: split, total: split.reduce((sum, s) => sum + s.total, 0), saving },
        unpriced: wanted.filter((e) => !cheapest.has(e.itemId)).map((e) => e.item),
      };
    },
  };
}
