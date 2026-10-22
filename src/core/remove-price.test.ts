import { describe, expect, it } from "vitest";
import type { HarganaCore } from ".";
import { CoreError } from ".";
import { testCore } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

async function setUp(core: HarganaCore) {
  const regionId = (await core.context()).activeRegion.id;
  const yomart = await core.saveChain({ regionId, name: "Yomart" });
  const kota = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Garut Kota" });
  const tarogong = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Tarogong" });
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const kecap = await core.saveProduct({ barcode: "8992388101016", name: "Kecap Bango", aliases: [], categoryId: null });
  const cabai = await core.saveCommodity({ name: "Cabai rawit", pricingUnit: "kg", categoryId: null, aliases: [] });
  return { kota, tarogong, guntur, kecap, cabai };
}

/** Each store's current price, by name. */
async function storePrices(core: HarganaCore, itemId: string) {
  const { rows } = await core.itemPrices(itemId);
  const result: Record<string, number> = {};
  for (const row of rows) for (const p of row.kind === "chain" ? row.branches : [row]) result[p.store.name] = p.price;
  return result;
}

describe("removing a price recorded by mistake", () => {
  it("falls back to the store's previous price and drops it from the 90-day low", async () => {
    const { core, clock } = testCore();
    const { guntur, cabai } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
    clock.advance(DAY);
    await core.setCurrentStore(guntur.id);
    const typo = await core.recordPrice({ itemId: cabai.id, amount: 4000, qty: 1, unit: "kg" });
    expect((await core.itemPrices(cabai.id)).lowest90Days?.price).toBe(4000);

    await core.removePrice(typo.id);

    expect(await storePrices(core, cabai.id)).toEqual({ "Pasar Guntur": 40000 });
    const prices = await core.itemPrices(cabai.id);
    expect(prices.lowest90Days?.price).toBe(40000);
    expect(prices.here).toMatchObject({ price: 40000, ageDays: 1 });
  });

  it("leaves no price when it was the only one", async () => {
    const { core } = testCore();
    const { guntur, cabai } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    const only = await core.recordPrice({ itemId: cabai.id, amount: 400000, qty: 1, unit: "kg" });

    await core.removePrice(only.id);

    expect(await core.itemPrices(cabai.id)).toMatchObject({ rows: [], here: null, cheapestElsewhere: null, lowest90Days: null });
  });

  it("also discards the 'Sama ✓' confirmations that copied it", async () => {
    const { core, clock } = testCore();
    const { kota, tarogong, kecap } = await setUp(core);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: kecap.id, amount: 11500, qty: 1, unit: "pcs", scope: "chain" });
    clock.advance(DAY);
    await core.setCurrentStore(kota.id);
    const typo = await core.recordPrice({ itemId: kecap.id, amount: 1150, qty: 1, unit: "pcs", scope: "chain" });
    clock.advance(DAY);
    await core.setCurrentStore(tarogong.id);
    await core.confirmPrice(kecap.id); // confirms the typo at Tarogong
    clock.advance(DAY);
    await core.setCurrentStore(tarogong.id);
    await core.confirmPrice(kecap.id); // and confirms that confirmation

    await core.removePrice(typo.id);

    expect(await storePrices(core, kecap.id)).toEqual({ "Yomart Garut Kota": 11500, "Yomart Tarogong": 11500 });
    expect((await core.itemPrices(kecap.id)).lowest90Days?.price).toBe(11500);
  });

  it("can take back just a confirmation", async () => {
    const { core, clock } = testCore();
    const { guntur, cabai } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
    clock.advance(10 * DAY);
    await core.setCurrentStore(guntur.id);
    const confirm = await core.confirmPrice(cabai.id);

    await core.removePrice(confirm.id);

    expect((await core.itemPrices(cabai.id)).here).toMatchObject({ price: 40000, ageDays: 10 });
  });

  it("records one correction, however often it is removed, and keeps the observation", async () => {
    const { core } = testCore();
    const { guntur, cabai } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    const typo = await core.recordPrice({ itemId: cabai.id, amount: 4000, qty: 1, unit: "kg" });
    const pending = (await core.status()).pendingSyncCount;

    const first = await core.removePrice(typo.id);
    expect(await core.removePrice(typo.id)).toEqual(first);

    expect((await core.status()).pendingSyncCount).toBe(pending + 1);
    expect(await core.listObservations(cabai.id)).toEqual([typo]);
    await expect(core.removePrice("no-such-id")).rejects.toThrow(CoreError);
  });

  it("is marked in the export rather than left out", async () => {
    const { core, clock } = testCore();
    const { guntur, cabai } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    const kept = await core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
    clock.advance(60_000);
    const typo = await core.recordPrice({ itemId: cabai.id, amount: 4000, qty: 1, unit: "kg" });
    await core.removePrice(typo.id);

    const data = await core.exportData();
    expect(data.observations.map((o) => [o.id, o.removed])).toEqual([
      [kept.id, false],
      [typo.id, true],
    ]);
    expect(data.priceCorrections).toMatchObject([{ observationId: typo.id }]);
    expect((await core.exportCsv())["observations.csv"]).toMatch(/,true,true\r\n$/);
  });
});
