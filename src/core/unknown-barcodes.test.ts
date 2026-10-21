import { describe, expect, it } from "vitest";
import { createCore, type ProductMetadata } from ".";
import { HarganaStorage } from "./storage";
import { fakeClock, testCore } from "./testing";

/** Stored form of the UPC-A code 089686010947. */
const INDOMIE = "0089686010947";
const KECAP = "8992388101016";

describe("unknown barcodes", () => {
  it("are logged on every lookup and listed until the product is added", async () => {
    const { core, clock } = testCore();

    await core.lookupBarcode(INDOMIE);
    clock.advance(60_000);
    await core.lookupBarcode(KECAP);
    clock.advance(60_000);
    await core.lookupBarcode(INDOMIE);
    await core.lookupBarcode("123"); // not a valid code: not logged

    expect(await core.listUnknownBarcodes()).toEqual([
      { barcode: INDOMIE, count: 2, lastScannedAt: "2026-01-01T01:02:00.000Z" },
      { barcode: KECAP, count: 1, lastScannedAt: "2026-01-01T01:01:00.000Z" },
    ]);
    expect((await core.status()).pendingSyncCount).toBe(3);

    await core.saveProduct({ barcode: INDOMIE, name: "Indomie Goreng", aliases: [], categoryId: null });
    await core.lookupBarcode(INDOMIE);
    expect((await core.listUnknownBarcodes()).map((b) => b.barcode)).toEqual([KECAP]);
  });
});

describe("product suggestions", () => {
  const coreWith = (metadata: ProductMetadata) =>
    createCore({ storage: new HarganaStorage(`suggest-${crypto.randomUUID()}`), clock: fakeClock(), metadata });

  it("come from the metadata port, by canonical barcode", async () => {
    const asked: string[] = [];
    const core = coreWith({
      lookup: async (barcode) => {
        asked.push(barcode);
        return { name: "Indomie Goreng", brand: "Indomie", sizeValue: 85, sizeUnit: "g" };
      },
    });

    expect(await core.suggestProduct("089686010947")).toMatchObject({ name: "Indomie Goreng", sizeValue: 85 });
    expect(asked).toEqual([INDOMIE]);
  });

  it("are null when offline, unknown, failing, or without a port", async () => {
    expect(await coreWith({ lookup: async () => null }).suggestProduct(INDOMIE)).toBeNull();
    expect(await coreWith({ lookup: () => Promise.reject(new Error("offline")) }).suggestProduct(INDOMIE)).toBeNull();
    expect(await testCore().core.suggestProduct(INDOMIE)).toBeNull();
    expect(await coreWith({ lookup: async () => ({ name: "x" }) }).suggestProduct("123")).toBeNull();
  });
});
