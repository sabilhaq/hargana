import { describe, expect, it } from "vitest";
import { testCore } from "./testing";

describe("core status", () => {
  it("starts with an empty catalog and nothing waiting to sync", async () => {
    const { core } = testCore();

    expect(await core.status()).toEqual({ itemCount: 0, pendingSyncCount: 0 });
  });
});

describe("outbox", () => {
  it("queues every change made offline, once per record", async () => {
    const { core } = testCore();
    const regionId = (await core.context()).activeRegion.id;
    const pasar = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
    const cabai = await core.saveCommodity({ name: "Cabai", pricingUnit: "kg", categoryId: null, aliases: [] });
    await core.saveCommodity({ ...cabai, name: "Cabai rawit" });
    await core.setCurrentStore(pasar.id);
    await core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
    await core.recordPrice({ itemId: cabai.id, amount: 42000, qty: 1, unit: "kg" });

    expect(await core.status()).toEqual({ itemCount: 1, pendingSyncCount: 4 });
  });
});
