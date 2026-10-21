import Fuse from "fuse.js";
import type { Clock } from "./clock";
import { CoreError } from "./errors";
import type { HarganaStorage } from "./storage";
import { PRICING_UNITS, type Commodity, type CommodityInput, type Item, type ItemMatch } from "./types";

/** How fuzzy search is: 0 matches exactly, 1 matches anything. */
const SEARCH_THRESHOLD = 0.35;

export function catalog(storage: HarganaStorage, clock: Clock) {
  async function withCategories(items: Item[]): Promise<ItemMatch[]> {
    const categories = new Map((await storage.categories.toArray()).map((c) => [c.id, c]));
    return items.map((item) => ({ item, category: (item.categoryId && categories.get(item.categoryId)) || null }));
  }

  return {
    async getItem(id: string) {
      const item = await storage.items.get(id);
      if (!item) throw new CoreError("not_found", `Item ${id} not found`);
      return item;
    },

    async saveCommodity(input: CommodityInput): Promise<Commodity> {
      const name = input.name.trim();
      if (!name) throw new CoreError("invalid", "name is required");
      if (!PRICING_UNITS.includes(input.pricingUnit)) throw new CoreError("invalid", "unknown pricing unit");
      if (input.categoryId && !(await storage.categories.get(input.categoryId))) {
        throw new CoreError("not_found", `Category ${input.categoryId} not found`);
      }
      const existing = input.id ? await storage.items.get(input.id) : undefined;
      const now = clock.now().toISOString();
      const commodity: Commodity = {
        id: input.id ?? crypto.randomUUID(),
        kind: "commodity",
        name,
        aliases: cleanAliases(input.aliases, name),
        categoryId: input.categoryId || null,
        pricingUnit: input.pricingUnit,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await storage.items.put(commodity);
      return commodity;
    },

    /** Items in a category (or all items), by name. */
    async listItems({ categoryId }: { categoryId?: string } = {}) {
      const items = await (categoryId ? storage.items.where({ categoryId }) : storage.items.toCollection()).toArray();
      return withCategories(items.sort((a, b) => a.name.localeCompare(b.name)));
    },

    /**
     * Typo-tolerant search over names and aliases, best match first. Runs
     * entirely on the device.
     */
    async searchItems(query: string, { limit = 30 } = {}) {
      const text = query.trim();
      if (!text) return [];
      const fuse = new Fuse(await storage.items.toArray(), {
        keys: [
          { name: "name", weight: 2 },
          { name: "aliases", weight: 1 },
        ],
        threshold: SEARCH_THRESHOLD,
        ignoreLocation: true,
        ignoreDiacritics: true,
      });
      return withCategories(fuse.search(text, { limit }).map((result) => result.item));
    },
  };
}

/** Trimmed, non-empty, unique (ignoring case), and not just the name again. */
function cleanAliases(aliases: string[], name: string) {
  const seen = new Set([name.toLowerCase()]);
  const result: string[] = [];
  for (const alias of aliases.map((a) => a.trim()).filter(Boolean)) {
    if (seen.has(alias.toLowerCase())) continue;
    seen.add(alias.toLowerCase());
    result.push(alias);
  }
  return result;
}
