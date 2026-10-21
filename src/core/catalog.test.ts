import { describe, expect, it } from "vitest";
import type { CommodityInput, HarganaCore } from ".";
import { testCore } from "./testing";

async function category(core: HarganaCore, name: string) {
  return (await core.listCategories()).find((c) => c.name === name)!.id;
}

async function stockMarket(core: HarganaCore) {
  const sayur = await category(core, "Sayur");
  const bumbu = await category(core, "Bumbu");
  const telur = await category(core, "Telur");
  const add = (name: string, categoryId: string, aliases: string[] = [], pricingUnit: CommodityInput["pricingUnit"] = "kg") =>
    core.saveCommodity({ name, categoryId, aliases, pricingUnit });
  await add("Cabai rawit merah", bumbu, ["cengek"]);
  await add("Bawang merah", bumbu, ["bawang beureum"]);
  await add("Bawang putih", bumbu, ["bawang bodas"]);
  await add("Kangkung", sayur, [], "ikat");
  await add("Telur ayam ras", telur, ["endog"]);
}

const names = (matches: { item: { name: string } }[]) => matches.map((m) => m.item.name);

describe("commodities", () => {
  it("adds a commodity with unit, category and aliases", async () => {
    const { core } = testCore();
    const sayur = await category(core, "Sayur");

    const saved = await core.saveCommodity({
      name: "  Kangkung ",
      pricingUnit: "ikat",
      categoryId: sayur,
      aliases: ["kangkong", " ", "Kangkung", "kangkong"],
    });

    expect(await core.getItem(saved.id)).toMatchObject({
      kind: "commodity",
      name: "Kangkung",
      pricingUnit: "ikat",
      categoryId: sayur,
      aliases: ["kangkong"],
    });
    expect((await core.status()).itemCount).toBe(1);
  });

  it("edits a commodity, keeping when it was created", async () => {
    const { core, clock } = testCore();
    const created = await core.saveCommodity({ name: "Cabe", pricingUnit: "kg", categoryId: null, aliases: [] });

    clock.advance(60_000);
    await core.saveCommodity({ ...created, name: "Cabai rawit merah", aliases: ["cabe rawit"], pricingUnit: "ons" });

    const item = await core.getItem(created.id);
    expect(item).toMatchObject({ name: "Cabai rawit merah", aliases: ["cabe rawit"], pricingUnit: "ons" });
    expect(item.createdAt).toBe(created.createdAt);
    expect(item.updatedAt).not.toBe(created.updatedAt);
    expect((await core.status()).itemCount).toBe(1);
  });

  it("refuses a commodity without a name", async () => {
    const { core } = testCore();

    await expect(
      core.saveCommodity({ name: " ", pricingUnit: "kg", categoryId: null, aliases: [] }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("search", () => {
  it("matches by name", async () => {
    const { core } = testCore();
    await stockMarket(core);

    expect(names(await core.searchItems("kangkung"))).toEqual(["Kangkung"]);
    expect(names(await core.searchItems("bawang"))).toEqual(expect.arrayContaining(["Bawang merah", "Bawang putih"]));
  });

  it("matches by alias", async () => {
    const { core } = testCore();
    await stockMarket(core);

    expect(names(await core.searchItems("bawang beureum"))[0]).toBe("Bawang merah");
    expect(names(await core.searchItems("endog"))).toEqual(["Telur ayam ras"]);
    expect(names(await core.searchItems("cengek"))).toEqual(["Cabai rawit merah"]);
  });

  it("finds 'Cabai rawit merah' from 'cabe'", async () => {
    const { core } = testCore();
    await stockMarket(core);

    expect(names(await core.searchItems("cabe"))[0]).toBe("Cabai rawit merah");
  });

  it("tolerates small typos", async () => {
    const { core } = testCore();
    await stockMarket(core);

    expect(names(await core.searchItems("kangkong"))).toEqual(["Kangkung"]);
    expect(names(await core.searchItems("bawang merha"))[0]).toBe("Bawang merah");
    expect(names(await core.searchItems("telor"))[0]).toBe("Telur ayam ras");
  });

  it("does not match unrelated items", async () => {
    const { core } = testCore();
    await stockMarket(core);

    expect(await core.searchItems("susu")).toEqual([]);
    expect(await core.searchItems("  ")).toEqual([]);
  });

  it("returns each match with its category", async () => {
    const { core } = testCore();
    await stockMarket(core);

    const [match] = await core.searchItems("kangkung");

    expect(match.category?.name).toBe("Sayur");
  });
});

describe("browsing by category", () => {
  it("lists a category's items by name", async () => {
    const { core } = testCore();
    await stockMarket(core);

    expect(names(await core.listItems({ categoryId: await category(core, "Bumbu") }))).toEqual([
      "Bawang merah",
      "Bawang putih",
      "Cabai rawit merah",
    ]);
  });
});
