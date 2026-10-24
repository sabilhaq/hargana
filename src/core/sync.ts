import type { Clock } from "./clock";
import { followMerges } from "./merge";
import { saveUserNames } from "./people";
import { activeRegion } from "./places";
import { SYNCED_TABLES, type HarganaStorage, type OutboxEntry } from "./storage";
import type { Category, Chain, Item, PriceCorrection, PriceObservation, Region, Store, UnknownBarcodeScan, User } from "./types";

// The sync contract: the only thing the server and the device agree on.

/** Records by table, as pushed and pulled. */
export type SyncRecords = {
  regions: Region[];
  categories: Category[];
  chains: Chain[];
  stores: Store[];
  items: Item[];
  observations: PriceObservation[];
  priceCorrections: PriceCorrection[];
  unknownBarcodes: UnknownBarcodeScan[];
};

/** Changed records, keyed by their client-generated ids. Pushing the same batch twice changes nothing. */
export type PushRequest = SyncRecords;

export type PushResponse = {
  /**
   * Pushed item id → the id the server kept, for products whose barcode the
   * server already had under another id. `items` holds the kept items.
   */
  mappings: Record<string, string>;
  items: Item[];
  /** Records the pushing user may not create or change; nothing of them was stored. */
  refused?: Refusal[];
  /** The server's versions of refused records it has, to put back on the device. */
  restore?: Partial<SyncRecords>;
};

/** A pushed record the server did not store, because the user's role does not allow it. */
export type Refusal = { table: keyof SyncRecords; id: string };

/**
 * Everything changed after `cursor` (0 for everything): regions, categories
 * and items everywhere; chains, stores, observations, price corrections and
 * unknown-barcode scans only in `regionIds`.
 */
export type PullRequest = { regionIds: string[]; cursor: number };
/** Also every user's name, so "dicatat oleh …" reads offline. */
export type PullResponse = SyncRecords & { cursor: number; users?: User[] };

/** A photo to upload: JPEG bytes of the image and its thumbnail. Uploading the same id again replaces it. */
export type PhotoUpload = { id: string; image: ArrayBuffer; thumb: ArrayBuffer };
export type PhotoUrls = { imageUrl: string; thumbUrl: string };

/** How the device reaches the server. */
export type SyncTransport = {
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
  uploadPhoto(photo: PhotoUpload): Promise<PhotoUrls>;
  /** Fetches a photo by the URL the server gave for it. */
  download(url: string): Promise<ArrayBuffer>;
};

/** `refused`: local changes the server did not accept for this user's role; they were undone here. */
export type SyncReport = { photos: number; pushed: number; pulled: number; refused: number };

/** Records sent per push request. */
const PUSH_BATCH = 200;
/** Regions whose data this device keeps, and each one's pull cursor. */
const SYNC_CURSORS = "syncCursors";

export function emptyRecords(): SyncRecords {
  return {
    regions: [],
    categories: [],
    chains: [],
    stores: [],
    items: [],
    observations: [],
    priceCorrections: [],
    unknownBarcodes: [],
  };
}

export function sync(storage: HarganaStorage, clock: Clock) {
  let running: Promise<SyncReport> | null = null;

  /** Uploads photos taken on this device, then gives their items the URLs. */
  async function uploadPhotos(transport: SyncTransport) {
    const pending = await storage.photos.where("pending").equals(1).toArray();
    for (const photo of pending) {
      const urls = await transport.uploadPhoto({ id: photo.id, image: photo.image!, thumb: photo.thumb! });
      const item = await storage.items.get(photo.itemId);
      if (item?.photo?.id !== photo.id) {
        // Replaced or removed while uploading.
        await storage.photos.delete(photo.id);
        continue;
      }
      await storage.saveSynced("items", { ...item, photo: { id: photo.id, ...urls }, updatedAt: clock.now().toISOString() });
      await storage.photos.put({ ...photo, image: null, pending: 0 });
    }
    return pending.length;
  }

  /**
   * Keeps a thumbnail on the device for every item photo, so they show offline.
   * Best effort: a failed download is tried again on the next sync.
   */
  async function downloadThumbs(transport: SyncTransport) {
    const items = await storage.items.filter((item) => !!item.photo).toArray();
    const current = new Set(items.map((item) => item.photo!.id));
    const stored = new Set(await storage.photos.toCollection().primaryKeys());
    for (const { id: itemId, photo } of items) {
      if (stored.has(photo!.id) || !photo!.thumbUrl) continue;
      try {
        const thumb = await transport.download(photo!.thumbUrl);
        await storage.photos.put({ id: photo!.id, itemId, image: null, thumb, pending: 0 });
      } catch {
        // Offline or gone; next time.
      }
    }
    await storage.photos.filter((p) => p.pending === 0 && !current.has(p.id)).delete();
  }

  async function push(transport: SyncTransport) {
    let pushed = 0;
    let refused = 0;
    for (;;) {
      const entries = await storage.outbox.orderBy("createdAt").limit(PUSH_BATCH).toArray();
      if (entries.length === 0) return { pushed, refused };
      const batch = emptyRecords();
      for (const entry of entries) {
        const record = await storage.table(entry.table).get(entry.recordId);
        if (record) (batch[entry.table] as unknown[]).push(record);
      }
      const response = await transport.push(batch);
      const tables = SYNCED_TABLES.map((t) => storage.table(t));
      await storage.transaction("rw", [storage.outbox, ...tables], async () => {
        await settle(entries);
        await applyMappings(response);
        await undoRefused(response);
      });
      pushed += entries.length;
      refused += response.refused?.length ?? 0;
    }
  }

  /** Drops the entries just pushed, unless the record changed again meanwhile. */
  async function settle(entries: OutboxEntry[]) {
    const current = await storage.outbox.bulkGet(entries.map((e) => e.id));
    const done = entries.filter((e, i) => current[i]?.createdAt === e.createdAt).map((e) => e.id);
    await storage.outbox.bulkDelete(done);
  }

  /** The server kept another item for a barcode: use it, and point our prices at it. */
  async function applyMappings({ mappings, items }: PushResponse) {
    await storage.items.bulkPut(items);
    for (const [from, to] of Object.entries(mappings)) {
      await storage.observations.where({ itemId: from }).modify({ itemId: to });
      await storage.items.delete(from);
      await storage.outbox.delete(`items:${from}`);
    }
  }

  /**
   * Changes the server refused (the user's role does not allow them) are
   * undone: the server's version is put back, or the record removed if the
   * server never had it.
   */
  async function undoRefused({ refused = [], restore = {} }: PushResponse) {
    for (const { table, id } of refused) {
      const server = (restore[table] as { id: string }[] | undefined)?.find((r) => r.id === id);
      if (server) await storage.table(table).put(server);
      else await storage.table(table).delete(id);
    }
  }

  async function pull(transport: SyncTransport) {
    const cursors = ((await storage.settings.get(SYNC_CURSORS))?.value ?? {}) as Record<string, number>;
    cursors[await activeRegion(storage)] ??= 0;
    // Regions synced together share a cursor; a newly used region starts from 0.
    const groups = new Map<number, string[]>();
    for (const [regionId, cursor] of Object.entries(cursors)) groups.set(cursor, [...(groups.get(cursor) ?? []), regionId]);

    let pulled = 0;
    for (const [cursor, regionIds] of groups) {
      const response = await transport.pull({ regionIds, cursor });
      pulled += await apply(response);
      await saveUserNames(storage, response.users ?? []);
      for (const id of regionIds) cursors[id] = response.cursor;
    }
    await storage.settings.put({ key: SYNC_CURSORS, value: cursors });
    // Items merged on another device take this device's shopping list along.
    if (pulled > 0) await followMerges(storage);
    return pulled;
  }

  /**
   * Stores pulled records. Newer wins; a record changed here and not yet
   * pushed is kept, and observations, corrections and scans never change once
   * recorded.
   */
  async function apply(records: SyncRecords) {
    let count = 0;
    const tables = SYNCED_TABLES.map((t) => storage.table(t));
    await storage.transaction("rw", [...tables, storage.outbox], async () => {
      for (const table of SYNCED_TABLES) {
        const incoming = records[table] as { id: string; updatedAt?: string }[];
        if (incoming.length === 0) continue;
        const ids = incoming.map((r) => r.id);
        const [local, pending] = await Promise.all([
          storage.table(table).bulkGet(ids),
          storage.outbox.bulkGet(ids.map((id) => `${table}:${id}`)),
        ]);
        const fresh = incoming.filter((record, i) => {
          if (pending[i]) return false;
          if (!local[i]) return true;
          return !!record.updatedAt && record.updatedAt > local[i].updatedAt;
        });
        await storage.table(table).bulkPut(fresh);
        count += fresh.length;
      }
    });
    return count;
  }

  return {
    /**
     * Uploads new photos and pushes what changed on this device, then pulls
     * what changed elsewhere for the regions in use and fetches thumbnails. Safe to call again at any time; overlapping calls
     * share one run.
     */
    sync(transport: SyncTransport): Promise<SyncReport> {
      running ??= (async () => {
        try {
          const photos = await uploadPhotos(transport);
          const { pushed, refused } = await push(transport);
          const pulled = await pull(transport);
          await downloadThumbs(transport);
          return { photos, pushed, pulled, refused };
        } finally {
          running = null;
        }
      })();
      return running;
    },
  };
}
