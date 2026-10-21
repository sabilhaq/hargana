import type { Clock } from "./clock";
import { CoreError } from "./errors";
import type { HarganaStorage } from "./storage";
import type { Item, PhotoView } from "./types";

/** Uploaded photos are at most this big; the UI compresses before calling setItemPhoto. */
export const MAX_PHOTO_BYTES = 160 * 1024;
export const MAX_THUMB_BYTES = 24 * 1024;

export function photos(storage: HarganaStorage, clock: Clock) {
  async function mustItem(id: string) {
    const item = await storage.items.get(id);
    if (!item) throw new CoreError("not_found", `Item ${id} not found`);
    return item;
  }

  /** Saves the item with a new photo (or none), dropping the old photo's bytes. */
  async function replacePhoto(item: Item, photo: Item["photo"]) {
    const { photo: old, ...rest } = item;
    if (old) await storage.photos.delete(old.id);
    const updated = { ...rest, ...(photo && { photo }), updatedAt: clock.now().toISOString() } as Item;
    return storage.saveSynced("items", updated);
  }

  return {
    /**
     * Gives an item a photo (JPEG bytes, already compressed). It shows on this
     * device at once and is uploaded by the next sync.
     */
    async setItemPhoto(itemId: string, { image, thumb }: { image: ArrayBuffer; thumb: ArrayBuffer }) {
      const item = await mustItem(itemId);
      if (image.byteLength > MAX_PHOTO_BYTES || thumb.byteLength > MAX_THUMB_BYTES) {
        throw new CoreError("invalid", "photo is too large");
      }
      const id = crypto.randomUUID();
      await storage.photos.put({ id, itemId, image, thumb, pending: 1 });
      return replacePhoto(item, { id, imageUrl: null, thumbUrl: null });
    },

    async removeItemPhoto(itemId: string) {
      return replacePhoto(await mustItem(itemId), undefined);
    },

    /** The item's photo as far as this device knows it, or null without one. */
    async itemPhoto(itemId: string): Promise<PhotoView | null> {
      const { photo } = await mustItem(itemId);
      if (!photo) return null;
      const local = await storage.photos.get(photo.id);
      return { thumb: local?.thumb ?? null, image: local?.image ?? null, imageUrl: photo.imageUrl, thumbUrl: photo.thumbUrl };
    },
  };
}
