import Fuse from "fuse.js";
import { parseBarcode } from "./barcode";
import type { Clock } from "./clock";
import { CoreError } from "./errors";
import type { HarganaStorage } from "./storage";
import {
  PRICING_UNITS,
  SIZE_UNITS,
  type BarcodeLookup,
  type Commodity,
  type CommodityInput,
  type Item,
  type ItemMatch,
  type Product,
  type ProductInput,
} from "./types";

/** How fuzzy search is: 0 matches exactly, 1 matches anything. */
const SEARCH_THRESHOLD = 0.35;

export function catalog(storage: HarganaStorage, clock: Clock) {
  async function withCategories(items: Item[]): Promise<ItemMatch[]> {
    const categories = new Map((await storage.categories.toArray()).map((c) => [c.id, c]));
    return items.map((item) => ({ item, category: (item.categoryId && categories.get(item.categoryId)) || null }));
  }

  /** Shared checks and timestamps for any item being saved. */
  async function prepare(input: { id?: string; name: string; categoryId: string | null; aliases: string[] }) {
    const name = input.name.trim();
    if (!name) throw new CoreError("invalid", "name is required");
    if (input.categoryId && !(await storage.categories.get(input.categoryId))) {
      throw new CoreError("not_found", `Category ${input.categoryId} not found`);
    }
    const existing = input.id ? await storage.items.get(input.id) : undefined;
    const now = clock.now().toISOString();
    return {
      id: input.id ?? crypto.randomUUID(),
      name,
      aliases: cleanAliases(input.aliases, name),
      categoryId: input.categoryId || null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  async function productByBarcode(barcode: string) {
    const item = await storage.items.where({ barcode }).first();
    return item?.kind === "product" ? item : undefined;
  }

  return {
    async getItem(id: string) {
      const item = await storage.items.get(id);
      if (!item) throw new CoreError("not_found", `Item ${id} not found`);
      return item;
    },

    async saveCommodity(input: CommodityInput): Promise<Commodity> {
      if (!PRICING_UNITS.includes(input.pricingUnit)) throw new CoreError("invalid", "unknown pricing unit");
      const commodity: Commodity = { ...(await prepare(input)), kind: "commodity", pricingUnit: input.pricingUnit };
      await storage.items.put(commodity);
      return commodity;
    },

    /** Adds or edits a product. Each barcode belongs to one product only. */
    async saveProduct(input: ProductInput): Promise<Product> {
      const parsed = parseBarcode(input.barcode);
      if (!parsed.ok) throw new CoreError("invalid_barcode", parsed.reason);
      const owner = await productByBarcode(parsed.barcode);
      if (owner && owner.id !== input.id) throw new CoreError("barcode_taken", owner.name);

      const hasSize = input.sizeValue != null && input.sizeUnit != null;
      if (hasSize && !(input.sizeValue! > 0 && SIZE_UNITS.includes(input.sizeUnit!))) {
        throw new CoreError("invalid", "size must be a positive amount in a known unit");
      }
      const brand = input.brand?.trim();
      const product: Product = {
        ...(await prepare(input)),
        kind: "product",
        barcode: parsed.barcode,
        ...(brand && { brand }),
        ...(hasSize && { sizeValue: input.sizeValue, sizeUnit: input.sizeUnit }),
      };
      await storage.items.put(product);
      return product;
    },

    /**
     * Looks up a typed or scanned code. Validation happens here, not in the
     * scanner: `scannedAs` is the symbology the camera reported, if any.
     */
    async lookupBarcode(raw: string, scannedAs?: string): Promise<BarcodeLookup> {
      const parsed = parseBarcode(raw, scannedAs);
      if (!parsed.ok) return { status: "invalid", reason: parsed.reason };
      const item = await productByBarcode(parsed.barcode);
      return item ? { status: "found", barcode: parsed.barcode, item } : { status: "unknown", barcode: parsed.barcode };
    },

    /** Items in a category (or all items), by name. */
    async listItems({ categoryId }: { categoryId?: string } = {}) {
      const items = await (categoryId ? storage.items.where({ categoryId }) : storage.items.toCollection()).toArray();
      return withCategories(items.sort((a, b) => a.name.localeCompare(b.name)));
    },

    /**
     * Typo-tolerant search over names, brands and aliases, best match first.
     * Runs entirely on the device.
     */
    async searchItems(query: string, { limit = 30 } = {}) {
      const text = query.trim();
      if (!text) return [];
      const fuse = new Fuse(await storage.items.toArray(), {
        keys: [
          { name: "name", weight: 2 },
          { name: "brand", weight: 1.5 },
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
