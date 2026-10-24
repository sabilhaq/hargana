import type { Clock } from "./clock";
import { CoreError } from "./errors";
import { recorderId, recorders } from "./people";
import { currentVisit } from "./places";
import type { HarganaStorage } from "./storage";
import type {
  Chain,
  ChainPrice,
  Elsewhere,
  EntryUnit,
  Item,
  ItemPrices,
  PriceCorrection,
  PriceEntry,
  PriceHistory,
  PriceHistoryEntry,
  PriceObservation,
  PriceRow,
  Region,
  StalePrice,
  Store,
  StorePrice,
} from "./types";
import { perUnitPrice } from "./units";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Items dismissed from the stale list, for one visit to a store. */
const STALE_DISMISSED = "staleDismissed";
type StaleDismissed = { visit: string; itemIds: string[] };
const LOWEST_WINDOW_DAYS = 90;

/** The calendar day on the device, YYYY-MM-DD. */
export function localDay(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** An observation's price today: its promo price while the promo runs (through its last day). */
export function effective(observation: PriceObservation, today: string) {
  const { promoPrice, promoUntil } = observation;
  return promoPrice != null && promoUntil && promoUntil >= today
    ? { price: promoPrice, regularPrice: observation.price, promoUntil }
    : { price: observation.price, regularPrice: observation.price, promoUntil: null };
}

/** The unit an item's prices are kept per. */
export function priceUnit(item: Item): EntryUnit {
  return item.kind === "commodity" ? item.pricingUnit : "pcs";
}

/**
 * Each store's current price, by the current-price rules:
 * - market: the latest market-scope observation at that market;
 * - branch: whichever is newer, its latest branch-scope observation or its
 *   chain's latest chain-scope observation.
 */
export function resolveStores(observations: PriceObservation[], stores: Store[]) {
  const market = latestBy(observations, "market", (o) => o.storeId);
  const branch = latestBy(observations, "branch", (o) => o.storeId);
  const chain = latestBy(observations, "chain", (o) => o.chainId!);

  const resolved = new Map<string, PriceObservation>();
  for (const store of stores) {
    const observation =
      store.type === "traditional_market"
        ? market.get(store.id)
        : newer(branch.get(store.id), store.chainId ? chain.get(store.chainId) : undefined);
    if (observation) resolved.set(store.id, observation);
  }
  return { resolved, chainLatest: chain };
}

function latestBy(observations: PriceObservation[], scope: PriceObservation["scope"], key: (o: PriceObservation) => string) {
  const latest = new Map<string, PriceObservation>();
  for (const observation of observations) {
    if (observation.scope !== scope) continue;
    const current = latest.get(key(observation));
    if (!current || observation.observedAt > current.observedAt) latest.set(key(observation), observation);
  }
  return latest;
}

function newer(a?: PriceObservation, b?: PriceObservation) {
  if (!a) return b;
  if (!b) return a;
  return b.observedAt > a.observedAt ? b : a;
}

/**
 * The observations that still count: without the corrected ones, and without
 * confirmations of a corrected observation (or of such a confirmation).
 */
export function withoutCorrected(observations: PriceObservation[], corrections: Pick<PriceCorrection, "observationId">[]) {
  const removed = new Set(corrections.map((c) => c.observationId));
  for (let grew = removed.size > 0; grew; ) {
    grew = false;
    for (const o of observations) {
      if (o.confirms && removed.has(o.confirms) && !removed.has(o.id)) {
        removed.add(o.id);
        grew = true;
      }
    }
  }
  return { live: observations.filter((o) => !removed.has(o.id)), removed };
}

const samePrice = (a: { price: number; priceMax: number | null }, b: { price: number; priceMax: number | null }) =>
  a.price === b.price && a.priceMax === b.priceMax;

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

  async function mustStore() {
    const { currentStore } = await context();
    if (!currentStore) throw new CoreError("no_current_store");
    return currentStore;
  }

  /** The item's observations in a region that still count (see withoutCorrected). */
  async function observationsAt(itemId: string, regionId: string) {
    const [observations, corrections] = await Promise.all([
      storage.observations.where({ itemId, regionId }).toArray(),
      storage.priceCorrections.where({ itemId }).toArray(),
    ]);
    return withoutCorrected(observations, corrections).live;
  }

  /** The observation that gives `store` its current price, if any. */
  async function currentAt(itemId: string, store: Store) {
    const observations = await observationsAt(itemId, store.regionId);
    return resolveStores(observations, [store]).resolved.get(store.id);
  }

  return {
    /**
     * Records a price seen at the current store as a new observation. The
     * per-unit price is computed here; the typed amount, quantity and unit are
     * kept as entered. At a branch it applies to that branch only unless
     * `scope` is "chain".
     */
    async recordPrice(entry: PriceEntry): Promise<PriceObservation> {
      const store = await mustStore();
      const item = await mustItem(entry.itemId);
      const isMarket = store.type === "traditional_market";
      if (!Number.isInteger(entry.amount) || entry.amount <= 0) throw new CoreError("invalid", "amount must be a positive integer");
      if (!(entry.qty > 0)) throw new CoreError("invalid", "quantity must be positive");
      const amountMax = entry.amountMax || null;
      if (amountMax !== null && (!Number.isInteger(amountMax) || amountMax < entry.amount)) {
        throw new CoreError("invalid", "the top of a range must not be below its bottom");
      }
      if (amountMax !== null && !isMarket) throw new CoreError("invalid", "only market prices can be a range");
      if (entry.scope === "chain" && isMarket) throw new CoreError("invalid", "a market has no chain");
      const promoAmount = entry.promoAmount || null;
      if (promoAmount !== null) {
        if (!Number.isInteger(promoAmount) || promoAmount <= 0 || promoAmount >= entry.amount) {
          throw new CoreError("invalid", "a promo price must be a whole amount below the regular price");
        }
        if (amountMax !== null) throw new CoreError("invalid", "a range cannot have a promo");
        if (!entry.promoUntil || !/^\d{4}-\d{2}-\d{2}$/.test(entry.promoUntil) || entry.promoUntil < localDay(clock.now())) {
          throw new CoreError("invalid", "a promo needs an end date that is not in the past");
        }
      }

      const unit = priceUnit(item);
      const price = perUnitPrice(entry.amount, entry.qty, entry.unit, unit);
      if (price === null) throw new CoreError("incompatible_unit");
      const priceMax = amountMax === null ? null : perUnitPrice(amountMax, entry.qty, entry.unit, unit);
      const scope = isMarket ? "market" : (entry.scope ?? "branch");

      const previous = await currentAt(item.id, store);
      const observation: PriceObservation = {
        id: crypto.randomUUID(),
        itemId: item.id,
        regionId: store.regionId,
        scope,
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
        promoPrice: promoAmount === null ? null : perUnitPrice(promoAmount, entry.qty, entry.unit, unit),
        promoUntil: promoAmount === null ? null : entry.promoUntil!,
        source: "collector",
        verified: true,
        observedAt: clock.now().toISOString(),
        recordedBy: await recorderId(storage),
      };
      await storage.saveSynced("observations", observation);
      return observation;
    },

    /**
     * "Sama ✓": the price shown for the current store is still right. Adds a
     * confirm observation at that same price for this store (a branch, even
     * when the price came from its chain), so we know it was checked.
     */
    async confirmPrice(itemId: string): Promise<PriceObservation> {
      const store = await mustStore();
      await mustItem(itemId);
      const shown = await currentAt(itemId, store);
      if (!shown) throw new CoreError("no_price");
      const observation: PriceObservation = {
        ...shown,
        id: crypto.randomUUID(),
        scope: store.type === "traditional_market" ? "market" : "branch",
        chainId: store.chainId,
        storeId: store.id,
        action: "confirm",
        confirms: shown.id,
        note: null,
        source: "collector",
        verified: true,
        observedAt: clock.now().toISOString(),
        recordedBy: await recorderId(storage),
      };
      await storage.saveSynced("observations", observation);
      return observation;
    },

    /**
     * Takes back a price recorded by mistake: the store falls back to the price
     * it had before. Nothing is deleted; a correction is recorded and synced.
     * Removing the same observation again changes nothing.
     */
    async removePrice(observationId: string): Promise<PriceCorrection> {
      const observation = await storage.observations.get(observationId);
      if (!observation) throw new CoreError("not_found", `Observation ${observationId} not found`);
      const existing = await storage.priceCorrections.where({ observationId }).first();
      if (existing) return existing;
      return storage.saveSynced("priceCorrections", {
        id: crypto.randomUUID(),
        observationId,
        itemId: observation.itemId,
        regionId: observation.regionId,
        correctedAt: clock.now().toISOString(),
        recordedBy: await recorderId(storage),
      });
    },

    /**
     * The item's recorded prices in the active region, for the history view:
     * the list newest first and one chart line per store (a chain-wide price
     * is drawn on its chain's line). With `storeId`, only what applies to that
     * store: its own prices and its chain's chain-wide ones.
     */
    async priceHistory(itemId: string, { storeId }: { storeId?: string } = {}): Promise<PriceHistory> {
      const item = await mustItem(itemId);
      const { activeRegion } = await context();
      const regionId = activeRegion.id;
      const [region, observations, stores, chains] = await Promise.all([
        storage.regions.get(regionId),
        observationsAt(itemId, regionId),
        storage.stores.where({ regionId }).toArray(),
        storage.chains.where({ regionId }).toArray(),
      ]);
      const storeById = new Map(stores.map((s) => [s.id, s]));
      const chainById = new Map(chains.map((c) => [c.id, c]));
      const who = await recorders(storage);

      const all: PriceHistoryEntry[] = [];
      for (const observation of observations) {
        const store = storeById.get(observation.storeId);
        if (!store) continue;
        const chain = observation.scope === "chain" && observation.chainId ? (chainById.get(observation.chainId) ?? null) : null;
        all.push({
          observation,
          store,
          chain,
          line: chain ? `chain:${chain.id}` : `store:${store.id}`,
          paid: effective(observation, localDay(new Date(observation.observedAt))).price,
          recordedBy: who(observation.recordedBy),
        });
      }
      all.sort((a, b) => b.observation.observedAt.localeCompare(a.observation.observedAt));

      const lineName = (e: PriceHistoryEntry) => e.chain?.name ?? e.store.name;
      const names = [...new Map(all.map((e) => [e.line, lineName(e)]))].sort((a, b) => a[1].localeCompare(b[1]));
      const order = new Map(names.map(([key], i) => [key, i]));

      const only = storeId ? storeById.get(storeId) : undefined;
      const entries = only ? all.filter((e) => e.store.id === only.id || (e.chain && e.chain.id === only.chainId)) : all;

      const lines = new Map<string, PriceHistory["lines"][number]>();
      for (const e of [...entries].reverse()) {
        const line = lines.get(e.line) ?? { key: e.line, name: lineName(e), order: order.get(e.line)!, points: [] };
        line.points.push({ observedAt: e.observation.observedAt, paid: e.paid, observationId: e.observation.id });
        lines.set(e.line, line);
      }

      const since = new Date(clock.now().getTime() - LOWEST_WINDOW_DAYS * DAY_MS).toISOString();
      const recent = entries.filter((e) => e.observation.observedAt >= since).map((e) => e.paid);

      return {
        region: region!,
        unit: priceUnit(item),
        entries,
        lines: [...lines.values()].sort((a, b) => a.order - b.order),
        lowest90Days: recent.length ? Math.min(...recent) : null,
        stores: [...new Map(all.map((e) => [e.store.id, e.store])).values()].sort((a, b) => a.name.localeCompare(b.name)),
        asOf: clock.now().toISOString(),
      };
    },

    /**
     * At the current store: items whose price here is stale (older than the
     * region's threshold for markets or supermarkets), most stale first,
     * without those dismissed on this visit. Empty without a current store.
     */
    async stalePricesHere({ limit = 10 }: { limit?: number } = {}): Promise<{ prices: StalePrice[]; total: number; region: Region | null }> {
      const { currentStore: store } = await context();
      if (!store) return { prices: [], total: 0, region: null };
      const [region, observations, corrections, dismissed, visit] = await Promise.all([
        storage.regions.get(store.regionId),
        storage.observations.filter((o) => o.regionId === store.regionId).toArray(),
        storage.priceCorrections.toArray(),
        storage.settings.get(STALE_DISMISSED),
        currentVisit(storage),
      ]);
      const hidden = new Set(
        (dismissed?.value as StaleDismissed | undefined)?.visit === visit ? (dismissed!.value as StaleDismissed).itemIds : [],
      );
      const threshold = store.type === "traditional_market" ? region!.staleDaysMarket : region!.staleDaysSupermarket;
      const now = clock.now().getTime();
      const today = localDay(clock.now());

      const byItem = new Map<string, PriceObservation[]>();
      for (const o of withoutCorrected(observations, corrections).live) {
        byItem.set(o.itemId, [...(byItem.get(o.itemId) ?? []), o]);
      }
      const stale: { itemId: string; observation: PriceObservation; ageDays: number }[] = [];
      for (const [itemId, list] of byItem) {
        if (hidden.has(itemId)) continue;
        const observation = resolveStores(list, [store]).resolved.get(store.id);
        if (!observation) continue;
        const ageDays = Math.floor((now - new Date(observation.observedAt).getTime()) / DAY_MS);
        if (ageDays > threshold) stale.push({ itemId, observation, ageDays });
      }
      stale.sort((a, b) => a.observation.observedAt.localeCompare(b.observation.observedAt));

      const items = await storage.items.bulkGet(stale.slice(0, limit).map((s) => s.itemId));
      const prices = stale.slice(0, limit).flatMap(({ observation, ageDays }, i) =>
        items[i]
          ? [
              {
                item: items[i],
                ...effective(observation, today),
                priceMax: observation.priceMax,
                ageDays,
                fromChain: observation.scope === "chain",
              },
            ]
          : [],
      );
      return { prices, total: stale.length, region: region! };
    },

    /** Hides an item from the stale list until the current visit ends. */
    async dismissStale(itemId: string) {
      const visit = await currentVisit(storage);
      if (!visit) return;
      const current = (await storage.settings.get(STALE_DISMISSED))?.value as StaleDismissed | undefined;
      const itemIds = current?.visit === visit ? [...new Set([...current.itemIds, itemId])] : [itemId];
      await storage.settings.put({ key: STALE_DISMISSED, value: { visit, itemIds } satisfies StaleDismissed });
    },

    /** Every observation of an item, newest first, removed ones included. */
    async listObservations(itemId: string) {
      const observations = await storage.observations.where({ itemId }).toArray();
      return observations.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    },

    /**
     * The item's prices in the active region, cheapest first (ranges by their
     * low end). Markets and lone branches are one row each; a chain with a
     * chain price or several priced branches is one row holding its branches.
     */
    async itemPrices(itemId: string): Promise<ItemPrices> {
      const item = await mustItem(itemId);
      const { activeRegion, currentStore } = await context();
      const regionId = activeRegion.id;
      const [region, observations, stores, chains] = await Promise.all([
        storage.regions.get(regionId),
        observationsAt(itemId, regionId),
        storage.stores.where({ regionId }).toArray(),
        storage.chains.where({ regionId }).toArray(),
      ]);
      const chainById = new Map(chains.map((c) => [c.id, c]));
      const { resolved, chainLatest } = resolveStores(observations, stores);
      const who = await recorders(storage);
      const now = clock.now().getTime();
      const today = localDay(clock.now());

      const age = (observation: PriceObservation, type: Store["type"]) => {
        const ageDays = Math.floor((now - new Date(observation.observedAt).getTime()) / DAY_MS);
        const threshold = type === "traditional_market" ? region!.staleDaysMarket : region!.staleDaysSupermarket;
        return { ageDays, stale: ageDays > threshold };
      };
      const storePrice = (store: Store, observation: PriceObservation): StorePrice => ({
        store,
        chain: store.chainId ? (chainById.get(store.chainId) ?? null) : null,
        ...effective(observation, today),
        priceMax: observation.priceMax,
        note: observation.note,
        observedAt: observation.observedAt,
        ...age(observation, store.type),
        fromChain: observation.scope === "chain",
        observation,
        recordedBy: who(observation.recordedBy),
      });
      const byPrice = (a: { price: number }, b: { price: number }) => a.price - b.price;

      const hereObservation = currentStore && resolved.get(currentStore.id);
      const here = hereObservation ? storePrice(currentStore, hereObservation) : null;

      const rows: PriceRow[] = [];
      const branchesByChain = new Map<string, StorePrice[]>();
      for (const store of stores) {
        const observation = resolved.get(store.id);
        if (!observation) continue;
        const price = storePrice(store, observation);
        if (store.type === "branch" && store.chainId) {
          branchesByChain.set(store.chainId, [...(branchesByChain.get(store.chainId) ?? []), price]);
        } else {
          rows.push({ kind: "store", ...price });
        }
      }
      for (const [chainId, branches] of branchesByChain) {
        const chainObservation = chainLatest.get(chainId);
        if (!chainObservation && branches.length === 1) {
          rows.push({ kind: "store", ...branches[0] });
          continue;
        }
        branches.sort((a, b) => byPrice(a, b) || a.store.name.localeCompare(b.store.name));
        rows.push({ kind: "chain", ...chainRow(chainById.get(chainId)!, chainObservation ?? branches[0].observation, branches) });
      }
      rows.sort((a, b) => byPrice(a, b) || rowName(a).localeCompare(rowName(b)));

      // Cheapest elsewhere: every other store, with a chain price shared by
      // branches counted once under the chain's name. The chain price that
      // applies here is not "elsewhere".
      let cheapestElsewhere: Elsewhere | null = null;
      const seen = new Set<string>();
      for (const store of stores) {
        const observation = resolved.get(store.id);
        if (!observation || store.id === currentStore?.id) continue;
        const sharedChainPrice = observation.scope === "chain";
        const key = sharedChainPrice ? `chain:${observation.id}` : `store:${store.id}`;
        if (seen.has(key) || (sharedChainPrice && here?.observation.id === observation.id)) continue;
        seen.add(key);
        const price = storePrice(store, observation);
        if (cheapestElsewhere && price.price >= cheapestElsewhere.price) continue;
        cheapestElsewhere = {
          name: sharedChainPrice ? price.chain!.name : store.name,
          chainId: sharedChainPrice ? store.chainId : null,
          price: price.price,
          priceMax: price.priceMax,
          regularPrice: price.regularPrice,
          promoUntil: price.promoUntil,
          ageDays: price.ageDays,
          stale: price.stale,
          difference: here ? here.price - price.price : null,
        };
      }

      // Lowest in 90 days: any observation in the region, at its promo price if it had one.
      const since = new Date(now - LOWEST_WINDOW_DAYS * DAY_MS).toISOString();
      const storeById = new Map(stores.map((st) => [st.id, st]));
      let lowest90Days: ItemPrices["lowest90Days"] = null;
      for (const observation of observations) {
        const store = storeById.get(observation.storeId);
        if (!store || observation.observedAt < since) continue;
        const price = Math.min(observation.price, observation.promoPrice ?? Infinity);
        if (!lowest90Days || price < lowest90Days.price || (price === lowest90Days.price && observation.observedAt > lowest90Days.observedAt)) {
          lowest90Days = { price, observedAt: observation.observedAt, store };
        }
      }

      return { region: region!, unit: priceUnit(item), rows, here, cheapestElsewhere, lowest90Days };

      function chainRow(chain: Chain, observation: PriceObservation, branches: StorePrice[]): ChainPrice {
        return {
          chain,
          ...effective(observation, today),
          priceMax: observation.priceMax,
          note: observation.note,
          observedAt: observation.observedAt,
          ...age(observation, "branch"),
          observation,
          recordedBy: who(observation.recordedBy),
          branches,
          varies: branches.some((b) => !samePrice(b, branches[0])),
        };
      }
    },
  };
}

function rowName(row: PriceRow) {
  return row.kind === "chain" ? row.chain.name : row.store.name;
}

