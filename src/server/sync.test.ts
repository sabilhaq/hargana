import { beforeAll, describe, expect, it } from "vitest";
import { emptyRecords, type HarganaCore, type PullResponse } from "@/core";
import { testCore } from "@/core/testing";
import { TEST_USERS, testServer } from "./testing";

const INDOMIE = "089686010947";

async function setUp(core: HarganaCore) {
  const regionId = (await core.context()).activeRegion.id;
  const yomart = await core.saveChain({ regionId, name: "Yomart" });
  const kota = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Garut Kota" });
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  return { regionId, kota, guntur };
}

async function pullAll(call: Awaited<ReturnType<typeof testServer>>["call"], regionIds: string[], cursor = 0) {
  const response = await call("pull", { regionIds, cursor });
  return (await response.json()) as PullResponse;
}

const ids = (records: { id: string }[]) => records.map((r) => r.id).sort();

// Starting the in-memory Postgres takes a while; do it before the timed tests.
beforeAll(() => testServer(), 60_000);

describe("push", () => {
  it("changes nothing when the same batch is pushed twice", async () => {
    const { call, transport } = await testServer();
    const { core } = testCore();
    const { regionId, kota } = await setUp(core);
    const indomie = await core.saveProduct({ barcode: INDOMIE, name: "Indomie Goreng", aliases: [], categoryId: null });
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs" });
    const batch = {
      ...emptyRecords(),
      chains: await core.listChains(),
      stores: await core.listStores(),
      items: [indomie],
      observations: await core.listObservations(indomie.id),
    };

    await transport.push(batch);
    const first = await pullAll(call, [regionId]);
    await transport.push(batch);
    const second = await pullAll(call, [regionId]);

    expect(second).toEqual(first);
    expect(first.observations).toHaveLength(1);
    expect(first.items).toHaveLength(1);
  });

  it("keeps the newer version of an edited record", async () => {
    const { call, transport } = await testServer();
    const { core, clock } = testCore();
    const { regionId } = await setUp(core);
    const [chain] = await core.listChains();
    clock.advance(60_000);
    const renamed = await core.saveChain({ ...chain, name: "Yomart Baru" });

    await transport.push({ ...emptyRecords(), chains: [renamed] });
    await transport.push({ ...emptyRecords(), chains: [chain] });

    expect((await pullAll(call, [regionId])).chains.map((c) => c.name)).toEqual(["Yomart Baru"]);
  });
});

describe("pull", () => {
  it("returns only the requested regions and only what changed after the cursor", async () => {
    const { call, transport } = await testServer();
    const { core } = testCore();
    const { regionId: garut } = await setUp(core);
    const cairo = await core.saveRegion({
      name: "Cairo",
      countryCode: "EG",
      currency: "EGP",
      locale: "ar-EG",
      staleDaysMarket: 7,
      staleDaysSupermarket: 30,
    });
    await core.saveStore({ regionId: cairo.id, chainId: null, type: "traditional_market", name: "Souk al-Attarin" });
    await core.sync(transport);

    const garutOnly = await pullAll(call, [garut]);
    expect(garutOnly.stores.map((s) => s.name).sort()).toEqual(["Pasar Guntur", "Yomart Garut Kota"]);
    expect(garutOnly.regions.map((r) => r.name)).toEqual(["Cairo"]);

    const kopi = await core.saveCommodity({ name: "Kopi bubuk", pricingUnit: "kg", categoryId: null, aliases: [] });
    await core.sync(transport);
    const since = await pullAll(call, [garut], garutOnly.cursor);
    expect(ids(since.items)).toEqual([kopi.id]);
    expect(since.stores).toEqual([]);
    expect(since.cursor).toBeGreaterThan(garutOnly.cursor);

    expect(await pullAll(call, [garut], since.cursor)).toMatchObject({ items: [], cursor: since.cursor });
  });
});

describe("barcode collision", () => {
  it("keeps the first item and maps the second device's item and prices to it", async () => {
    const { call, transport } = await testServer();
    const a = testCore().core;
    const b = testCore().core;
    const { regionId } = await setUp(a);
    const fromA = await a.saveProduct({ barcode: INDOMIE, name: "Indomie Goreng", aliases: [], categoryId: null });
    await a.sync(transport);

    const fromB = await b.saveProduct({ barcode: INDOMIE, name: "Indomie goreng 85g", aliases: [], categoryId: null });
    const pasar = await b.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Ciawitali" });
    await b.setCurrentStore(pasar.id);
    await b.recordPrice({ itemId: fromB.id, amount: 3000, qty: 1, unit: "pcs" });
    const pushed = await transport.push({ ...emptyRecords(), items: [fromB] });
    expect(pushed.mappings).toEqual({ [fromB.id]: fromA.id });

    await b.sync(transport);

    const server = await pullAll(call, [regionId]);
    expect(ids(server.items)).toEqual([fromA.id]);
    expect(server.observations.map((o) => o.itemId)).toEqual([fromA.id]);
    const lookup = await b.lookupBarcode(INDOMIE);
    expect(lookup).toMatchObject({ status: "found", item: { id: fromA.id, name: "Indomie Goreng" } });
    expect((await b.itemPrices(fromA.id)).rows).toHaveLength(1);
    expect(await b.status()).toMatchObject({ itemCount: 1, pendingSyncCount: 0 });
  });
});

describe("round trip", () => {
  it("gives a second device the same lookup result as the first", async () => {
    const { transport } = await testServer();
    const a = testCore().core;
    const b = testCore().core;
    // Both of the owner's devices are signed in as the owner.
    await a.setCurrentUser(TEST_USERS.owner);
    await b.setCurrentUser(TEST_USERS.owner);
    const { kota, guntur } = await setUp(a);
    const indomie = await a.saveProduct({ barcode: INDOMIE, name: "Indomie Goreng", aliases: ["mie"], categoryId: null });
    const cabai = await a.saveCommodity({ name: "Cabai rawit", pricingUnit: "kg", categoryId: null, aliases: ["cengek"] });
    await a.setCurrentStore(kota.id);
    await a.recordPrice({ itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs", scope: "chain" });
    await a.setCurrentStore(guntur.id);
    await a.recordPrice({ itemId: cabai.id, amount: 18000, qty: 500, unit: "g" });
    await a.setCurrentStore(null);

    expect(await a.sync(transport)).toMatchObject({ pushed: 7 });
    await b.sync(transport);

    expect(await b.lookupBarcode(INDOMIE)).toEqual(await a.lookupBarcode(INDOMIE));
    expect(await b.itemPrices(indomie.id)).toEqual(await a.itemPrices(indomie.id));
    expect(await b.itemPrices(cabai.id)).toEqual(await a.itemPrices(cabai.id));
    expect((await b.searchItems("cengek")).map((m) => m.item.id)).toEqual([cabai.id]);
  });

  it("does not let a pull overwrite a change still waiting to be pushed", async () => {
    const { transport } = await testServer();
    const a = testCore().core;
    const { core: b, clock } = testCore();
    await setUp(a);
    await a.sync(transport);
    await b.sync(transport);
    const [chain] = await b.listChains();
    clock.advance(60_000);

    await b.saveChain({ ...chain, name: "Yomart (B)" });
    const failing = { ...transport, push: () => Promise.reject(new Error("offline")) };
    await expect(b.sync(failing)).rejects.toThrow("offline");

    expect((await b.listChains()).map((c) => c.name)).toEqual(["Yomart (B)"]);
    expect((await b.status()).pendingSyncCount).toBe(1);
    await b.sync(transport);
    expect((await b.status()).pendingSyncCount).toBe(0);
    await a.sync(transport);
    expect((await a.listChains()).map((c) => c.name)).toEqual(["Yomart (B)"]);
  });
});

describe("the sync API", () => {
  it("requires a signed-in session", async () => {
    const { call, signOut } = await testServer();
    signOut();

    expect((await call("push", emptyRecords())).status).toBe(401);
    expect((await call("pull", { regionIds: [], cursor: 0 })).status).toBe(401);
  });

  it("rejects malformed requests", async () => {
    const { call } = await testServer();

    expect((await call("push", { items: [{ name: "no id" }] })).status).toBe(400);
    expect((await call("pull", { regionIds: "garut", cursor: 0 })).status).toBe(400);
  });
});

describe("unknown barcode scans", () => {
  it("reach the other devices", async () => {
    const { transport } = await testServer();
    const a = testCore().core;
    const b = testCore().core;
    await a.lookupBarcode("8992388101016");
    await a.lookupBarcode("8992388101016");

    await a.sync(transport);
    await b.sync(transport);

    expect(await b.listUnknownBarcodes()).toMatchObject([{ barcode: "8992388101016", count: 2 }]);
  });
});

describe("price corrections", () => {
  it("reach the other devices, and pushing them twice changes nothing", async () => {
    const { call, transport } = await testServer();
    const { core: a, clock } = testCore();
    const b = testCore().core;
    const { regionId, guntur } = await setUp(a);
    const cabai = await a.saveCommodity({ name: "Cabai rawit", pricingUnit: "kg", categoryId: null, aliases: [] });
    await a.setCurrentStore(guntur.id);
    await a.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
    clock.advance(60_000);
    const typo = await a.recordPrice({ itemId: cabai.id, amount: 4000, qty: 1, unit: "kg" });
    await a.sync(transport);
    await b.sync(transport);
    expect((await b.itemPrices(cabai.id)).rows[0]).toMatchObject({ price: 4000 });

    const correction = await a.removePrice(typo.id);
    await a.sync(transport);
    const before = await pullAll(call, [regionId]);
    await transport.push({ ...emptyRecords(), priceCorrections: [correction] });
    expect(await pullAll(call, [regionId])).toEqual(before);
    expect(before.observations).toHaveLength(2);

    await b.sync(transport);
    expect((await b.itemPrices(cabai.id)).rows[0]).toMatchObject({ price: 40000 });
  });
});
