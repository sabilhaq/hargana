import { describe, expect, it } from "vitest";
import type { HarganaCore } from ".";
import { testCore } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

/** Two Yomart branches and a market, three items, and some prices. */
async function setUp(core: HarganaCore, clock: { advance(ms: number): void }) {
  const regionId = (await core.context()).activeRegion.id;
  const yomart = await core.saveChain({ regionId, name: "Yomart" });
  const kota = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Garut Kota" });
  const tarogong = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Tarogong" });
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const indomie = await core.saveProduct({ barcode: "089686010947", name: "Indomie Goreng", aliases: [], categoryId: null });
  const cabai = await core.saveCommodity({ name: "Cabai rawit", pricingUnit: "kg", categoryId: null, aliases: [] });
  const beras = await core.saveCommodity({ name: "Beras", pricingUnit: "kg", categoryId: null, aliases: [] });
  const at = async (storeId: string, entry: Omit<Parameters<HarganaCore["recordPrice"]>[0], "itemId"> & { itemId: string }) => {
    await core.setCurrentStore(storeId);
    await core.recordPrice(entry);
    clock.advance(60_000);
  };
  await at(kota.id, { itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs", scope: "chain" }); // every Yomart
  await at(tarogong.id, { itemId: indomie.id, amount: 3200, qty: 1, unit: "pcs" }); // this branch cheaper
  await at(kota.id, { itemId: beras.id, amount: 14000, qty: 1, unit: "kg" });
  await at(guntur.id, { itemId: cabai.id, amount: 18000, qty: 500, unit: "g" }); // Rp 36.000/kg
  await at(guntur.id, { itemId: beras.id, amount: 12000, amountMax: 13000, qty: 1, unit: "kg" });
  await core.setCurrentStore(null);
  return { kota, tarogong, guntur, indomie, cabai, beras };
}

const totals = (plan: Awaited<ReturnType<HarganaCore["planShopping"]>>) =>
  plan.stores.map((s) => [s.store.name, s.costs.length, s.total, s.missing.map((m) => m.name)]);

describe("the shopping list", () => {
  it("adds items once, sums quantities, ticks, re-quantifies and clears", async () => {
    const { core, clock } = testCore();
    const { indomie, cabai } = await setUp(core, clock);

    await core.addToList(indomie.id, 3);
    const cabaiId = await core.addToList(cabai.id, 0.5);
    await core.addToList(indomie.id, 2);
    await core.setListQty(cabaiId, 0.25);
    await core.tickListEntry(cabaiId, true);

    expect((await core.listShopping()).map((e) => [e.item.name, e.qty, e.unit, e.checked])).toEqual([
      ["Indomie Goreng", 5, "pcs", false],
      ["Cabai rawit", 0.25, "kg", true],
    ]);
    await core.clearTicked();
    expect((await core.listShopping()).map((e) => e.item.name)).toEqual(["Indomie Goreng"]);
    await expect(core.setListQty(cabaiId, 1)).rejects.toThrow();
    await expect(core.addToList(indomie.id, 0)).rejects.toThrow();
  });

  it("prices the list at every store, most items covered first, naming what is missing", async () => {
    const { core, clock } = testCore();
    const { indomie, cabai, beras } = await setUp(core, clock);
    await core.addToList(indomie.id, 4);
    await core.addToList(cabai.id, 0.5);
    await core.addToList(beras.id, 5);

    const plan = await core.planShopping();

    expect(plan.count).toBe(3);
    expect(totals(plan)).toEqual([
      ["Pasar Guntur", 2, 18000 + 60000, ["Indomie Goreng"]], // cabai 0.5 kg × 36.000 + beras 5 × 12.000 (range low end)
      ["Yomart Garut Kota", 2, 14000 + 70000, ["Cabai rawit"]], // Indomie at the chain price 3.500 + beras 5 × 14.000
      ["Yomart Tarogong", 1, 12800, ["Cabai rawit", "Beras"]], // Indomie at its own 3.200
    ]);
  });

  it("splits the list across the cheapest stores and says what that saves", async () => {
    const { core, clock } = testCore();
    const { indomie, cabai, beras } = await setUp(core, clock);
    await core.addToList(indomie.id, 4);
    await core.addToList(cabai.id, 0.5);
    await core.addToList(beras.id, 5);
    const lonely = await core.saveCommodity({ name: "Kemiri", pricingUnit: "ons", categoryId: null, aliases: [] });
    await core.addToList(lonely.id, 1);

    const { split, unpriced, stores } = await core.planShopping();

    expect(split.stores.map((s) => [s.store.name, s.costs.map((c) => c.item.name), s.total])).toEqual([
      ["Yomart Tarogong", ["Indomie Goreng"], 12800],
      ["Pasar Guntur", ["Cabai rawit", "Beras"], 78000],
    ]);
    expect(split.total).toBe(90800);
    expect(unpriced.map((i) => i.name)).toEqual(["Kemiri"]);
    // The best single store (Pasar Guntur) is already cheapest for what it has: nothing to save there.
    expect(stores[0].store.name).toBe("Pasar Guntur");
    expect(split.saving).toBe(0);
  });

  it("counts a promo only until its last day, ignores removed prices and ticked items", async () => {
    const { core, clock } = testCore();
    const { kota, indomie, beras } = await setUp(core, clock);
    await core.setCurrentStore(kota.id);
    const promo = await core.recordPrice({ itemId: beras.id, amount: 14000, qty: 1, unit: "kg", promoAmount: 11000, promoUntil: "2026-01-02" });
    const typo = await core.recordPrice({ itemId: indomie.id, amount: 350, qty: 1, unit: "pcs" });
    await core.removePrice(typo.id);
    await core.addToList(beras.id, 1);
    const ticked = await core.addToList(indomie.id, 1);
    await core.tickListEntry(ticked, true);

    const cost = async () => (await core.planShopping()).stores.find((s) => s.store.id === kota.id)!.costs.map((c) => [c.item.name, c.cost]);

    expect(promo.promoPrice).toBe(11000);
    expect(await cost()).toEqual([["Beras", 11000]]);
    clock.advance(3 * DAY); // past the promo's last day
    expect(await cost()).toEqual([["Beras", 14000]]);
  });

  it("marks prices past the region's threshold as stale and is empty without a list", async () => {
    const { core, clock } = testCore();
    const { cabai } = await setUp(core, clock);
    expect(await core.planShopping()).toMatchObject({ count: 0, stores: [], unpriced: [], split: { total: 0, saving: 0 } });

    await core.addToList(cabai.id, 1);
    clock.advance(8 * DAY);
    expect((await core.planShopping()).stores[0].costs[0]).toMatchObject({ cost: 36000, stale: true });
  });
});
