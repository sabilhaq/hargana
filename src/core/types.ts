// Domain records as the core hands them to the UI. Ids are client-generated
// UUIDs; `updatedAt` is an ISO timestamp used by sync.

/** Removed items, stores and chains, for Settings → Dihapus. */
export type RemovedRecords = { items: Item[]; stores: Store[]; chains: Chain[] };

/** What a person may do: the owner runs Hargana; contributors help collect prices. */
export type Role = "owner" | "contributor";

/** A person using Hargana (an account on the server). `role` is known once signed in. */
export type User = { id: string; name: string; role?: Role };

/** Who recorded something, for display: `name` is null when unknown on this device. */
export type Recorder = { id: string; name: string | null; isMe: boolean };

export type Region = {
  id: string;
  name: string;
  countryCode: string;
  currency: string;
  locale: string;
  staleDaysMarket: number;
  staleDaysSupermarket: number;
  /** Who added it; set by the server. Absent on data from before this was kept, which only the owner may change. */
  createdBy?: string | null;
  updatedAt: string;
};

export type Chain = {
  id: string;
  regionId: string;
  name: string;
  /** Who added it; set by the server. Absent on data from before this was kept, which only the owner may change. */
  createdBy?: string | null;
  /** Set when the owner removed it: kept, but hidden and no longer counted anywhere. */
  removedAt?: string | null;
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
  /** Who added it; set by the server. Absent on data from before this was kept, which only the owner may change. */
  createdBy?: string | null;
  /** Set when the owner removed it: kept, but hidden and no longer counted anywhere. */
  removedAt?: string | null;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  /** Who added it; set by the server. Absent on data from before this was kept, which only the owner may change. */
  createdBy?: string | null;
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

/**
 * An item's photo. Its URLs are set once the photo is uploaded; until then
 * only the device that took it can show it.
 */
export type ItemPhoto = { id: string; imageUrl: string | null; thumbUrl: string | null };

/** What the device knows of an item's photo: the thumbnail is kept for offline use. */
export type PhotoView = {
  /** JPEG bytes of the thumbnail, when on this device. */
  thumb: ArrayBuffer | null;
  /** JPEG bytes of the full image, until it is uploaded. */
  image: ArrayBuffer | null;
  imageUrl: string | null;
  thumbUrl: string | null;
};

/** A non-barcoded item priced per unit, found by search (e.g. "Cabai rawit merah" per kg). */
export type Commodity = {
  id: string;
  kind: "commodity";
  name: string;
  /** Other names it goes by, e.g. "cabe rawit" or the Sundanese "cengek". */
  aliases: string[];
  categoryId: string | null;
  pricingUnit: PricingUnit;
  photo?: ItemPhoto;
  createdAt: string;
  /** Who added it; set by the server. Absent on data from before this was kept, which only the owner may change. */
  createdBy?: string | null;
  /** Set when the owner removed it: kept, but hidden and no longer counted anywhere. */
  removedAt?: string | null;
  /**
   * Set when the owner merged this duplicate into another item: kept, but
   * hidden, and its prices count as that item's.
   */
  mergedInto?: string | null;
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
  photo?: ItemPhoto;
  createdAt: string;
  /** Who added it; set by the server. Absent on data from before this was kept, which only the owner may change. */
  createdBy?: string | null;
  /** Set when the owner removed it: kept, but hidden and no longer counted anywhere. */
  removedAt?: string | null;
  updatedAt: string;
};

/** Anything in the catalog. */
export type Item = Commodity | Product;

export type CommodityInput = Omit<Commodity, "id" | "kind" | "photo" | "createdAt" | "updatedAt"> & { id?: string };
/** `barcode` may be in any valid EAN/UPC form; it is stored canonically. */
export type ProductInput = Omit<Product, "id" | "kind" | "photo" | "createdAt" | "updatedAt"> & { id?: string };

/** One lookup of a barcode that was not in the catalog, kept so it can be added later. */
export type UnknownBarcodeScan = {
  id: string;
  barcode: string;
  regionId: string;
  scannedAt: string;
  /** The user who recorded it, as set by the server on push; absent on records from before this was kept. */
  recordedBy?: string | null;
};

/** A barcode still missing from the catalog, with how often it was looked up. */
export type UnknownBarcode = { barcode: string; count: number; lastScannedAt: string };

/** What an outside product database knows about a barcode, to pre-fill the add form. */
export type ProductSuggestion = {
  name: string;
  brand?: string;
  sizeValue?: number;
  sizeUnit?: SizeUnit;
  /** A same-origin URL of a product image, if there is one. */
  imageUrl?: string;
};

/** Looks barcodes up in an outside product database (Open Food Facts). Null when unknown. */
export type ProductMetadata = {
  lookup(barcode: string): Promise<ProductSuggestion | null>;
};

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
  /** Promo price (same units as `price`), valid through `promoUntil` (YYYY-MM-DD, inclusive). */
  promoPrice?: number | null;
  promoUntil?: string | null;
  /** For a "Sama ✓" confirmation: the observation whose price it confirmed. */
  confirms?: string | null;
  source: "collector" | "shopper";
  verified: boolean;
  observedAt: string;
  /** The user who recorded it, as set by the server on push; absent on records from before this was kept. */
  recordedBy?: string | null;
};

/**
 * Takes back an observation recorded by mistake. Observations are never
 * edited or deleted; a correction makes every price rule ignore the one it
 * points at, and the confirmations that copied it.
 */
export type PriceCorrection = {
  id: string;
  observationId: string;
  itemId: string;
  regionId: string;
  correctedAt: string;
  /** The user who recorded it, as set by the server on push; absent on records from before this was kept. */
  recordedBy?: string | null;
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
  /** A promo price for the same quantity, valid through `promoUntil` (YYYY-MM-DD). */
  promoAmount?: number | null;
  promoUntil?: string | null;
};

/** The current price of an item at one store. */
export type StorePrice = {
  store: Store;
  chain: Chain | null;
  /** The effective price: the promo price while a promo runs, otherwise the regular one. */
  price: number;
  regularPrice: number;
  /** Set while a promo runs: its last day (YYYY-MM-DD). */
  promoUntil: string | null;
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
  recordedBy: Recorder | null;
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
  /**
   * The cheapest price anywhere else in the region. A chain price shared by
   * several branches counts once, under the chain's name.
   */
  cheapestElsewhere: Elsewhere | null;
  /** The lowest price recorded in the region in the last 90 days (promos included). */
  lowest90Days: { price: number; observedAt: string; store: Store } | null;
};

/** An item whose price at the current store is older than the region's threshold. */
export type StalePrice = {
  item: Item;
  price: number;
  priceMax: number | null;
  regularPrice: number;
  promoUntil: string | null;
  ageDays: number;
  /** The price is the store's chain price. */
  fromChain: boolean;
};

/** One recorded price in an item's history. */
export type PriceHistoryEntry = {
  observation: PriceObservation;
  store: Store;
  /** Set for a chain-wide price. */
  chain: Chain | null;
  /** The chart line it belongs to (`HistoryLine.key`). */
  line: string;
  /** What it cost that day: the promo price if a promo ran, else the price (low end of a range). */
  paid: number;
  recordedBy: Recorder | null;
};

/** A store's (or, for chain-wide prices, a chain's) price over time, oldest first. */
export type HistoryLine = {
  key: string;
  name: string;
  /** Stable position among all of the item's lines, so a line keeps its color when filtered. */
  order: number;
  points: { observedAt: string; paid: number; observationId: string }[];
};

export type PriceHistory = {
  region: Region;
  unit: EntryUnit;
  /** Newest first; removed prices are left out. */
  entries: PriceHistoryEntry[];
  lines: HistoryLine[];
  /** The lowest price paid in the last 90 days among these entries. */
  lowest90Days: number | null;
  /** Stores with a recorded price, by name, to filter by. */
  stores: Store[];
  /** When this was worked out: the chart runs each line on to here. */
  asOf: string;
};

export type Elsewhere = {
  /** The store, or the chain when its chain price applies at several branches. */
  name: string;
  /** Set when this is a chain price shared by branches. */
  chainId: string | null;
  price: number;
  priceMax: number | null;
  regularPrice: number;
  promoUntil: string | null;
  ageDays: number;
  stale: boolean;
  /** Price here minus this price: positive means it is cheaper elsewhere. Null without a price here. */
  difference: number | null;
};
