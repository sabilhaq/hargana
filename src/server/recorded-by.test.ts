import { beforeAll, describe, expect, it } from "vitest";
import { emptyRecords, type HarganaCore, type PullResponse } from "@/core";
import { testCore } from "@/core/testing";
import { TEST_USERS, testServer } from "./testing";

const { owner, budi } = TEST_USERS;

// Starting the in-memory Postgres takes a while; do it before the timed tests.
beforeAll(() => testServer(), 60_000);

async function setUp(core: HarganaCore) {
  const regionId = (await core.context()).activeRegion.id;
  const guntur = await core.saveStore({ regionId, chainId: null, type: "traditional_market", name: "Pasar Guntur" });
  const cabai = await core.saveCommodity({ name: "Cabai rawit", pricingUnit: "kg", categoryId: null, aliases: [] });
  return { regionId, guntur, cabai };
}

describe("who recorded a price", () => {
  it("is the pushing user, whatever the device claims, and a repeated push changes nothing", async () => {
    const { call, transport, signInAs } = await testServer();
    const { core } = testCore();
    await core.setCurrentUser(owner); // the device says it was the owner…
    const { regionId, guntur, cabai } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    const observation = await core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });
    const batch = { ...emptyRecords(), stores: [guntur], items: [cabai], observations: [observation] };

    signInAs(budi); // …but Budi is the one signed in when it is pushed
    await transport.push(batch);
    const pull = async () => (await (await call("pull", { regionIds: [regionId], cursor: 0 })).json()) as PullResponse;
    const first = await pull();
    await transport.push(batch);

    expect(first.observations[0].recordedBy).toBe(budi.id);
    expect(await pull()).toEqual(first);
    expect(first.users).toEqual(
      expect.arrayContaining([
        { id: owner.id, name: owner.name },
        { id: budi.id, name: budi.name },
      ]),
    );
  });

  it("shows each person's name on every device, and 'me' for my own", async () => {
    const { transport, signInAs } = await testServer();
    const { core: mine } = testCore();
    const { core: budis, clock: budisClock } = testCore();
    await mine.setCurrentUser(owner);
    await budis.setCurrentUser(budi);
    const { guntur, cabai } = await setUp(mine);
    await mine.setCurrentStore(guntur.id);
    await mine.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" });

    // Before syncing, my device already knows it was me.
    expect((await mine.priceHistory(cabai.id)).entries[0].recordedBy).toEqual({ id: owner.id, name: owner.name, isMe: true });
    await mine.sync(transport);

    signInAs(budi);
    await budis.sync(transport);
    budisClock.advance(60_000); // Budi checks the shelf a minute later
    await budis.setCurrentStore(guntur.id);
    await budis.confirmPrice(cabai.id);
    await budis.sync(transport);

    signInAs(owner);
    await mine.sync(transport);
    const names = (await mine.priceHistory(cabai.id)).entries.map((e) => [e.recordedBy?.name, e.recordedBy?.isMe]);
    expect(names.sort()).toEqual([
      ["Budi", false],
      ["Sabil", true],
    ]);
    const onBudis = (await budis.itemPrices(cabai.id)).rows[0];
    expect(onBudis.recordedBy).toEqual({ id: budi.id, name: "Budi", isMe: true });
  });

  it("is named in the export, and unknown for prices from before it was kept", async () => {
    const { transport, signInAs } = await testServer();
    const { core } = testCore();
    const { guntur, cabai } = await setUp(core);
    await core.setCurrentStore(guntur.id);
    await core.recordPrice({ itemId: cabai.id, amount: 40000, qty: 1, unit: "kg" }); // nobody signed in on this device yet
    expect((await core.priceHistory(cabai.id)).entries[0].recordedBy).toBeNull();

    signInAs(budi);
    await core.sync(transport);
    const csv = (await core.exportCsv())["observations.csv"];
    expect(csv.trimEnd().split("\r\n")[0].split(",").at(-1)).toBe("recorded_by");
    expect((await core.exportData()).observations[0]).toMatchObject({ recordedBy: null, recordedByName: null });
  });
});
