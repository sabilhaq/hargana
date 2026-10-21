import { get, put } from "@vercel/blob";
import { auth } from "./auth";
import { createPhotoHandlers, diskPhotoStore, type PhotoStore } from "./photos";

/** Private Vercel Blob storage; configured by connecting a Blob store to the project. */
const blobPhotoStore: PhotoStore = {
  async put(pathname, bytes, contentType) {
    await put(pathname, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
  },
  async get(pathname) {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, contentType: result.blob.contentType };
  },
};

/** On Vercel the disk is read-only, so photos need Blob there. */
const unconfigured: PhotoStore = {
  put: () => Promise.reject(new Error("Photo storage is not configured: connect a Vercel Blob store to the project.")),
  get: async () => null,
};

const hasBlob = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

export const photoHandlers = createPhotoHandlers({
  store: hasBlob ? blobPhotoStore : process.env.VERCEL ? unconfigured : diskPhotoStore(".data"),
  session: (request) => auth.api.getSession({ headers: request.headers }),
});
