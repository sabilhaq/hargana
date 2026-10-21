import { describe, expect, it } from "vitest";
import type { HarganaCore } from ".";
import { testCore } from "./testing";

async function setUp(core: HarganaCore) {
  const regionId = (await core.context()).activeRegion.id;
  const yomart = await core.saveChain({ regionId, name: "Yomart" });
  const kota = await core.saveStore({ regionId, chainId: yomart.id, type: "branch", name: "Yomart Garut Kota" });
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const kecap = await core.saveProduct({ barcode: "8992388101016", name: 'Kecap "Bango", manis', brand: "Bango", sizeValue: 220, sizeUnit: "ml", aliases: [], categoryId: null });
  const cabai = await core.saveCommodity({ name: "Cabai rawit", pricingUnit: "kg", categoryId: null, aliases: ["cengek", "cabe"] });
  await core.setCurrentStore(kota.id);
  await core.recordPrice({ itemId: kecap.id, amount: 11500, qty: 1, unit: "pcs", note: "=SUM(A1)" });
  await core.setCurrentStore(guntur.id);
  await core.recordPrice({ itemId: cabai.id, amount: 18000, amountMax: 20000, qty: 500, unit: "g" });
  return { kecap, cabai, kota, guntur };
}

/** Rows of a CSV file as objects keyed by header (handles quoted fields). */
function parse(text: string) {
  expect(text.startsWith("﻿")).toBe(true);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.slice(1);
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted && c === '"' && body[i + 1] === '"') {
      field += '"';
      i++;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (!quoted && c === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && c === "\r" && body[i + 1] === "\n") {
      rows.push([...row, field]);
      row = [];
      field = "";
      i++;
    } else {
      field += c;
    }
  }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

describe("export", () => {
  it("includes every item, store and observation as JSON, with each price's currency", async () => {
    const { core } = testCore();
    const { kecap, cabai } = await setUp(core);

    const data = await core.exportData();

    expect(data.items.map((i) => i.id).sort()).toEqual([kecap.id, cabai.id].sort());
    expect(data.stores.map((s) => s.name).sort()).toEqual(["Pasar Guntur", "Yomart Garut Kota"]);
    expect(data.chains.map((c) => c.name)).toEqual(["Yomart"]);
    expect(data.observations).toHaveLength(2);
    expect(data.observations.find((o) => o.itemId === cabai.id)).toMatchObject({
      currency: "IDR",
      price: 36000,
      priceMax: 40000,
      enteredAmount: 18000,
      enteredAmountMax: 20000,
      enteredQty: 500,
      enteredUnit: "g",
    });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it("writes spreadsheet files with names instead of ids, and the entered input", async () => {
    const { core } = testCore();
    const { kecap } = await setUp(core);

    const files = await core.exportCsv();

    expect(Object.keys(files).sort()).toEqual(["items.csv", "observations.csv", "stores.csv"]);
    const items = parse(files["items.csv"]);
    expect(items.find((i) => i.id === kecap.id)).toMatchObject({ name: 'Kecap "Bango", manis', barcode: "8992388101016", size_value: "220", size_unit: "ml" });
    expect(items.find((i) => i.kind === "commodity")).toMatchObject({ pricing_unit: "kg", aliases: "cengek; cabe" });

    expect(parse(files["stores.csv"]).find((s) => s.name === "Yomart Garut Kota")).toMatchObject({
      type: "branch",
      chain: "Yomart",
      region: "Kabupaten Garut",
      currency: "IDR",
    });

    const observations = parse(files["observations.csv"]);
    expect(observations.find((o) => o.item === "Cabai rawit")).toMatchObject({
      store: "Pasar Guntur",
      currency: "IDR",
      price: "36000",
      price_max: "40000",
      price_per: "kg",
      entered_amount: "18000",
      entered_qty: "500",
      entered_unit: "g",
      verified: "true",
    });
    // A note that looks like a formula is kept as text.
    expect(observations.find((o) => o.item_id === kecap.id)).toMatchObject({ chain: "Yomart", note: "'=SUM(A1)" });
  });
});
