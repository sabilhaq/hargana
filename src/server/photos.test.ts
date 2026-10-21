import { beforeAll, describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, type HarganaCore } from "@/core";
import { testCore } from "@/core/testing";
import { testServer } from "./testing";

const ID = "6f1c2a52-8a43-4e0c-9a4b-0d5c3b1e2f10";

/** Stand-in JPEG bytes of a given size (the server checks type and size, not content). */
function bytes(size: number, fill = 1) {
  return new Uint8Array(size).fill(fill).buffer;
}

async function product(core: HarganaCore) {
  return core.saveProduct({ barcode: "089686010947", name: "Indomie Goreng", aliases: [], categoryId: null });
}

// Starting the in-memory Postgres takes a while; do it before the timed tests.
beforeAll(() => testServer(), 60_000);

describe("item photos", () => {
  it("show on the device at once and count as waiting to sync", async () => {
    const { core } = testCore();
    const indomie = await product(core);

    await core.setItemPhoto(indomie.id, { image: bytes(120_000), thumb: bytes(8_000) });

    const photo = await core.itemPhoto(indomie.id);
    expect(photo).toMatchObject({ imageUrl: null, thumbUrl: null });
    expect(photo?.thumb?.byteLength).toBe(8_000);
    expect((await core.status()).pendingSyncCount).toBe(2); // the item, and its photo upload
  });

  it("are kept when the item is edited, and replaced by a new photo", async () => {
    const { core } = testCore();
    const indomie = await product(core);
    await core.setItemPhoto(indomie.id, { image: bytes(1000, 1), thumb: bytes(100, 1) });

    await core.saveProduct({ ...indomie, name: "Indomie Goreng Original" });
    expect((await core.itemPhoto(indomie.id))?.thumb?.byteLength).toBe(100);

    await core.setItemPhoto(indomie.id, { image: bytes(2000, 2), thumb: bytes(200, 2) });
    expect((await core.itemPhoto(indomie.id))?.thumb?.byteLength).toBe(200);
    await core.removeItemPhoto(indomie.id);
    expect(await core.itemPhoto(indomie.id)).toBeNull();
    expect((await core.status()).pendingSyncCount).toBe(1);
  });

  it("must be compressed first", async () => {
    const { core } = testCore();
    const indomie = await product(core);

    await expect(core.setItemPhoto(indomie.id, { image: bytes(MAX_PHOTO_BYTES + 1), thumb: bytes(100) })).rejects.toThrow(
      "too large",
    );
  });

  it("upload on sync, and a photo taken offline uploads once back online", async () => {
    const { transport, photoStore } = await testServer();
    const { core } = testCore();
    const indomie = await product(core);
    await core.setItemPhoto(indomie.id, { image: bytes(140_000), thumb: bytes(9_000) });

    const offline = { ...transport, uploadPhoto: () => Promise.reject(new Error("offline")) };
    await expect(core.sync(offline)).rejects.toThrow("offline");
    expect((await core.status()).pendingSyncCount).toBe(2);

    expect(await core.sync(transport)).toMatchObject({ photos: 1 });
    expect((await core.status()).pendingSyncCount).toBe(0);
    const photo = await core.itemPhoto(indomie.id);
    expect(photo).toMatchObject({ image: null, imageUrl: expect.stringMatching(/^\/api\/photos\/.+\.jpg$/) });
    expect(photo?.thumb?.byteLength).toBe(9_000);
    const sizes = [...photoStore.files.values()].map((file) => file.byteLength).sort((a, b) => a - b);
    expect(sizes).toEqual([9_000, 140_000]);
  });

  it("reach other devices, which keep the thumbnail for offline use", async () => {
    const { transport } = await testServer();
    const a = testCore().core;
    const b = testCore().core;
    const indomie = await product(a);
    await a.setItemPhoto(indomie.id, { image: bytes(50_000), thumb: bytes(5_000, 7) });
    await a.sync(transport);

    await b.sync(transport);

    const photo = await b.itemPhoto(indomie.id);
    expect(photo?.imageUrl).toBe((await a.itemPhoto(indomie.id))?.imageUrl);
    expect(new Uint8Array(photo!.thumb!)).toEqual(new Uint8Array(bytes(5_000, 7)));
  });
});

describe("the photo API", () => {
  const form = (fields: Record<string, string | Blob>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };
  const jpeg = (size: number) => new Blob([bytes(size)], { type: "image/jpeg" });

  it("requires a signed-in session to upload or view", async () => {
    const { upload, serve, signOut } = await testServer();
    signOut();

    expect((await upload(form({ id: ID, image: jpeg(10), thumb: jpeg(10) }))).status).toBe(401);
    expect((await serve(`/api/photos/${ID}.jpg`)).status).toBe(401);
  });

  it("accepts only small JPEGs under a UUID", async () => {
    const { upload, serve } = await testServer();

    expect((await upload(form({ id: "../etc", image: jpeg(10), thumb: jpeg(10) }))).status).toBe(400);
    expect((await upload(form({ id: ID, image: new Blob(["x"], { type: "image/png" }), thumb: jpeg(10) }))).status).toBe(400);
    expect((await upload(form({ id: ID, image: jpeg(MAX_PHOTO_BYTES + 1), thumb: jpeg(10) }))).status).toBe(400);

    const ok = await upload(form({ id: ID, image: jpeg(1000), thumb: jpeg(100) }));
    expect(await ok.json()).toEqual({ imageUrl: `/api/photos/${ID}.jpg`, thumbUrl: `/api/photos/${ID}-thumb.jpg` });
    const served = await serve(`/api/photos/${ID}.jpg`);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect((await served.arrayBuffer()).byteLength).toBe(1000);
    expect((await serve("/api/photos/nope.jpg")).status).toBe(404);
  });
});
