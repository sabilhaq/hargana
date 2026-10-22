import { describe, expect, it } from "vitest";
import type { HarganaCore } from ".";
import { testCore } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

async function setUp(core: HarganaCore) {
  const regionId = (await core.context()).activeRegion.id; // Garut: markets stale after 7 days, supermarkets after 30
  const yomart = await core.saveChain({ regionId, name: "Yomart" });
  const kota = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Garut Kota" });
  const tarogong = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Tarogong" });
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const product = (name: string, barcode: string) => core.saveProduct({ barcode, name, aliases: [], categoryId: null });
  const commodity = (name: string) => core.saveCommodity({ name, pricingUnit: "kg", categoryId: null, aliases: [] });
  return { regionId, kota, tarogong, guntur, product, commodity };
}

const names = async (core: HarganaCore) => (await core.stalePricesHere()).prices.map((p) => p.item.name);

describe("stale prices at the current store", () => {
  it("lists items whose price here is past the supermarket threshold, most stale first", async () => {
    const { core, clock } = testCore();
    const { kota, product } = await setUp(core);
    const kecap = await product("Kecap Bango", "8992388101016");
    const indomie = await product("Indomie Goreng", "089686010947");
    const susu = await product("Susu UHT", "8993007000963");
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs" });
    clock.advance(5 * DAY);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: kecap.id, amount: 11500, qty: 1, unit: "pcs" });
    clock.advance(20 * DAY);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: susu.id, amount: 6000, qty: 1, unit: "pcs" });

    clock.advance(10 * DAY); // indomie 35 days, kecap 30 (not past 30), susu 10
    await core.setCurrentStore(kota.id);
    expect(await names(core)).toEqual(["Indomie Goreng"]);

    clock.advance(DAY);
    await core.setCurrentStore(kota.id);
    const { prices, total } = await core.stalePricesHere();
    expect(prices.map((p) => [p.item.name, p.ageDays, p.price])).toEqual([
      ["Indomie Goreng", 36, 3500],
      ["Kecap Bango", 31, 11500],
    ]);
    expect(total).toBe(2);
  });

  it("uses the market threshold at a market, and counts a chain price at a branch", async () => {
    const { core, clock } = testCore();
    const { kota, tarogong, guntur, product, commodity } = await setUp(core);
    const cabai = await commodity("Cabai rawit");
    const kecap = await product("Kecap Bango", "8992388101016");
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: kecap.id, amount: 11500, qty: 1, unit: "pcs", scope: "chain" });

    clock.advance(8 * DAY);
    await core.setCurrentStore(guntur.id);
    expect(await names(core)).toEqual(["Cabai rawit"]);
    await core.setCurrentStore(tarogong.id);
    expect(await names(core)).toEqual([]);

    clock.advance(25 * DAY);
    await core.setCurrentStore(tarogong.id);
    expect((await core.stalePricesHere()).prices).toMatchObject([{ item: { name: "Kecap Bango" }, fromChain: true, ageDays: 33 }]);
  });

  it("drops an item once its price is confirmed or changed here", async () => {
    const { core, clock } = testCore();
    const { guntur, commodity } = await setUp(core);
    const cabai = await commodity("Cabai rawit");
    const bawang = await commodity("Bawang merah");
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
    await core.recordPrice({ itemId: bawang.id, amount: 30000, qty: 1, unit: "kg" });
    clock.advance(10 * DAY);
    await core.setCurrentStore(guntur.id);
    expect(await names(core)).toHaveLength(2);

    await core.confirmPrice(cabai.id);
    await core.recordPrice({ itemId: bawang.id, amount: 32000, qty: 1, unit: "kg" });

    expect(await names(core)).toEqual([]);
  });

  it("keeps a dismissed item hidden for this visit only", async () => {
    const { core, clock } = testCore();
    const { kota, guntur, commodity } = await setUp(core);
    const cabai = await commodity("Cabai rawit");
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
    clock.advance(10 * DAY);
    await core.setCurrentStore(guntur.id);

    await core.dismissStale(cabai.id);
    expect(await names(core)).toEqual([]);
    clock.advance(60 * 60 * 1000);
    expect(await names(core)).toEqual([]); // still the same visit

    await core.setCurrentStore(kota.id);
    await core.setCurrentStore(guntur.id); // a new visit
    expect(await names(core)).toEqual(["Cabai rawit"]);

    await core.dismissStale(cabai.id);
    clock.advance(5 * 60 * 60 * 1000); // the current store resets after 4 hours idle
    expect(await names(core)).toEqual([]);
    await core.setCurrentStore(guntur.id);
    expect(await names(core)).toEqual(["Cabai rawit"]);
  });

  it("is empty without a current store, and caps the list", async () => {
    const { core, clock } = testCore();
    const { guntur, commodity } = await setUp(core);
    expect(await core.stalePricesHere()).toEqual({ prices: [], total: 0, region: null });

    await core.setCurrentStore(guntur.id);
    for (let i = 0; i < 4; i++) {
      const item = await commodity(`Sayur ${i}`);
      await core.recordPrice({ itemId: item.id, amount: 10000, qty: 1, unit: "kg" });
    }
    clock.advance(10 * DAY);
    await core.setCurrentStore(guntur.id);
    const { prices, total } = await core.stalePricesHere({ limit: 3 });
    expect([prices.length, total]).toEqual([3, 4]);
  });
});
