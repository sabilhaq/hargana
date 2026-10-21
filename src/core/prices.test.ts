import { describe, expect, it } from "vitest";
import { compatibleUnits, currencyDigits, type HarganaCore, type PricingUnit } from ".";
import { testCore } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

async function setUp(core: HarganaCore) {
  const regionId = (await core.context()).activeRegion.id;
  const market = (name: string) => core.saveStore({ regionId, chainId: null, type: "traditional_market", name });
  const guntur = await market("Pasar Guntur");
  const ciawitali = await market("Pasar Ciawitali");
  const chain = await core.saveChain({ regionId, name: "Yomart" });
  const yomart = await core.saveStore({ regionId, chainId: chain.id, type: "branch", name: "Yomart Garut Kota" });
  const commodity = (name: string, pricingUnit: PricingUnit) =>
    core.saveCommodity({ name, pricingUnit, categoryId: null, aliases: [] });
  return {
    regionId,
    guntur,
    ciawitali,
    yomart,
    bawang: await commodity("Bawang merah", "kg"),
    kangkung: await commodity("Kangkung", "ikat"),
  };
}

describe("recording a price", () => {
  it("stores Rp 18.000 for 500 g as Rp 36.000/kg and keeps the original input", async () => {
    const { core } = testCore();
    const { guntur, bawang } = await setUp(core);
    await core.setCurrentStore(guntur.id);

    const observation = await core.recordPrice({ itemId: bawang.id, amount: 18000, qty: 500, unit: "g" });

    expect(observation).toMatchObject({
      price: 36000,
      enteredAmount: 18000,
      enteredQty: 500,
      enteredUnit: "g",
      scope: "market",
      storeId: guntur.id,
      action: "new",
      source: "collector",
      verified: true,
    });
    expect(Number.isInteger(observation.price)).toBe(true);
  });

  it("normalizes bundle units and fractional quantities", async () => {
    const { core } = testCore();
    const { guntur, bawang, kangkung } = await setUp(core);
    await core.setCurrentStore(guntur.id);

    expect((await core.recordPrice({ itemId: kangkung.id, amount: 10000, qty: 3, unit: "ikat" })).price).toBe(3333);
    expect((await core.recordPrice({ itemId: bawang.id, amount: 5000, qty: 2, unit: "ons" })).price).toBe(25000);
    expect((await core.recordPrice({ itemId: bawang.id, amount: 17500, qty: 0.5, unit: "kg" })).price).toBe(35000);
  });

  it("refuses a unit that cannot convert to the pricing unit", async () => {
    const { core } = testCore();
    const { guntur, kangkung } = await setUp(core);
    await core.setCurrentStore(guntur.id);

    await expect(core.recordPrice({ itemId: kangkung.id, amount: 5000, qty: 1, unit: "kg" })).rejects.toMatchObject({
      code: "incompatible_unit",
    });
    expect(compatibleUnits("kg")).toEqual(["g", "ons", "kg"]);
  });

  it("needs a current store", async () => {
    const { core } = testCore();
    const { bawang } = await setUp(core);

    await expect(core.recordPrice({ itemId: bawang.id, amount: 30000, qty: 1, unit: "kg" })).rejects.toMatchObject({
      code: "no_current_store",
    });
  });

  it("refuses money that is not a positive whole number of minor units", async () => {
    const { core } = testCore();
    const { guntur, bawang } = await setUp(core);
    await core.setCurrentStore(guntur.id);

    await expect(core.recordPrice({ itemId: bawang.id, amount: 300.5, qty: 1, unit: "kg" })).rejects.toMatchObject({
      code: "invalid",
    });
    expect(currencyDigits("IDR")).toBe(0);
    expect(currencyDigits("EGP")).toBe(2);
  });

  it("never edits an observation: recording again adds a new one", async () => {
    const { core, clock } = testCore();
    const { guntur, bawang } = await setUp(core);
    await core.setCurrentStore(guntur.id);

    const first = await core.recordPrice({ itemId: bawang.id, amount: 30000, qty: 1, unit: "kg" });
    clock.advance(60_000);
    const second = await core.recordPrice({ itemId: bawang.id, amount: 32000, qty: 1, unit: "kg" });

    const observations = await core.listObservations(bawang.id);
    expect(observations.map((o) => o.id)).toEqual([second.id, first.id]);
    expect(observations[1]).toEqual(first);
    expect(second.action).toBe("change");
    expect((await core.itemPrices(bawang.id)).prices.map((p) => p.price)).toEqual([32000]);
  });
});

describe("market ranges", () => {
  it("keeps the range and sorts by its low end", async () => {
    const { core, clock } = testCore();
    const { guntur, ciawitali, bawang } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: bawang.id, amount: 28000, amountMax: 40000, qty: 1, unit: "kg", note: "tergantung kios" });
    clock.advance(60_000);
    await core.setCurrentStore(ciawitali.id);
    await core.recordPrice({ itemId: bawang.id, amount: 30000, qty: 1, unit: "kg" });

    const { prices } = await core.itemPrices(bawang.id);

    expect(prices.map((p) => [p.store.name, p.price, p.priceMax, p.note])).toEqual([
      ["Pasar Guntur", 28000, 40000, "tergantung kios"],
      ["Pasar Ciawitali", 30000, null, null],
    ]);
  });

  it("refuses a range whose top is below its bottom", async () => {
    const { core } = testCore();
    const { guntur, bawang } = await setUp(core);
    await core.setCurrentStore(guntur.id);

    await expect(
      core.recordPrice({ itemId: bawang.id, amount: 30000, amountMax: 20000, qty: 1, unit: "kg" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("prices on the result screen", () => {
  it("marks prices stale past the region's threshold for the store type", async () => {
    const { core, clock } = testCore();
    const { guntur, yomart, bawang } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: bawang.id, amount: 30000, qty: 1, unit: "kg" });
    await core.setCurrentStore(yomart.id);
    await core.recordPrice({ itemId: bawang.id, amount: 35000, qty: 1, unit: "kg" });

    clock.advance(8 * DAY);
    const afterAWeek = await core.itemPrices(bawang.id);
    expect(afterAWeek.prices.map((p) => [p.store.name, p.ageDays, p.stale])).toEqual([
      ["Pasar Guntur", 8, true], // markets: 7 days
      ["Yomart Garut Kota", 8, false], // supermarkets: 30 days
    ]);

    clock.advance(23 * DAY);
    expect((await core.itemPrices(bawang.id)).prices.every((p) => p.stale)).toBe(true);
  });

  it("uses the region's own thresholds", async () => {
    const { core, clock } = testCore();
    const { regionId, guntur, bawang } = await setUp(core);
    await core.saveRegion({ ...(await core.getRegion(regionId)), staleDaysMarket: 2 });
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: bawang.id, amount: 30000, qty: 1, unit: "kg" });

    clock.advance(3 * DAY);

    expect((await core.itemPrices(bawang.id)).prices[0].stale).toBe(true);
  });

  it("shows only prices from the active region", async () => {
    const { core } = testCore();
    const { guntur, bawang } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: bawang.id, amount: 30000, qty: 1, unit: "kg" });
    const cairo = await core.saveRegion({
      name: "Cairo",
      countryCode: "EG",
      currency: "EGP",
      locale: "ar-EG",
      staleDaysMarket: 7,
      staleDaysSupermarket: 30,
    });

    await core.setActiveRegion(cairo.id);

    expect(await core.itemPrices(bawang.id)).toMatchObject({ region: { id: cairo.id }, prices: [] });
  });

  it("prices products per item", async () => {
    const { core } = testCore();
    const { yomart } = await setUp(core);
    const indomie = await core.saveProduct({ barcode: "089686010947", name: "Indomie", aliases: [], categoryId: null });
    await core.setCurrentStore(yomart.id);

    await core.recordPrice({ itemId: indomie.id, amount: 10000, qty: 3, unit: "pcs" });

    expect(await core.itemPrices(indomie.id)).toMatchObject({ unit: "pcs", prices: [{ price: 3333, priceMax: null }] });
  });
});
