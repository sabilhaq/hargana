import { describe, expect, it } from "vitest";
import type { HarganaCore } from ".";
import { testCore } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

// The fake clock starts 2026-01-01 08:00 +07:00. Tests run in any time zone,
// so promo dates are compared against the device's own calendar day.
function dayAfter(start: Date, days: number) {
  const d = new Date(start.getTime() + days * DAY);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function setUp(core: HarganaCore) {
  const regionId = (await core.context()).activeRegion.id;
  const market = (name: string) => core.saveStore({ regionId, chainId: null, type: "traditional_market", name });
  const guntur = await market("Pasar Guntur");
  const ciawitali = await market("Pasar Ciawitali");
  const chain = await core.saveChain({ regionId, name: "Yomart" });
  const branch = (name: string) => core.saveStore({ regionId, chainId: chain.id, type: "branch", name });
  const kota = await branch("Yomart Garut Kota");
  const tarogong = await branch("Yomart Tarogong");
  const bawang = await core.saveCommodity({ name: "Bawang merah", pricingUnit: "kg", categoryId: null, aliases: [] });
  const record = async (storeId: string, amount: number, extra: object = {}) => {
    await core.setCurrentStore(storeId);
    return core.recordPrice({ itemId: bawang.id, amount, qty: 1, unit: "kg", ...extra });
  };
  return { regionId, guntur, ciawitali, kota, tarogong, bawang, record };
}

describe("cheapest elsewhere", () => {
  it("excludes the current store and shows the difference", async () => {
    const { core } = testCore();
    const { guntur, ciawitali, kota, bawang, record } = await setUp(core);
    await record(guntur.id, 30000);
    await record(ciawitali.id, 34000);
    await record(kota.id, 32000);

    const atKota = await core.itemPrices(bawang.id);
    expect(atKota.here?.price).toBe(32000);
    expect(atKota.cheapestElsewhere).toMatchObject({ name: "Pasar Guntur", price: 30000, difference: 2000 });

    await core.setCurrentStore(guntur.id);
    const atGuntur = await core.itemPrices(bawang.id);
    // Guntur itself is the cheapest; the next best is Yomart, Rp 2.000 dearer.
    expect(atGuntur.cheapestElsewhere).toMatchObject({ name: "Yomart Garut Kota", price: 32000, difference: -2000 });
  });

  it("has no difference without a price here", async () => {
    const { core } = testCore();
    const { guntur, kota, bawang, record } = await setUp(core);
    await record(guntur.id, 30000);
    await core.setCurrentStore(kota.id);

    expect(await core.itemPrices(bawang.id)).toMatchObject({
      here: null,
      cheapestElsewhere: { name: "Pasar Guntur", difference: null },
    });
  });

  it("counts a chain price once, and not when it is the price here", async () => {
    const { core } = testCore();
    const { guntur, kota, bawang, record } = await setUp(core);
    await record(kota.id, 29000, { scope: "chain" });
    await record(guntur.id, 31000);

    // At the market, the chain price is elsewhere, under the chain's name.
    expect((await core.itemPrices(bawang.id)).cheapestElsewhere).toMatchObject({ name: "Yomart", price: 29000 });

    // At a Yomart branch the same chain price is "here", not elsewhere.
    await core.setCurrentStore(kota.id);
    expect((await core.itemPrices(bawang.id)).cheapestElsewhere).toMatchObject({ name: "Pasar Guntur", difference: -2000 });
  });

  it("compares ranges by their low end", async () => {
    const { core } = testCore();
    const { guntur, kota, bawang, record } = await setUp(core);
    await record(guntur.id, 28000, { amountMax: 40000 });
    await record(kota.id, 30000);

    expect((await core.itemPrices(bawang.id)).cheapestElsewhere).toMatchObject({
      name: "Pasar Guntur",
      price: 28000,
      priceMax: 40000,
      difference: 2000,
    });
  });
});

describe("lowest in 90 days", () => {
  it("ignores observations older than 90 days", async () => {
    const { core, clock } = testCore();
    const { guntur, kota, bawang, record } = await setUp(core);
    await record(guntur.id, 25000);
    clock.advance(30 * DAY);
    await record(kota.id, 31000);
    clock.advance(30 * DAY);
    await record(guntur.id, 29000);

    expect((await core.itemPrices(bawang.id)).lowest90Days).toMatchObject({ price: 25000, store: { name: "Pasar Guntur" } });

    clock.advance(31 * DAY); // the Rp 25.000 is now 91 days old
    expect((await core.itemPrices(bawang.id)).lowest90Days).toMatchObject({ price: 29000 });
  });

  it("counts a promo price as recorded", async () => {
    const { core, clock } = testCore();
    const { kota, bawang, record } = await setUp(core);
    await record(kota.id, 32000, { promoAmount: 27000, promoUntil: dayAfter(clock.now(), 3) });
    clock.advance(10 * DAY);

    expect((await core.itemPrices(bawang.id)).lowest90Days?.price).toBe(27000);
  });
});

describe("promo", () => {
  it("is the effective price through its end date, then reverts", async () => {
    const { core, clock } = testCore();
    const { kota, bawang, record } = await setUp(core);
    const start = clock.now();
    const lastDay = dayAfter(start, 2);
    await record(kota.id, 32000, { promoAmount: 27000, promoUntil: lastDay });

    clock.advance(2 * DAY); // on the last day
    await core.setCurrentStore(kota.id); // a day away clears "Saya di"
    expect((await core.itemPrices(bawang.id)).here).toMatchObject({ price: 27000, regularPrice: 32000, promoUntil: lastDay });

    clock.set(`${dayAfter(start, 3)}T00:30:00`); // the day after, local time
    await core.setCurrentStore(kota.id);
    expect((await core.itemPrices(bawang.id)).here).toMatchObject({ price: 32000, regularPrice: 32000, promoUntil: null });
  });

  it("is used when comparing stores", async () => {
    const { core, clock } = testCore();
    const { guntur, kota, bawang, record } = await setUp(core);
    await record(kota.id, 32000, { promoAmount: 27000, promoUntil: dayAfter(clock.now(), 5) });
    await record(guntur.id, 30000);

    const prices = await core.itemPrices(bawang.id);
    expect(prices.cheapestElsewhere).toMatchObject({ name: "Yomart Garut Kota", price: 27000, difference: 3000 });
  });

  it("refuses a promo that is not cheaper, has no end date, or ended already", async () => {
    const { core, clock } = testCore();
    const { kota, record } = await setUp(core);
    const tomorrow = dayAfter(clock.now(), 1);

    await expect(record(kota.id, 30000, { promoAmount: 30000, promoUntil: tomorrow })).rejects.toMatchObject({ code: "invalid" });
    await expect(record(kota.id, 30000, { promoAmount: 25000 })).rejects.toMatchObject({ code: "invalid" });
    await expect(record(kota.id, 30000, { promoAmount: 25000, promoUntil: "2020-01-01" })).rejects.toMatchObject({
      code: "invalid",
    });
  });
});

describe("regions", () => {
  it("never compares across regions or currencies", async () => {
    const { core } = testCore();
    const { guntur, bawang, record } = await setUp(core);
    await record(guntur.id, 30000);
    const cairo = await core.saveRegion({
      name: "Cairo",
      countryCode: "EG",
      currency: "EGP",
      locale: "ar-EG",
      staleDaysMarket: 7,
      staleDaysSupermarket: 30,
    });
    const souq = await core.saveStore({ regionId: cairo.id, chainId: null, type: "traditional_market", name: "Souq" });
    await core.setCurrentStore(souq.id);
    await core.recordPrice({ itemId: bawang.id, amount: 4500, qty: 1, unit: "kg" });

    const inCairo = await core.itemPrices(bawang.id);
    expect(inCairo).toMatchObject({ region: { currency: "EGP" }, cheapestElsewhere: null, lowest90Days: { price: 4500 } });

    await core.setActiveRegion((await core.listRegions()).find((r) => r.currency === "IDR")!.id);
    expect((await core.itemPrices(bawang.id)).lowest90Days?.price).toBe(30000);
  });
});
