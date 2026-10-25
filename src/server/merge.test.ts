import { beforeAll, describe, expect, it } from "vitest";
import { CoreError, type HarganaCore } from "@/core";
import { testCore } from "@/core/testing";
import { TEST_USERS, testServer } from "./testing";

const DAY = 24 * 60 * 60 * 1000;
const { owner, budi } = TEST_USERS;

// Starting the in-memory Postgres takes a while; do it before the timed tests.
beforeAll(() => testServer(), 60_000);

/** "Cabai rawit" per kg at Pasar Ciawitali, and its duplicate "Cengek" per ons at Pasar Guntur. */
async function setUp(core: HarganaCore, clock: { advance(ms: number): void }) {
  const regionId = (await core.context()).activeRegion.id;
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const ciawitali = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Ciawitali" });
  const cabai = await core.saveCommodity({ name: "Cabai rawit", pricingUnit: "kg", categoryId: null, aliases: ["cabe rawit"] });
  const cengek = await core.saveCommodity({ name: "Cengek", pricingUnit: "ons", categoryId: null, aliases: ["cabe leutik"] });
  await core.setCurrentStore(ciawitali.id);
  await core.recordPrice({ itemId: cabai.id, amount: 45000, qty: 1, unit: "kg" });
  clock.advance(60_000);
  await core.setCurrentStore(guntur.id);
  await core.recordPrice({ itemId: cengek.id, amount: 5000, qty: 1, unit: "ons" });
  clock.advance(60_000);
  return { guntur, ciawitali, cabai, cengek };
}

/** Each store's current price, by name. */
async function storePrices(core: HarganaCore, itemId: string) {
  const result: Record<string, number> = {};
  for (const row of (await core.itemPrices(itemId)).rows) if (row.kind === "store") result[row.store.name] = row.price;
  return result;
}

describe("merging a duplicate item", () => {
  it("counts the duplicate's prices as the kept item's, in its unit", async () => {
    const { core, clock } = testCore();
    const { cabai, cengek } = await setUp(core, clock);

    await core.mergeItems(cabai.id, cengek.id);

    expect(await storePrices(core, cabai.id)).toEqual({ "Pasar Ciawitali": 45000, "Pasar Guntur": 50000 });
    const prices = await core.itemPrices(cabai.id);
    expect(prices).toMatchObject({ unit: "kg", here: { price: 50000 }, cheapestElsewhere: { name: "Pasar Ciawitali", price: 45000 } });
    expect(prices.lowest90Days?.price).toBe(45000);
    const history = await core.priceHistory(cabai.id);
    expect(history.entries.map((e) => [e.store.name, e.paid])).toEqual([
      ["Pasar Guntur", 50000],
      ["Pasar Ciawitali", 45000],
    ]);
  });

  it("finds the kept item by the duplicate's names, and leads the duplicate there", async () => {
    const { core, clock } = testCore();
    const { cabai, cengek } = await setUp(core, clock);

    const kept = await core.mergeItems(cabai.id, cengek.id);

    expect(kept.aliases).toEqual(["cabe rawit", "Cengek", "cabe leutik"]);
    expect((await core.searchItems("cengek")).map((m) => m.item.id)).toEqual([cabai.id]);
    expect((await core.searchItems("leutik")).map((m) => m.item.id)).toEqual([cabai.id]);
    expect((await core.listItems()).map((m) => m.item.name)).toEqual(["Cabai rawit"]);
    expect((await core.browse()).groups.flatMap((g) => g.entries.map((e) => [e.item.name, e.price]))).toEqual([["Cabai rawit", 45000]]);
    expect(await core.currentItemId(cengek.id)).toBe(cabai.id);
    expect((await core.itemPrices(cengek.id)).unit).toBe("kg");
    expect((await core.listRemoved()).items).toEqual([]);
  });

  it("carries the duplicate's stale prompts, confirmations and shopping-list entry over", async () => {
    const { core, clock } = testCore();
    const { guntur, cabai, cengek } = await setUp(core, clock);
    await core.addToList(cabai.id, 1);
    await core.addToList(cengek.id, 5); // 5 ons

    await core.mergeItems(cabai.id, cengek.id);

    expect((await core.listShopping()).map((e) => [e.item.name, e.qty, e.unit])).toEqual([["Cabai rawit", 1.5, "kg"]]);
    expect((await core.planShopping()).stores.map((s) => [s.store.name, s.total])).toEqual([
      ["Pasar Ciawitali", 67500],
      ["Pasar Guntur", 75000],
    ]);

    clock.advance(10 * DAY);
    await core.setCurrentStore(guntur.id);
    expect((await core.stalePricesHere()).prices).toMatchObject([{ item: { id: cabai.id }, price: 50000 }]);
    const confirm = await core.confirmPrice(cabai.id);
    expect(confirm).toMatchObject({ itemId: cabai.id, price: 50000, action: "confirm" });
    expect((await core.stalePricesHere()).prices).toEqual([]);
  });

  it("refuses products, units that do not convert, and an item merged already", async () => {
    const { core, clock } = testCore();
    const { cabai, cengek } = await setUp(core, clock);
    const kecap = await core.saveProduct({ barcode: "8992388101016", name: "Kecap Bango", aliases: [], categoryId: null });
    const bundle = await core.saveCommodity({ name: "Cabai seikat", pricingUnit: "ikat", categoryId: null, aliases: [] });
    const code = (promise: Promise<unknown>) => promise.then(() => null, (e: CoreError) => e.code);

    expect(await code(core.mergeItems(cabai.id, kecap.id))).toBe("cannot_merge_products");
    expect(await code(core.mergeItems(cabai.id, bundle.id))).toBe("incompatible_unit");
    expect(await code(core.mergeItems(cabai.id, cabai.id))).toBe("cannot_merge");
    await core.mergeItems(cabai.id, cengek.id);
    expect(await code(core.mergeItems(cengek.id, bundle.id))).toBe("cannot_merge");
  });

  it("notes the merge in the export", async () => {
    const { core, clock } = testCore();
    const { cabai, cengek } = await setUp(core, clock);

    await core.mergeItems(cabai.id, cengek.id);

    const items = (await core.exportCsv())["items.csv"].split("\r\n");
    expect(items[0]).toContain(",merged_into,");
    expect(items.find((line) => line.includes(",Cengek,"))).toContain(",Cabai rawit,");
    expect((await core.exportData()).items.find((i) => i.id === cengek.id)).toMatchObject({ mergedInto: cabai.id });
  });
});

describe("merging and sync", () => {
  it("reaches other devices, takes their shopping list along, and is refused from a contributor", async () => {
    const { transport, signInAs } = await testServer();
    const mine = testCore();
    const budis = testCore();
    await mine.core.setCurrentUser(owner);
    await budis.core.setCurrentUser(budi);
    const { cabai, cengek } = await setUp(mine.core, mine.clock);
    signInAs(owner);
    await mine.core.sync(transport);
    signInAs(budi);
    await budis.core.sync(transport);
    await budis.core.addToList(cengek.id, 2);

    // A friend tries to merge (even though the app hides the action).
    budis.clock.advance(DAY);
    await budis.core.mergeItems(cengek.id, cabai.id);
    expect((await budis.core.sync(transport)).refused).toBeGreaterThan(0);
    expect((await budis.core.listItems()).map((m) => m.item.name)).toEqual(["Cabai rawit", "Cengek"]);

    signInAs(owner);
    mine.clock.advance(DAY);
    await mine.core.mergeItems(cabai.id, cengek.id);
    expect((await mine.core.sync(transport)).refused).toBe(0);
    // Pushing again changes nothing.
    await mine.core.mergeItems(cabai.id, cengek.id).catch(() => {});
    expect(await mine.core.sync(transport)).toMatchObject({ pushed: 0, refused: 0 });

    signInAs(budi);
    await budis.core.sync(transport);
    expect((await budis.core.listItems()).map((m) => m.item.name)).toEqual(["Cabai rawit"]);
    expect(await storePrices(budis.core, cabai.id)).toEqual({ "Pasar Ciawitali": 45000, "Pasar Guntur": 50000 });
    expect((await budis.core.listShopping()).map((e) => [e.item.name, e.qty])).toEqual([["Cabai rawit", 0.2]]);
  });
});
