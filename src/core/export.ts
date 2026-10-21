import type { Clock } from "./clock";
import { priceUnit } from "./prices";
import type { HarganaStorage } from "./storage";
import type { Category, Chain, Item, PriceObservation, Region, Store, UnknownBarcodeScan } from "./types";

/** Everything on the device, as stored. Prices are integers in the currency's minor unit. */
export type ExportData = {
  app: "hargana";
  exportedAt: string;
  regions: Region[];
  chains: Chain[];
  stores: Store[];
  categories: Category[];
  items: Item[];
  /** Each with its region's currency code, so prices read on their own. */
  observations: (PriceObservation & { currency: string })[];
  unknownBarcodes: UnknownBarcodeScan[];
};

export function exporter(storage: HarganaStorage, clock: Clock) {
  async function exportData(): Promise<ExportData> {
    const [regions, chains, stores, categories, items, observations, unknownBarcodes] = await Promise.all([
      storage.regions.toArray(),
      storage.chains.toArray(),
      storage.stores.toArray(),
      storage.categories.toArray(),
      storage.items.toArray(),
      storage.observations.orderBy("observedAt").toArray(),
      storage.unknownBarcodes.orderBy("scannedAt").toArray(),
    ]);
    const currency = new Map(regions.map((r) => [r.id, r.currency]));
    return {
      app: "hargana",
      exportedAt: clock.now().toISOString(),
      regions,
      chains,
      stores,
      categories,
      items,
      observations: observations.map((o) => ({ ...o, currency: currency.get(o.regionId) ?? "" })),
      unknownBarcodes,
    };
  }

  return {
    exportData,

    /**
     * The same data as spreadsheet files, by file name: items, stores (with
     * chain and region) and price observations (with item, store and currency).
     */
    async exportCsv(): Promise<Record<string, string>> {
      const data = await exportData();
      const byId = <T extends { id: string }>(records: T[]) => new Map(records.map((r) => [r.id, r]));
      const regions = byId(data.regions);
      const chains = byId(data.chains);
      const stores = byId(data.stores);
      const categories = byId(data.categories);
      const items = byId(data.items);

      return {
        "items.csv": csv(
          ["id", "kind", "name", "brand", "barcode", "size_value", "size_unit", "pricing_unit", "category", "aliases", "photo_url", "created_at", "updated_at"],
          data.items.map((i) => [
            i.id,
            i.kind,
            i.name,
            i.kind === "product" ? i.brand : null,
            i.kind === "product" ? i.barcode : null,
            i.kind === "product" ? i.sizeValue : null,
            i.kind === "product" ? i.sizeUnit : null,
            i.kind === "commodity" ? i.pricingUnit : null,
            i.categoryId && categories.get(i.categoryId)?.name,
            i.aliases.join("; "),
            i.photo?.imageUrl,
            i.createdAt,
            i.updatedAt,
          ]),
        ),
        "stores.csv": csv(
          ["id", "name", "type", "chain", "region", "currency", "address", "lat", "lng", "updated_at"],
          data.stores.map((s) => [
            s.id,
            s.name,
            s.type,
            s.chainId && chains.get(s.chainId)?.name,
            regions.get(s.regionId)?.name,
            regions.get(s.regionId)?.currency,
            s.address,
            s.lat,
            s.lng,
            s.updatedAt,
          ]),
        ),
        "observations.csv": csv(
          [
            "id",
            "observed_at",
            "item_id",
            "item",
            "store_id",
            "store",
            "chain",
            "region",
            "scope",
            "action",
            "currency",
            "price",
            "price_max",
            "price_per",
            "promo_price",
            "promo_until",
            "entered_amount",
            "entered_amount_max",
            "entered_qty",
            "entered_unit",
            "note",
            "source",
            "verified",
          ],
          data.observations.map((o) => {
            const item = items.get(o.itemId);
            return [
              o.id,
              o.observedAt,
              o.itemId,
              item?.name,
              o.storeId,
              stores.get(o.storeId)?.name,
              o.chainId && chains.get(o.chainId)?.name,
              regions.get(o.regionId)?.name,
              o.scope,
              o.action,
              o.currency,
              o.price,
              o.priceMax,
              item && priceUnit(item),
              o.promoPrice,
              o.promoUntil,
              o.enteredAmount,
              o.enteredAmountMax,
              o.enteredQty,
              o.enteredUnit,
              o.note,
              o.source,
              o.verified,
            ];
          }),
        ),
      };
    },
  };
}

type Cell = string | number | boolean | null | undefined;

/**
 * RFC 4180 CSV with a UTF-8 byte order mark and CRLF line ends, which
 * spreadsheets open with accents intact. Text that a spreadsheet would run as
 * a formula is prefixed with an apostrophe.
 */
function csv(header: string[], rows: Cell[][]) {
  const cell = (value: Cell) => {
    if (value === null || value === undefined || value === "") return "";
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
