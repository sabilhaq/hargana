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
