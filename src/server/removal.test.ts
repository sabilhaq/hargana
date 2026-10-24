import { beforeAll, describe, expect, it } from "vitest";
import { CoreError, type HarganaCore } from "@/core";
import { testCore } from "@/core/testing";
import { TEST_USERS, testServer } from "./testing";

const DAY = 24 * 60 * 60 * 1000;
const { owner, budi } = TEST_USERS;

// Starting the in-memory Postgres takes a while; do it before the timed tests.
beforeAll(() => testServer(), 60_000);

async function setUp(core: HarganaCore, clock: { advance(ms: number): void }) {
  const regionId = (await core.context()).activeRegion.id;
  const yomart = await core.saveChain({ regionId, name: "Yomart" });
  const kota = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Garut Kota" });
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const junk = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Tes" });
  const beras = await core.saveCommodity({ name: "Beras", pricingUnit: "kg", categoryId: null, aliases: [] });
  const indomie = await core.saveProduct({ barcode: "089686010947", name: "Indomie Goreng", aliases: [], categoryId: null });
  for (const [store, amount] of [[kota, 14000], [guntur, 12000], [junk, 1000]] as const) {
    await core.setCurrentStore(store.id);
    await core.recordPrice({ itemId: beras.id, amount, qty: 1, unit: "kg" });
    clock.advance(60_000);
  }
  await core.setCurrentStore(kota.id);
  await core.recordPrice({ itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs" });
  await core.addToList(beras.id, 2);
  return { yomart, kota, guntur, junk, beras, indomie };
}

describe("removing a store", () => {
  it("stops its prices counting anywhere, and restoring brings them back", async () => {
    const { core, clock } = testCore();
    const { junk, beras } = await setUp(core, clock);

    const before = await core.itemPrices(beras.id);
    expect(before.cheapestElsewhere?.name).toBe("Pasar Tes");
    expect(before.lowest90Days?.price).toBe(1000);

    await core.removeRecord("store", junk.id);
    const after = await core.itemPrices(beras.id);
    expect(after.rows.map((r) => (r.kind === "store" ? r.store.name : r.chain.name))).not.toContain("Pasar Tes");
    expect(after.cheapestElsewhere?.name).toBe("Pasar Guntur");
    expect(after.lowest90Days?.price).toBe(12000);
    expect((await core.planShopping()).stores.map((s) => s.store.name)).not.toContain("Pasar Tes");
    expect((await core.browse({ sort: "price" })).groups.flatMap((g) => g.entries.map((e) => e.store.name))).not.toContain("Pasar Tes");
    expect((await core.listStores()).map((s) => s.name)).not.toContain("Pasar Tes");
    expect((await core.searchStores("tes")).length).toBe(0);
    expect((await core.listRemoved()).stores.map((s) => s.name)).toEqual(["Pasar Tes"]);

    await core.restoreRecord("store", junk.id);
    expect((await core.itemPrices(beras.id)).lowest90Days?.price).toBe(1000);
    expect((await core.listRemoved()).stores).toEqual([]);
  });

  it("clears it as the current store", async () => {
    const { core, clock } = testCore();
    const { junk } = await setUp(core, clock);
    await core.setCurrentStore(junk.id);

    await core.removeRecord("store", junk.id);

    expect((await core.context()).currentStore).toBeNull();
  });

  it("removes a chain only once its branches are removed", async () => {
    const { core, clock } = testCore();
    const { yomart, kota } = await setUp(core, clock);

    await expect(core.removeRecord("chain", yomart.id)).rejects.toThrow(CoreError);
    await core.removeRecord("store", kota.id);
    await core.removeRecord("chain", yomart.id);

    expect((await core.listChains()).map((c) => c.name)).toEqual([]);
  });
});

describe("removing an item", () => {
  it("hides it from search, lists, browsing, stale prompts and the shopping plan; a scan still finds it", async () => {
    const { core, clock } = testCore();
    const { kota, beras, indomie } = await setUp(core, clock);

    await core.removeRecord("item", indomie.id);
    await core.removeRecord("item", beras.id);
    clock.advance(40 * DAY);
    await core.setCurrentStore(kota.id);

    expect(await core.searchItems("indomie")).toEqual([]);
    expect(await core.listItems()).toEqual([]);
    expect((await core.browse()).count).toBe(0);
    expect((await core.stalePricesHere()).prices).toEqual([]);
    expect((await core.planShopping()).count).toBe(0);
    const scan = await core.lookupBarcode("089686010947");
    expect(scan).toMatchObject({ status: "found", item: { id: indomie.id, removedAt: expect.any(String) } });
  });
});

describe("removal and sync", () => {
  it("reaches other devices, and is refused from a contributor", async () => {
    const { transport, signInAs } = await testServer();
    const mine = testCore();
    const budis = testCore();
    await mine.core.setCurrentUser(owner);
    await budis.core.setCurrentUser(budi);
    const { junk } = await setUp(mine.core, mine.clock);
    await mine.core.sync(transport);
    signInAs(budi);
    await budis.core.sync(transport);

    // A friend tries to remove a store (even though the app hides the button).
    budis.clock.advance(DAY);
    await budis.core.removeRecord("store", junk.id);
    expect((await budis.core.sync(transport)).refused).toBe(1);
    expect((await budis.core.listStores()).map((s) => s.name)).toContain("Pasar Tes");

    signInAs(owner);
    mine.clock.advance(DAY);
    await mine.core.removeRecord("store", junk.id);
    expect((await mine.core.sync(transport)).refused).toBe(0);
    signInAs(budi);
    await budis.core.sync(transport);
    expect((await budis.core.listStores()).map((s) => s.name)).not.toContain("Pasar Tes");
  });
});
