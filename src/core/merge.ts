import { cleanAliases } from "./catalog";
import type { Clock } from "./clock";
import { CoreError } from "./errors";
import { live } from "./removed";
import type { HarganaStorage } from "./storage";
import type { Commodity, EntryUnit, Item, PriceObservation } from "./types";
import { convertQty, perUnitPrice } from "./units";

const unitOf = (item: Item): EntryUnit => (item.kind === "commodity" ? item.pricingUnit : "pcs");

/**
 * The merges this device knows of: which item each merged duplicate now lives
 * on, and its prices as that item's. A duplicate merged into an item that was
 * itself merged later follows on to the last one.
 */
export async function merges(storage: HarganaStorage) {
  // Only merged items are in the mergedInto index.
  const merged: Item[] = await storage.items.orderBy("mergedInto").toArray();
  const byId = new Map(merged.map((i) => [i.id, i]));
  const targets = [...new Set(merged.map((i) => mergedInto(i)!))].filter((id) => !byId.has(id));
  for (const item of await storage.items.bulkGet(targets)) if (item) byId.set(item.id, item);

  function rootId(id: string) {
    const seen = new Set([id]);
    let current = id;
    for (;;) {
      const next = mergedInto(byId.get(current));
      // Stop at a loop, or at an item this device does not have yet.
      if (!next || seen.has(next) || !byId.has(next)) return current;
      seen.add(next);
      current = next;
    }
  }

  return {
    rootId,
    /** The item and every item merged into it. */
    group(id: string) {
      return [id, ...merged.filter((i) => i.id !== id && rootId(i.id) === id).map((i) => i.id)];
    },
    /** An observation counted as the item it now belongs to, its prices converted to that item's unit. */
    asRoot(observation: PriceObservation): PriceObservation {
      const root = rootId(observation.itemId);
      if (root === observation.itemId) return observation;
      const from = unitOf(byId.get(observation.itemId)!);
      const to = unitOf(byId.get(root)!);
      const convert = (price: number) => perUnitPrice(price, 1, from, to) ?? price;
      return {
        ...observation,
        itemId: root,
        price: convert(observation.price),
        priceMax: observation.priceMax == null ? null : convert(observation.priceMax),
        promoPrice: observation.promoPrice == null ? observation.promoPrice : convert(observation.promoPrice),
      };
    },
  };
}

function mergedInto(item: Item | undefined) {
  return item?.kind === "commodity" ? (item.mergedInto ?? null) : null;
}

/**
 * Moves shopping-list entries of merged items onto the item they were merged
 * into, the quantity converted to its unit and added to an entry already there.
 */
export async function followMerges(storage: HarganaStorage) {
  const { rootId } = await merges(storage);
  await storage.transaction("rw", storage.items, storage.shoppingList, async () => {
    const entries = await storage.shoppingList.orderBy("createdAt").toArray();
    const items = new Map((await storage.items.bulkGet(entries.map((e) => e.itemId))).flatMap((i) => (i ? [[i.id, i]] : [])));
    for (const entry of entries) {
      const root = rootId(entry.itemId);
      if (root === entry.itemId) continue;
      const [from, to] = [items.get(entry.itemId), (items.get(root) ?? (await storage.items.get(root)))!];
      const qty = from ? (convertQty(entry.qty, unitOf(from), unitOf(to)) ?? entry.qty) : entry.qty;
      const existing = await storage.shoppingList.where({ itemId: root }).first();
      if (existing) {
        await storage.shoppingList.update(existing.id, { qty: existing.qty + qty, checked: existing.checked && entry.checked });
        await storage.shoppingList.delete(entry.id);
      } else {
        await storage.shoppingList.update(entry.id, { itemId: root, qty });
      }
    }
  });
}

/**
 * Merging a duplicate into the item kept: the duplicate is hidden and its
 * prices count as the kept item's from then on, everywhere; its names become
 * the kept item's other names. Nothing is deleted. The app offers it to the
 * owner only, and the server refuses it from anyone else.
 */
export function merging(storage: HarganaStorage, clock: Clock) {
  return {
    async mergeItems(keepId: string, duplicateId: string): Promise<Commodity> {
      const [keep, duplicate] = await storage.items.bulkGet([keepId, duplicateId]);
      if (!keep || !duplicate) throw new CoreError("not_found", `Item ${keep ? duplicateId : keepId} not found`);
      if (keep.id === duplicate.id || !live(keep) || !live(duplicate)) throw new CoreError("cannot_merge");
      // A barcode names one product: two products are never the same thing.
      if (keep.kind !== "commodity" || duplicate.kind !== "commodity") throw new CoreError("cannot_merge_products");
      if (perUnitPrice(1, 1, duplicate.pricingUnit, keep.pricingUnit) === null) throw new CoreError("incompatible_unit");

      const now = clock.now().toISOString();
      await storage.saveSynced("items", { ...duplicate, mergedInto: keep.id, updatedAt: now });
      const kept: Commodity = {
        ...keep,
        aliases: cleanAliases([...keep.aliases, duplicate.name, ...duplicate.aliases], keep.name),
        updatedAt: now,
      };
      await storage.saveSynced("items", kept);
      await followMerges(storage);
      return kept;
    },

    /** The item to show for `id`: the item it was merged into, if it was. */
    async currentItemId(id: string) {
      return (await merges(storage)).rootId(id);
    },
  };
}
