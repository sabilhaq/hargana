// Domain records as the core hands them to the UI. Ids are client-generated
// UUIDs; `updatedAt` is an ISO timestamp used by sync.

export type Region = {
  id: string;
  name: string;
  countryCode: string;
  currency: string;
  locale: string;
  staleDaysMarket: number;
  staleDaysSupermarket: number;
  updatedAt: string;
};

export type Chain = {
  id: string;
  regionId: string;
  name: string;
  updatedAt: string;
};

export type StoreType = "branch" | "traditional_market";

/** A branch of a chain or a traditional market. */
export type Store = {
  id: string;
  regionId: string;
  chainId: string | null;
  type: StoreType;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  updatedAt: string;
};

/** Create when `id` is absent, otherwise update. */
export type Input<T extends { id: string; updatedAt: string }> = Omit<T, "id" | "updatedAt"> & {
  id?: string;
};

export type LatLng = { lat: number; lng: number };

export type StoreMatch = {
  store: Store;
  chain: Chain | null;
  region: Region;
  /** Kilometres from the given location, when both are known. */
  distanceKm?: number;
  nearby: boolean;
};

export type CoreContext = {
  activeRegion: Region;
  currentStore: Store | null;
};

/** Units a commodity can be priced per. */
export const PRICING_UNITS = ["kg", "g", "ons", "l", "ml", "pcs", "butir", "ikat", "bungkus", "sisir", "papan"] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

/** A non-barcoded item priced per unit, found by search (e.g. "Cabai rawit merah" per kg). */
export type Commodity = {
  id: string;
  kind: "commodity";
  name: string;
  /** Other names it goes by, e.g. "cabe rawit" or the Sundanese "cengek". */
  aliases: string[];
  categoryId: string | null;
  pricingUnit: PricingUnit;
  createdAt: string;
  updatedAt: string;
};

/** Units a product's package size can be given in (e.g. 400 g, 1 l, 10 pcs). */
export const SIZE_UNITS = ["g", "kg", "ml", "l", "pcs"] as const;
export type SizeUnit = (typeof SIZE_UNITS)[number];

/** A packaged item identified by its barcode, e.g. "Indomie Goreng 85 g". */
export type Product = {
  id: string;
  kind: "product";
  /** Canonical GTIN: 13 digits (EAN-13, UPC-A, expanded UPC-E) or 8 (EAN-8). */
  barcode: string;
  name: string;
  brand?: string;
  sizeValue?: number;
  sizeUnit?: SizeUnit;
  aliases: string[];
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Anything in the catalog. */
export type Item = Commodity | Product;

export type CommodityInput = Omit<Commodity, "id" | "kind" | "createdAt" | "updatedAt"> & { id?: string };
/** `barcode` may be in any valid EAN/UPC form; it is stored canonically. */
export type ProductInput = Omit<Product, "id" | "kind" | "createdAt" | "updatedAt"> & { id?: string };

export type BarcodeFormat = "ean_13" | "ean_8" | "upc_a" | "upc_e";

/** What a scanned or typed code turned out to be. */
export type BarcodeLookup =
  | { status: "found"; barcode: string; item: Product }
  | { status: "unknown"; barcode: string }
  | { status: "invalid"; reason: "not_product" | "wrong_length" | "bad_check_digit" };

export type ItemMatch = {
  item: Item;
  category: Category | null;
};

/** Units a price can be entered in: any pricing or size unit. */
export type EntryUnit = PricingUnit | SizeUnit;

/**
 * One dated record of a price seen at a store. Append-only: a new recording
 * adds a new observation, it never edits an old one.
 */
export type PriceObservation = {
  id: string;
  itemId: string;
  regionId: string;
  scope: "chain" | "branch" | "market";
  chainId: string | null;
  storeId: string;
  action: "new" | "confirm" | "change";
  /** Integer minor units (IDR: rupiah) per pricing unit (commodities) or per item (products). */
  price: number;
  /** Top of a market range, same units as `price`. */
  priceMax: number | null;
  /** What was typed, e.g. Rp 18.000 for 500 g. */
  enteredAmount: number;
  enteredAmountMax: number | null;
  enteredQty: number;
  enteredUnit: EntryUnit;
  note: string | null;
  source: "collector" | "shopper";
  verified: boolean;
  observedAt: string;
};

/** A price as typed at the store: `amount` (minor units) for `qty` `unit`. */
export type PriceEntry = {
  itemId: string;
  amount: number;
  /** For a market range: the highest amount for the same quantity. */
  amountMax?: number | null;
  qty: number;
  unit: EntryUnit;
  note?: string | null;
  /**
   * At a branch: "branch" (default) applies to this branch only, "chain" to
   * every branch of its chain that has no newer price of its own.
   */
  scope?: "branch" | "chain";
};

/** The current price of an item at one store. */
export type StorePrice = {
  store: Store;
  chain: Chain | null;
  price: number;
  priceMax: number | null;
  note: string | null;
  observedAt: string;
  /** Whole days since it was checked. */
  ageDays: number;
  /** Older than the region's threshold for this kind of store. */
  stale: boolean;
  /** The branch has no newer price of its own, so the chain price applies. */
  fromChain: boolean;
  observation: PriceObservation;
};

/** A chain's price, with what each of its branches resolves to. */
export type ChainPrice = Omit<StorePrice, "store" | "chain" | "fromChain"> & {
  chain: Chain;
  /** Branches with a known price, cheapest first. */
  branches: StorePrice[];
  /** Branches do not all have the same price ("berbeda di beberapa cabang"). */
  varies: boolean;
};

/** One line of the result screen: a single store, or a chain and its branches. */
export type PriceRow = ({ kind: "store" } & StorePrice) | ({ kind: "chain" } & ChainPrice);

export type ItemPrices = {
  region: Region;
  /** The unit `price` is per: the pricing unit for commodities, "pcs" for products. */
  unit: EntryUnit;
  /** Cheapest first (by the low end of ranges). */
  rows: PriceRow[];
  /** The current store's price, when a store is set and has one. */
  here: StorePrice | null;
};
