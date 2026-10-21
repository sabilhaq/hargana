import type { Clock } from "./clock";
import { CoreError } from "./errors";
import { GARUT_REGION_ID } from "./seed";
import type { HarganaStorage } from "./storage";
import type { Category, Chain, CoreContext, Input, LatLng, Region, Store, StoreMatch } from "./types";

/** The current store is forgotten after this long without using the app. */
export const CURRENT_STORE_TTL_MS = 4 * 60 * 60 * 1000;
/** Stores closer than this are suggested first in the store picker. */
export const NEARBY_KM = 3;

type CurrentStoreSetting = { storeId: string; lastActiveAt: string };

const ACTIVE_REGION = "activeRegionId";
const CURRENT_STORE = "currentStore";

export function places(storage: HarganaStorage, clock: Clock) {
  const now = () => clock.now().toISOString();

  async function setting<T>(key: string): Promise<T | undefined> {
    return (await storage.settings.get(key))?.value as T | undefined;
  }

  /** The saved form of an input: a new id when creating, and a fresh timestamp. */
  function stamp<T extends { id: string; updatedAt: string }>(input: Input<T>) {
    return { ...input, id: input.id ?? crypto.randomUUID(), updatedAt: now() } as T;
  }

  const activeRegionId = () => activeRegion(storage);

  return {
    listRegions: () => storage.regions.toArray().then(byName),
    getRegion: async (id: string) => must(await storage.regions.get(id), "Region", id),
    async saveRegion(input: Input<Region>) {
      required(input.name, "name");
      required(input.currency, "currency");
      required(input.locale, "locale");
      if (!(input.staleDaysMarket >= 1 && input.staleDaysSupermarket >= 1)) {
        throw new CoreError("invalid", "staleness thresholds must be at least 1 day");
      }
      return storage.saveSynced(
        "regions",
        stamp<Region>({
          ...input,
          name: input.name.trim(),
          currency: input.currency.trim().toUpperCase(),
          countryCode: input.countryCode.trim().toUpperCase(),
        }),
      );
    },

    listChains: (regionId?: string) =>
      (regionId ? storage.chains.where({ regionId }) : storage.chains.toCollection()).toArray().then(byName),
    async saveChain(input: Input<Chain>) {
      required(input.name, "name");
      must(await storage.regions.get(input.regionId), "Region", input.regionId);
      return storage.saveSynced("chains", stamp<Chain>({ ...input, name: input.name.trim() }));
    },

    listStores: (regionId?: string) =>
      (regionId ? storage.stores.where({ regionId }) : storage.stores.toCollection()).toArray().then(byName),
    getStore: async (id: string) => must(await storage.stores.get(id), "Store", id),
    async saveStore(input: Input<Store>) {
      required(input.name, "name");
      must(await storage.regions.get(input.regionId), "Region", input.regionId);
      if (input.type === "branch") {
        if (!input.chainId) throw new CoreError("branch_needs_chain");
        const chain = must(await storage.chains.get(input.chainId), "Chain", input.chainId);
        if (chain.regionId !== input.regionId) throw new CoreError("chain_in_other_region");
      } else if (input.chainId) {
        throw new CoreError("market_has_no_chain");
      }
      return storage.saveSynced("stores", stamp<Store>({ ...input, name: input.name.trim() }));
    },

    /**
     * Stores whose name or chain name contains every word of `query`, across
     * all regions. With a location, stores within NEARBY_KM come first,
     * closest first; the rest are sorted by name.
     */
    async searchStores(query = "", near?: LatLng): Promise<StoreMatch[]> {
      const [stores, chains, regions] = await Promise.all([
        storage.stores.toArray(),
        storage.chains.toArray(),
        storage.regions.toArray(),
      ]);
      const chainById = new Map(chains.map((c) => [c.id, c]));
      const regionById = new Map(regions.map((r) => [r.id, r]));
      const words = normalize(query).split(" ").filter(Boolean);

      return stores
        .map((store): StoreMatch => {
          const chain = store.chainId ? (chainById.get(store.chainId) ?? null) : null;
          const distanceKm =
            near && store.lat != null && store.lng != null
              ? haversineKm(near, { lat: store.lat, lng: store.lng })
              : undefined;
          return {
            store,
            chain,
            region: regionById.get(store.regionId)!,
            distanceKm,
            nearby: distanceKm != null && distanceKm <= NEARBY_KM,
          };
        })
        .filter(({ store, chain }) => {
          const haystack = normalize(`${store.name} ${chain?.name ?? ""}`);
          return words.every((word) => haystack.includes(word));
        })
        .sort((a, b) => {
          if (a.nearby !== b.nearby) return a.nearby ? -1 : 1;
          if (a.nearby) return a.distanceKm! - b.distanceKm!;
          return a.store.name.localeCompare(b.store.name);
        });
    },

    listCategories: () => storage.categories.orderBy("sortOrder").toArray(),
    async saveCategory(input: Input<Category>) {
      required(input.name, "name");
      return storage.saveSynced("categories", stamp<Category>({ ...input, name: input.name.trim() }));
    },

    /**
     * Where I am. Calling it counts as using the app: it keeps the current
     * store alive, unless the app sat idle longer than CURRENT_STORE_TTL_MS.
     */
    async context(): Promise<CoreContext> {
      let currentStore: Store | null = null;
      const current = await setting<CurrentStoreSetting>(CURRENT_STORE);
      if (current) {
        const idle = clock.now().getTime() - new Date(current.lastActiveAt).getTime();
        if (idle <= CURRENT_STORE_TTL_MS) currentStore = (await storage.stores.get(current.storeId)) ?? null;
        if (currentStore) {
          await storage.settings.put({ key: CURRENT_STORE, value: { ...current, lastActiveAt: now() } });
        } else {
          await storage.settings.delete(CURRENT_STORE);
        }
      }
      const regionId = await activeRegionId();
      const activeRegion = must(await storage.regions.get(regionId), "Region", regionId);
      return { activeRegion, currentStore };
    },

    /** Sets (or clears, with null) the current store; its region becomes active. */
    async setCurrentStore(storeId: string | null) {
      if (!storeId) {
        await storage.settings.delete(CURRENT_STORE);
        return;
      }
      const store = must(await storage.stores.get(storeId), "Store", storeId);
      const current: CurrentStoreSetting = { storeId, lastActiveAt: now() };
      await storage.settings.bulkPut([
        { key: CURRENT_STORE, value: current },
        { key: ACTIVE_REGION, value: store.regionId },
      ]);
    },

    /** Switches region by hand; a current store in another region is cleared. */
    async setActiveRegion(regionId: string) {
      must(await storage.regions.get(regionId), "Region", regionId);
      const current = await setting<CurrentStoreSetting>(CURRENT_STORE);
      const store = current && (await storage.stores.get(current.storeId));
      if (store && store.regionId !== regionId) await storage.settings.delete(CURRENT_STORE);
      await storage.settings.put({ key: ACTIVE_REGION, value: regionId });
    },
  };
}

/** The region the app shows: the one last chosen, else Garut, else any. */
export async function activeRegion(storage: HarganaStorage) {
  const id = (await storage.settings.get(ACTIVE_REGION))?.value as string | undefined;
  if (id && (await storage.regions.get(id))) return id;
  if (await storage.regions.get(GARUT_REGION_ID)) return GARUT_REGION_ID;
  return (await storage.regions.toCollection().first())!.id;
}

function must<T>(record: T | undefined, what: string, id: string): T {
  if (!record) throw new CoreError("not_found", `${what} ${id} not found`);
  return record;
}

function required(value: string | undefined, field: string) {
  if (!value?.trim()) throw new CoreError("invalid", `${field} is required`);
}

function byName<T extends { name: string }>(records: T[]) {
  return records.sort((a, b) => a.name.localeCompare(b.name));
}

/** Lowercase, accent-free, single-spaced text for matching. */
export function normalize(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function haversineKm(a: LatLng, b: LatLng) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
