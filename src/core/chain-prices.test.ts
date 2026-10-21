import { describe, expect, it } from "vitest";
import type { HarganaCore, PriceRow } from ".";
import { testCore } from "./testing";

const MINUTE = 60_000;

async function setUp(core: HarganaCore) {
  const regionId = (await core.context()).activeRegion.id;
  const yomart = await core.saveChain({ regionId, name: "Yomart" });
  const branch = (name: string) => core.saveStore({ regionId, chainId: yomart.id, type: "branch", name });
  const kota = await branch("Yomart Garut Kota");
  const tarogong = await branch("Yomart Tarogong");
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const indomie = await core.saveProduct({ barcode: "089686010947", name: "Indomie Goreng", aliases: [], categoryId: null });
  return { kota, tarogong, guntur, indomie };
}

/** Each branch's resolved price, by name. */
async function branchPrices(core: HarganaCore, itemId: string) {
  const { rows } = await core.itemPrices(itemId);
  const result: Record<string, number> = {};
  for (const row of rows) {
    const branches = row.kind === "chain" ? row.branches : [row];
    for (const b of branches) result[b.store.name] = b.price;
  }
  return result;
}

const chainRow = (rows: PriceRow[]) => rows.find((r) => r.kind === "chain") as Extract<PriceRow, { kind: "chain" }>;

describe("Sama ✓", () => {
  it("adds a confirm observation for this branch without changing the price", async () => {
    const { core, clock } = testCore();
    const { kota, tarogong, indomie } = await setUp(core);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs", scope: "chain" });

    clock.advance(10 * 24 * 60 * MINUTE);
    await core.setCurrentStore(tarogong.id);
    const confirm = await core.confirmPrice(indomie.id);

    expect(confirm).toMatchObject({ action: "confirm", scope: "branch", storeId: tarogong.id, price: 3500 });
    expect(await core.listObservations(indomie.id)).toHaveLength(2);
    expect(await branchPrices(core, indomie.id)).toEqual({ "Yomart Garut Kota": 3500, "Yomart Tarogong": 3500 });
    const tarogongRow = chainRow((await core.itemPrices(indomie.id)).rows).branches.find((b) => b.store.id === tarogong.id)!;
    expect(tarogongRow).toMatchObject({ ageDays: 0, fromChain: false });
    expect((await core.itemPrices(indomie.id)).here).toMatchObject({ store: { id: tarogong.id }, price: 3500 });
  });

  it("confirms a market price too", async () => {
    const { core } = testCore();
    const { guntur } = await setUp(core);
    const bawang = await core.saveCommodity({ name: "Bawang merah", pricingUnit: "kg", categoryId: null, aliases: [] });
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: bawang.id, amount: 28000, amountMax: 32000, qty: 1, unit: "kg" });

    expect(await core.confirmPrice(bawang.id)).toMatchObject({ scope: "market", price: 28000, priceMax: 32000 });
  });

  it("needs a known price here", async () => {
    const { core } = testCore();
    const { kota, indomie } = await setUp(core);
    await core.setCurrentStore(kota.id);

    await expect(core.confirmPrice(indomie.id)).rejects.toMatchObject({ code: "no_price" });
  });
});

describe("Ubah harga", () => {
  it("'cabang ini saja' changes only this branch", async () => {
    const { core, clock } = testCore();
    const { kota, tarogong, indomie } = await setUp(core);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs", scope: "chain" });

    clock.advance(MINUTE);
    await core.setCurrentStore(tarogong.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3700, qty: 1, unit: "pcs" });

    expect(await branchPrices(core, indomie.id)).toEqual({ "Yomart Garut Kota": 3500, "Yomart Tarogong": 3700 });
  });

  it("'seluruh chain' changes branches without a newer price of their own", async () => {
    const { core, clock } = testCore();
    const { kota, tarogong, indomie } = await setUp(core);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs", scope: "chain" });
    clock.advance(MINUTE);
    await core.setCurrentStore(tarogong.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3700, qty: 1, unit: "pcs" }); // newer override
    clock.advance(MINUTE);

    // The chain price recorded earlier than the override stays below it.
    expect(await branchPrices(core, indomie.id)).toEqual({ "Yomart Garut Kota": 3500, "Yomart Tarogong": 3700 });
  });

  it("a newer chain price supersedes an older branch override", async () => {
    const { core, clock } = testCore();
    const { kota, tarogong, indomie } = await setUp(core);
    await core.setCurrentStore(tarogong.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3700, qty: 1, unit: "pcs" });

    clock.advance(MINUTE);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3900, qty: 1, unit: "pcs", scope: "chain" });

    expect(await branchPrices(core, indomie.id)).toEqual({ "Yomart Garut Kota": 3900, "Yomart Tarogong": 3900 });
    const row = chainRow((await core.itemPrices(indomie.id)).rows);
    expect(row.branches.every((b) => b.fromChain)).toBe(true);
  });

  it("refuses a chain-wide price at a market", async () => {
    const { core } = testCore();
    const { guntur } = await setUp(core);
    const bawang = await core.saveCommodity({ name: "Bawang merah", pricingUnit: "kg", categoryId: null, aliases: [] });
    await core.setCurrentStore(guntur.id);

    await expect(
      core.recordPrice({ itemId: bawang.id, amount: 30000, qty: 1, unit: "kg", scope: "chain" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("chain rows", () => {
  it("flags variation only when branch prices differ", async () => {
    const { core, clock } = testCore();
    const { kota, tarogong, indomie } = await setUp(core);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs", scope: "chain" });

    let row = chainRow((await core.itemPrices(indomie.id)).rows);
    expect(row).toMatchObject({ chain: { name: "Yomart" }, price: 3500, varies: false });
    expect(row.branches).toHaveLength(2);

    clock.advance(MINUTE);
    await core.setCurrentStore(tarogong.id);
    await core.confirmPrice(indomie.id);
    expect(chainRow((await core.itemPrices(indomie.id)).rows).varies).toBe(false);

    clock.advance(MINUTE);
    await core.recordPrice({ itemId: indomie.id, amount: 3700, qty: 1, unit: "pcs" });
    row = chainRow((await core.itemPrices(indomie.id)).rows);
    expect(row).toMatchObject({ price: 3500, varies: true });
    expect(row.branches.map((b) => [b.store.name, b.price])).toEqual([
      ["Yomart Garut Kota", 3500],
      ["Yomart Tarogong", 3700],
    ]);
  });

  it("shows a lone branch price as its own row", async () => {
    const { core } = testCore();
    const { kota, indomie } = await setUp(core);
    await core.setCurrentStore(kota.id);
    await core.recordPrice({ itemId: indomie.id, amount: 3500, qty: 1, unit: "pcs" });

    expect((await core.itemPrices(indomie.id)).rows).toMatchObject([{ kind: "store", store: { id: kota.id } }]);
  });
});
