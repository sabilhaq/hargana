import { describe, expect, it } from "vitest";
import type { BrowseResult, HarganaCore } from ".";
import { testCore } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

async function setUp(core: HarganaCore, clock: { advance(ms: number): void }) {
  const regionId = (await core.context()).activeRegion.id;
  const [beras, bumbu] = (await core.listCategories()).filter((c) => ["Beras", "Bumbu"].includes(c.name));
  const yomart = await core.saveChain({ regionId, name: "Yomart" });
  const kota = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Garut Kota" });
  const tarogong = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Tarogong" });
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const item = (name: string, categoryId: string | null) => core.saveCommodity({ name, pricingUnit: "kg", categoryId, aliases: [] });
  const pandan = await item("Beras pandan wangi", beras.id);
  const ir64 = await item("Beras IR64", beras.id);
  const cabai = await item("Cabai rawit", bumbu.id);
  const gula = await item("Gula aren", null);
  await item("Kemiri", bumbu.id); // never priced
  const at = async (storeId: string, itemId: string, amount: number, scope?: "chain") => {
    await core.setCurrentStore(storeId);
    const o = await core.recordPrice({ itemId, amount, qty: 1, unit: "kg", ...(scope && { scope }) });
    clock.advance(DAY);
    return o;
  };
  await at(kota.id, pandan.id, 16000, "chain"); // every Yomart
  await at(kota.id, ir64.id, 13000);
  await at(guntur.id, ir64.id, 12000);
  await at(guntur.id, cabai.id, 36000);
  await at(guntur.id, gula.id, 30000);
  await core.setCurrentStore(null);
  return { kota, tarogong, guntur, pandan, ir64, cabai, gula };
}

const rows = (result: BrowseResult) =>
  result.groups.map((g) => [g.category?.name ?? null, g.entries.map((e) => [e.item.name, e.price, e.store.name])]);

describe("browsing a store", () => {
  it("lists exactly what has a price there, at that price, grouped by category", async () => {
    const { core, clock } = testCore();
    const { tarogong, guntur } = await setUp(core, clock);

    expect(rows(await core.browse({ storeId: tarogong.id }))).toEqual([
      ["Beras", [["Beras pandan wangi", 16000, "Yomart Tarogong"]]], // the chain price applies here
    ]);
    expect(rows(await core.browse({ storeId: guntur.id }))).toEqual([
      ["Beras", [["Beras IR64", 12000, "Pasar Guntur"]]],
      ["Bumbu", [["Cabai rawit", 36000, "Pasar Guntur"]]],
      [null, [["Gula aren", 30000, "Pasar Guntur"]]],
    ]);
  });

  it("shows each item once at its cheapest store across all stores", async () => {
    const { core, clock } = testCore();
    await setUp(core, clock);

    const all = await core.browse();

    expect(all.store).toBeNull();
    expect(all.count).toBe(4);
    expect(rows(all)).toEqual([
      ["Beras", [["Beras IR64", 12000, "Pasar Guntur"], ["Beras pandan wangi", 16000, "Yomart Garut Kota"]]],
      ["Bumbu", [["Cabai rawit", 36000, "Pasar Guntur"]]],
      [null, [["Gula aren", 30000, "Pasar Guntur"]]],
    ]);
    expect(all.stores.map((s) => s.name)).toEqual(["Pasar Guntur", "Yomart Garut Kota", "Yomart Tarogong"]);
  });

  it("sorts within each category by name, price or last checked", async () => {
    const { core, clock } = testCore();
    const { kota, pandan } = await setUp(core, clock);
    await core.setCurrentStore(kota.id);
    // Checked last, and the dearest: each sort puts the three in a different order.
    const merah = await core.saveCommodity({ name: "Beras merah", pricingUnit: "kg", categoryId: pandan.categoryId, aliases: [] });
    await core.recordPrice({ itemId: merah.id, amount: 22000, qty: 1, unit: "kg" });

    const names = async (sort: "name" | "price" | "recent") => (await core.browse({ storeId: kota.id, sort })).groups[0].entries.map((e) => e.item.name);

    expect(await names("name")).toEqual(["Beras IR64", "Beras merah", "Beras pandan wangi"]);
    expect(await names("price")).toEqual(["Beras IR64", "Beras pandan wangi", "Beras merah"]); // 13.000, 16.000, 22.000
    expect(await names("recent")).toEqual(["Beras merah", "Beras IR64", "Beras pandan wangi"]);
  });

  it("leaves out removed prices and other regions, and marks stale ones", async () => {
    const { core, clock } = testCore();
    const { guntur, gula } = await setUp(core, clock);
    await core.setCurrentStore(guntur.id);
    const typo = await core.recordPrice({ itemId: gula.id, amount: 3000, qty: 1, unit: "kg" });
    await core.removePrice(typo.id);
    clock.advance(10 * DAY);

    const market = await core.browse({ storeId: guntur.id });
    expect(market.groups.at(-1)!.entries[0]).toMatchObject({ price: 30000, stale: true });

    const cairo = await core.saveRegion({ name: "Cairo", countryCode: "EG", currency: "EGP", locale: "ar-EG", staleDaysMarket: 7, staleDaysSupermarket: 30 });
    await core.setActiveRegion(cairo.id);
    expect(await core.browse()).toMatchObject({ count: 0, groups: [], stores: [] });
  });
});
