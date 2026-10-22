import { describe, expect, it } from "vitest";
import type { HarganaCore } from ".";
import { testCore } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

async function setUp(core: HarganaCore) {
  const regionId = (await core.context()).activeRegion.id;
  const yomart = await core.saveChain({ regionId, name: "Yomart" });
  const kota = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Garut Kota" });
  const tarogong = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Tarogong" });
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const kecap = await core.saveProduct({ barcode: "8992388101016", name: "Kecap Bango", aliases: [], categoryId: null });
  return { regionId, yomart, kota, tarogong, guntur, kecap };
}

describe("price history", () => {
  it("lists every recorded price newest first, with one chart line per store or chain", async () => {
    const { core, clock } = testCore();
    const { yomart, kota, tarogong, guntur, kecap } = await setUp(core);
    const at = async (storeId: string, entry: Omit<Parameters<HarganaCore["recordPrice"]>[0], "itemId">) => {
      await core.setCurrentStore(storeId);
      const o = await core.recordPrice({ itemId: kecap.id, ...entry });
      clock.advance(DAY);
      return o;
    };
    const chainWide = await at(kota.id, { amount: 11500, qty: 1, unit: "pcs", scope: "chain" });
    const branch = await at(tarogong.id, { amount: 12000, qty: 1, unit: "pcs" });
    const market = await at(guntur.id, { amount: 11000, qty: 1, unit: "pcs" });
    await core.setCurrentStore(tarogong.id);
    const confirmed = await core.confirmPrice(kecap.id);

    const history = await core.priceHistory(kecap.id);

    expect(history.entries.map((e) => [e.observation.id, e.line])).toEqual([
      [confirmed.id, `store:${tarogong.id}`],
      [market.id, `store:${guntur.id}`],
      [branch.id, `store:${tarogong.id}`],
      [chainWide.id, `chain:${yomart.id}`],
    ]);
    expect(history.entries.at(-1)).toMatchObject({ chain: { name: "Yomart" }, store: { name: "Yomart Garut Kota" } });
    expect(history.lines.map((l) => [l.name, l.points.map((p) => p.paid)])).toEqual([
      ["Pasar Guntur", [11000]],
      ["Yomart", [11500]],
      ["Yomart Tarogong", [12000, 12000]],
    ]);
    expect(history.lines.map((l) => l.order)).toEqual([0, 1, 2]);
    expect(history.lowest90Days).toBe(11000);
    expect(history.stores.map((s) => s.name)).toEqual(["Pasar Guntur", "Yomart Garut Kota", "Yomart Tarogong"]);
  });

  it("filters to one store, keeping its chain's chain-wide prices and each line's place", async () => {
    const { core, clock } = testCore();
    const { kota, tarogong, guntur, kecap } = await setUp(core);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: kecap.id, amount: 11500, qty: 1, unit: "pcs", scope: "chain" });
    clock.advance(DAY);
    await core.setCurrentStore(tarogong.id);
    await core.recordPrice({ itemId: kecap.id, amount: 12000, qty: 1, unit: "pcs" });
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: kecap.id, amount: 9000, qty: 1, unit: "pcs" });

    const history = await core.priceHistory(kecap.id, { storeId: tarogong.id });

    expect(history.entries.map((e) => e.paid)).toEqual([12000, 11500]);
    expect(history.lines.map((l) => [l.name, l.order])).toEqual([
      ["Yomart", 1],
      ["Yomart Tarogong", 2],
    ]);
    expect(history.lowest90Days).toBe(11500);
    expect(history.stores).toHaveLength(3);
  });

  it("plots what was paid: the promo price while it ran, and the low end of a range", async () => {
    const { core } = testCore();
    const { kota, guntur, kecap } = await setUp(core);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: kecap.id, amount: 12000, qty: 1, unit: "pcs", promoAmount: 9900, promoUntil: "2026-01-07" });
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: kecap.id, amount: 10000, amountMax: 11000, qty: 1, unit: "pcs" });

    const { entries } = await core.priceHistory(kecap.id);
    expect(entries.map((e) => e.paid).sort()).toEqual([10000, 9900]);
  });

  it("leaves out removed prices and other regions, and counts only 90 days for the low", async () => {
    const { core, clock } = testCore();
    const { guntur, kecap } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: kecap.id, amount: 8000, qty: 1, unit: "pcs" });
    clock.advance(100 * DAY);
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: kecap.id, amount: 11000, qty: 1, unit: "pcs" });
    clock.advance(DAY);
    await core.setCurrentStore(guntur.id);
    const typo = await core.recordPrice({ itemId: kecap.id, amount: 1100, qty: 1, unit: "pcs" });
    await core.removePrice(typo.id);

    const history = await core.priceHistory(kecap.id);
    expect(history.entries.map((e) => e.paid)).toEqual([11000, 8000]);
    expect(history.lowest90Days).toBe(11000);

    const cairo = await core.saveRegion({ name: "Cairo", countryCode: "EG", currency: "EGP", locale: "ar-EG", staleDaysMarket: 7, staleDaysSupermarket: 30 });
    await core.setActiveRegion(cairo.id);
    expect(await core.priceHistory(kecap.id)).toMatchObject({ entries: [], lines: [], lowest90Days: null, stores: [], asOf: clock.now().toISOString() });
  });
});
