import { describe, expect, it } from "vitest";
import type { HarganaCore, ProductInput } from ".";
import { testCore } from "./testing";

const INDOMIE = "089686010947";

function indomie(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    barcode: INDOMIE,
    name: "Indomie Goreng",
    brand: "Indomie",
    sizeValue: 85,
    sizeUnit: "g",
    aliases: ["mi goreng"],
    categoryId: null,
    ...overrides,
  };
}

async function addIndomie(core: HarganaCore) {
  return core.saveProduct(indomie());
}

describe("barcode lookup", () => {
  it("finds a product by its barcode in any of its forms", async () => {
    const { core } = testCore();
    const product = await addIndomie(core);

    // Stored as UPC-A → found as UPC-A and as its EAN-13 form.
    for (const code of [INDOMIE, `0${INDOMIE}`]) {
      expect(await core.lookupBarcode(code)).toMatchObject({ status: "found", item: { id: product.id } });
    }
  });

  it("reports an unknown but valid barcode, canonicalized, so it can be added", async () => {
    const { core } = testCore();

    expect(await core.lookupBarcode("04252614")).toEqual({ status: "unknown", barcode: "0042100005264" });
  });

  it("rejects invalid codes before looking anything up", async () => {
    const { core } = testCore();

    expect(await core.lookupBarcode("4006381333932")).toEqual({ status: "invalid", reason: "bad_check_digit" });
    expect(await core.lookupBarcode("12345")).toEqual({ status: "invalid", reason: "wrong_length" });
    expect(await core.lookupBarcode("https://example.com", "qr_code")).toEqual({
      status: "invalid",
      reason: "not_product",
    });
  });

  it("never matches a commodity", async () => {
    const { core } = testCore();
    await core.saveCommodity({ name: "Kangkung", pricingUnit: "ikat", categoryId: null, aliases: [] });

    expect(await core.lookupBarcode("4006381333931")).toMatchObject({ status: "unknown" });
  });
});

describe("products", () => {
  it("adds a product with brand, size and category", async () => {
    const { core } = testCore();
    const mie = (await core.listCategories())[0].id;

    const product = await core.saveProduct(indomie({ categoryId: mie, brand: "  Indomie " }));

    expect(await core.getItem(product.id)).toMatchObject({
      kind: "product",
      barcode: `0${INDOMIE}`,
      name: "Indomie Goreng",
      brand: "Indomie",
      sizeValue: 85,
      sizeUnit: "g",
      categoryId: mie,
    });
  });

  it("refuses a second product with the same barcode, in any form", async () => {
    const { core } = testCore();
    await addIndomie(core);

    await expect(core.saveProduct(indomie({ barcode: `0${INDOMIE}`, name: "Other" }))).rejects.toMatchObject({
      code: "barcode_taken",
    });
  });

  it("lets a product be edited without tripping over its own barcode", async () => {
    const { core } = testCore();
    const product = await addIndomie(core);

    await core.saveProduct({ ...product, name: "Indomie Mi Goreng Original" });

    expect((await core.getItem(product.id)).name).toBe("Indomie Mi Goreng Original");
  });

  it("refuses an invalid barcode", async () => {
    const { core } = testCore();

    await expect(core.saveProduct(indomie({ barcode: "089686010948" }))).rejects.toMatchObject({
      code: "invalid_barcode",
    });
  });

  it("keeps the size optional", async () => {
    const { core } = testCore();

    const product = await core.saveProduct(indomie({ sizeValue: undefined, sizeUnit: undefined, brand: "" }));

    expect(product).not.toHaveProperty("sizeValue");
    expect(product).not.toHaveProperty("brand");
  });

  it("is found by name and by brand, alongside commodities", async () => {
    const { core } = testCore();
    await addIndomie(core);
    await core.saveProduct({ ...indomie(), barcode: "4006381333931", name: "Kecap Manis", brand: "Bango", aliases: [] });
    await core.saveCommodity({ name: "Bawang goreng", pricingUnit: "ons", categoryId: null, aliases: [] });

    expect((await core.searchItems("indomie"))[0].item.name).toBe("Indomie Goreng");
    expect((await core.searchItems("bango"))[0].item.name).toBe("Kecap Manis");
    expect((await core.searchItems("goreng")).map((m) => m.item.kind).sort()).toEqual(["commodity", "product"]);
  });
});
