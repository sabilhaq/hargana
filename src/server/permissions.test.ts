import { beforeAll, describe, expect, it } from "vitest";
import { canEdit, canManageSettings, canRemovePrice, emptyRecords, type PullResponse } from "@/core";
import { testCore } from "@/core/testing";
import { TEST_USERS, testServer } from "./testing";

const { owner, budi } = TEST_USERS;

// Starting the in-memory Postgres takes a while; do it before the timed tests.
beforeAll(() => testServer(), 60_000);

/** The owner's device with a market, an item and a price, synced; and Budi's device, synced. */
async function setUp() {
  const server = await testServer();
  const mine = testCore();
  const budis = testCore();
  await mine.core.setCurrentUser(owner);
  await budis.core.setCurrentUser(budi);
  const regionId = (await mine.core.context()).activeRegion.id;
  const guntur = await mine.core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const cabai = await mine.core.saveCommodity({ name: "Cabai rawit", pricingUnit: "kg", categoryId: null, aliases: [] });
  await mine.core.setCurrentStore(guntur.id);
  const myPrice = await mine.core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
  await mine.core.sync(server.transport);
  server.signInAs(budi);
  await budis.core.sync(server.transport);
  return { ...server, mine, budis, regionId, guntur, cabai, myPrice };
}

const pullAll = async (call: Awaited<ReturnType<typeof testServer>>["call"], regionId: string) =>
  (await (await call("pull", { regionIds: [regionId], cursor: 0 })).json()) as PullResponse;

const advance = (device: { clock: { advance(ms: number): void } }) => device.clock.advance(60_000);

describe("contributors", () => {
  it("cannot change what the owner added: the server refuses and the device rolls back", async () => {
    const { call, transport, budis, regionId, cabai, guntur } = await setUp();
    advance(budis);
    await budis.core.saveCommodity({ ...cabai, name: "Cabe" });
    await budis.core.saveStore({ ...guntur, name: "Pasar Baru" });

    const report = await budis.core.sync(transport);

    expect(report.refused).toBe(2);
    expect((await budis.core.getItem(cabai.id)).name).toBe("Cabai rawit");
    expect((await budis.core.getStore(guntur.id)).name).toBe("Pasar Guntur");
    expect((await budis.core.status()).pendingSyncCount).toBe(0);
    const server = await pullAll(call, regionId);
    expect(server.items.map((i) => i.name)).toEqual(["Cabai rawit"]);
  });

  it("can add items, stores, chains and prices, edit their own, and everyone gets them", async () => {
    const { transport, signInAs, mine, budis, regionId } = await setUp();
    const indomaret = await budis.core.saveChain({ regionId, name: "Indomaret" });
    const branch = await budis.core.saveStore({ regionId, chainId: indomaret.id, type: "branch", name: "Indomaret Ciledug" });
    const kopi = await budis.core.saveProduct({ barcode: "8992388101016", name: "Kopi", aliases: [], categoryId: null, createdBy: owner.id });
    await budis.core.setCurrentStore(branch.id);
    await budis.core.recordPrice({ itemId: kopi.id, amount: 15000, qty: 1, unit: "pcs" });
    expect((await budis.core.sync(transport)).refused).toBe(0);

    advance(budis);
    await budis.core.saveProduct({ ...kopi, name: "Kopi Kapal Api" });
    expect((await budis.core.sync(transport)).refused).toBe(0);

    signInAs(owner);
    await mine.core.sync(transport);
    const onMine = await mine.core.getItem(kopi.id);
    expect(onMine).toMatchObject({ name: "Kopi Kapal Api", createdBy: budi.id }); // the server decides who created it
    expect((await mine.core.getStore(branch.id)).createdBy).toBe(budi.id);
    expect((await mine.core.itemPrices(kopi.id)).rows[0]).toMatchObject({ price: 15000 });
  });

  it("cannot add regions or categories; the device drops them", async () => {
    const { call, transport, budis, regionId } = await setUp();
    const snacks = await budis.core.saveCategory({ name: "Jajanan", sortOrder: 200 });

    expect((await budis.core.sync(transport)).refused).toBe(1);
    expect((await budis.core.listCategories()).map((c) => c.id)).not.toContain(snacks.id);
    expect((await pullAll(call, regionId)).categories.map((c) => c.id)).not.toContain(snacks.id);
  });

  it("can remove their own prices but not the owner's; the owner can remove any", async () => {
    const { call, transport, signInAs, mine, budis, regionId, guntur, cabai, myPrice } = await setUp();
    advance(budis);
    await budis.core.setCurrentStore(guntur.id);
    const budisPrice = await budis.core.recordPrice({ itemId: cabai.id, amount: 45000, qty: 1, unit: "kg" });
    await budis.core.sync(transport);

    await budis.core.removePrice(myPrice.id);
    await budis.core.removePrice(budisPrice.id);
    expect((await budis.core.sync(transport)).refused).toBe(1);
    expect((await pullAll(call, regionId)).priceCorrections.map((c) => c.observationId)).toEqual([budisPrice.id]);
    expect((await budis.core.itemPrices(cabai.id)).rows[0]).toMatchObject({ price: 40000 }); // the owner's price stands

    signInAs(owner);
    await mine.core.sync(transport);
    await mine.core.removePrice(myPrice.id);
    expect((await mine.core.sync(transport)).refused).toBe(0);
  });

  it("are refused even when the batch claims the owner created the record", async () => {
    const { call, transport, regionId, cabai } = await setUp();
    const forged = { ...cabai, name: "Forged", createdBy: budi.id, updatedAt: "2030-01-01T00:00:00.000Z" };

    const response = await transport.push({ ...emptyRecords(), items: [forged] });

    expect(response.refused).toEqual([{ table: "items", id: cabai.id }]);
    expect(response.restore?.items).toMatchObject([{ name: "Cabai rawit", createdBy: owner.id }]);
    expect((await pullAll(call, regionId)).items[0].name).toBe("Cabai rawit");
  });
});

describe("what the app shows", () => {
  const me = { id: budi.id, name: "Budi", role: "contributor" as const };

  it("lets contributors edit and remove only their own things", () => {
    expect(canEdit(me, { createdBy: budi.id })).toBe(true);
    expect(canEdit(me, { createdBy: owner.id })).toBe(false);
    expect(canEdit(me, {})).toBe(false); // from before anyone was recorded: owner only
    expect(canRemovePrice(me, { recordedBy: budi.id })).toBe(true);
    expect(canRemovePrice(me, { recordedBy: null })).toBe(false);
    expect(canManageSettings(me)).toBe(false);
  });

  it("lets the owner, or a user not known yet, do everything", () => {
    for (const user of [{ ...owner }, null]) {
      expect(canEdit(user, {})).toBe(true);
      expect(canRemovePrice(user, { recordedBy: budi.id })).toBe(true);
      expect(canManageSettings(user)).toBe(true);
    }
  });
});
