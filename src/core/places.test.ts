import { describe, expect, it } from "vitest";
import { CoreError, CURRENT_STORE_TTL_MS, type HarganaCore } from ".";
import { testCore } from "./testing";

const HOUR = 60 * 60 * 1000;

async function garut(core: HarganaCore) {
  return (await core.context()).activeRegion;
}

async function addCairo(core: HarganaCore) {
  return core.saveRegion({
    name: "Cairo",
    countryCode: "eg",
    currency: "egp",
    locale: "ar-EG",
    staleDaysMarket: 7,
    staleDaysSupermarket: 30,
  });
}

async function addYomart(core: HarganaCore, regionId: string) {
  const chain = await core.saveChain({ regionId, name: "Yomart" });
  return core.saveStore({ regionId, chainId: chain.id, type: "branch", name: "Yomart Garut Kota" });
}

describe("first run", () => {
  it("has Kabupaten Garut as the active region with default staleness thresholds", async () => {
    const { core } = testCore();

    const { activeRegion, currentStore } = await core.context();

    expect(activeRegion).toMatchObject({
      name: "Kabupaten Garut",
      currency: "IDR",
      locale: "id-ID",
      staleDaysMarket: 7,
      staleDaysSupermarket: 30,
    });
    expect(currentStore).toBeNull();
  });

  it("has the default categories in order", async () => {
    const { core } = testCore();

    const names = (await core.listCategories()).map((c) => c.name);

    expect(names.slice(0, 6)).toEqual(["Beras", "Telur", "Sayur", "Buah", "Bumbu", "Minyak"]);
  });
});

describe("managing places", () => {
  it("creates and edits regions, normalizing codes", async () => {
    const { core } = testCore();

    const cairo = await addCairo(core);
    await core.saveRegion({ ...cairo, staleDaysMarket: 3 });

    expect(await core.getRegion(cairo.id)).toMatchObject({ currency: "EGP", countryCode: "EG", staleDaysMarket: 3 });
    expect((await core.listRegions()).map((r) => r.name)).toEqual(["Cairo", "Kabupaten Garut"]);
  });

  it("rejects a staleness threshold below one day", async () => {
    const { core } = testCore();
    const region = await garut(core);

    await expect(core.saveRegion({ ...region, staleDaysMarket: 0 })).rejects.toThrow(CoreError);
  });

  it("creates branches with a chain and markets without one", async () => {
    const { core } = testCore();
    const region = await garut(core);

    const branch = await addYomart(core, region.id);
    const market = await core.saveStore({
      regionId: region.id,
      chainId: null,
      type: "traditional_market",
      name: "Pasar Guntur Ciawitali",
    });

    expect((await core.listStores(region.id)).map((s) => s.id)).toEqual([market.id, branch.id]);
  });

  it("edits a store", async () => {
    const { core } = testCore();
    const branch = await addYomart(core, (await garut(core)).id);

    await core.saveStore({ ...branch, name: "Yomart Tarogong" });

    expect((await core.getStore(branch.id)).name).toBe("Yomart Tarogong");
  });

  it("refuses a branch without a chain, a market with one, and a chain from another region", async () => {
    const { core } = testCore();
    const region = await garut(core);
    const cairo = await addCairo(core);
    const chain = await core.saveChain({ regionId: region.id, name: "Yomart" });

    await expect(
      core.saveStore({ regionId: region.id, chainId: null, type: "branch", name: "X" }),
    ).rejects.toMatchObject({ code: "branch_needs_chain" });
    await expect(
      core.saveStore({ regionId: region.id, chainId: chain.id, type: "traditional_market", name: "X" }),
    ).rejects.toMatchObject({ code: "market_has_no_chain" });
    await expect(
      core.saveStore({ regionId: cairo.id, chainId: chain.id, type: "branch", name: "X" }),
    ).rejects.toMatchObject({ code: "chain_in_other_region" });
  });

  it("adds and renames categories", async () => {
    const { core } = testCore();

    const category = await core.saveCategory({ name: "Bayi", sortOrder: 5 });
    await core.saveCategory({ ...category, name: "Perlengkapan Bayi" });

    expect((await core.listCategories())[0].name).toBe("Perlengkapan Bayi");
  });
});

describe("store search", () => {
  it("matches store and chain names, ignoring case", async () => {
    const { core } = testCore();
    const region = await garut(core);
    await addYomart(core, region.id);
    await core.saveStore({ regionId: region.id, chainId: null, type: "traditional_market", name: "Pasar Guntur" });

    expect((await core.searchStores("yomart")).map((m) => m.store.name)).toEqual(["Yomart Garut Kota"]);
    expect((await core.searchStores("PASAR")).map((m) => m.store.name)).toEqual(["Pasar Guntur"]);
    expect(await core.searchStores("")).toHaveLength(2);
  });

  it("puts nearby stores first, closest first", async () => {
    const { core } = testCore();
    const regionId = (await garut(core)).id;
    const store = (name: string, lat?: number, lng?: number) =>
      core.saveStore({ regionId, chainId: null, type: "traditional_market", name, lat, lng });
    await store("A far market", -7.0, 107.5);
    await store("B near market", -7.215, 107.9);
    await store("C nearest market", -7.2125, 107.9);
    await store("D no location");

    const results = await core.searchStores("", { lat: -7.212, lng: 107.9 });

    expect(results.map((m) => [m.store.name, m.nearby])).toEqual([
      ["C nearest market", true],
      ["B near market", true],
      ["A far market", false],
      ["D no location", false],
    ]);
  });
});

describe("current store", () => {
  it("persists across app restarts", async () => {
    const { core, restart } = testCore();
    const branch = await addYomart(core, (await garut(core)).id);

    await core.setCurrentStore(branch.id);

    expect((await restart().context()).currentStore?.id).toBe(branch.id);
  });

  it("clears after 4 hours of inactivity", async () => {
    const { core, clock } = testCore();
    const branch = await addYomart(core, (await garut(core)).id);
    await core.setCurrentStore(branch.id);

    clock.advance(CURRENT_STORE_TTL_MS + 1);

    expect((await core.context()).currentStore).toBeNull();
  });

  it("stays while the app keeps being used", async () => {
    const { core, clock } = testCore();
    const branch = await addYomart(core, (await garut(core)).id);
    await core.setCurrentStore(branch.id);

    for (let i = 0; i < 3; i++) {
      clock.advance(3 * HOUR);
      await core.context();
    }

    expect((await core.context()).currentStore?.id).toBe(branch.id);
  });

  it("can be cleared by hand, keeping the active region", async () => {
    const { core } = testCore();
    const cairo = await addCairo(core);
    const market = await core.saveStore({ regionId: cairo.id, chainId: null, type: "traditional_market", name: "Souq" });
    await core.setCurrentStore(market.id);

    await core.setCurrentStore(null);

    expect(await core.context()).toMatchObject({ currentStore: null, activeRegion: { id: cairo.id } });
  });
});

describe("active region", () => {
  it("follows the current store into another region", async () => {
    const { core } = testCore();
    const cairo = await addCairo(core);
    const market = await core.saveStore({ regionId: cairo.id, chainId: null, type: "traditional_market", name: "Souq" });

    await core.setCurrentStore(market.id);

    expect((await core.context()).activeRegion.id).toBe(cairo.id);
  });

  it("keeps the last active region after the current store expires", async () => {
    const { core, clock } = testCore();
    const cairo = await addCairo(core);
    const market = await core.saveStore({ regionId: cairo.id, chainId: null, type: "traditional_market", name: "Souq" });
    await core.setCurrentStore(market.id);

    clock.advance(CURRENT_STORE_TTL_MS + 1);

    expect(await core.context()).toMatchObject({ currentStore: null, activeRegion: { id: cairo.id } });
  });

  it("switches by hand, clearing a current store in the old region", async () => {
    const { core } = testCore();
    const region = await garut(core);
    const cairo = await addCairo(core);
    const branch = await addYomart(core, region.id);
    await core.setCurrentStore(branch.id);

    await core.setActiveRegion(cairo.id);

    expect(await core.context()).toMatchObject({ currentStore: null, activeRegion: { id: cairo.id } });
  });
});
