import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_PHOTO_BYTES, MAX_THUMB_BYTES, type PhotoUrls } from "@/core";

/** Where photo files live. Paths are like "photos/<id>.jpg". */
export type PhotoStore = {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(pathname: string): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array; contentType: string } | null>;
};

type Session = (request: Request) => Promise<unknown>;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(-thumb)?\.jpg$/;

export const photoUrl = (name: string) => `/api/photos/${name}`;

/**
 * Upload (POST multipart: id, image, thumb) and serve (GET by file name).
 * Both need a session; photos are private, served only through the app.
 */
export function createPhotoHandlers({ store, session }: { store: PhotoStore; session: Session }) {
  const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
  const bad = (error: string) => Response.json({ error }, { status: 400 });

  return {
    async upload(request: Request) {
      if (!(await session(request))) return unauthorized();
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return bad("expected multipart form data");
      }
      const id = form.get("id");
      const image = form.get("image");
      const thumb = form.get("thumb");
      if (typeof id !== "string" || !ID.test(id)) return bad("id must be a UUID");
      if (!(image instanceof Blob) || !(thumb instanceof Blob)) return bad("image and thumb are required");
      if (image.type !== "image/jpeg" || thumb.type !== "image/jpeg") return bad("photos must be JPEG");
      if (image.size > MAX_PHOTO_BYTES || thumb.size > MAX_THUMB_BYTES) return bad("photo is too large");

      // Same id, same files: uploading again just replaces them.
      await store.put(`photos/${id}.jpg`, new Uint8Array(await image.arrayBuffer()), "image/jpeg");
      await store.put(`photos/${id}-thumb.jpg`, new Uint8Array(await thumb.arrayBuffer()), "image/jpeg");
      const urls: PhotoUrls = { imageUrl: photoUrl(`${id}.jpg`), thumbUrl: photoUrl(`${id}-thumb.jpg`) };
      return Response.json(urls);
    },

    async serve(request: Request, name: string) {
      if (!(await session(request))) return unauthorized();
      if (!FILE.test(name)) return new Response(null, { status: 404 });
      const file = await store.get(`photos/${name}`);
      if (!file) return new Response(null, { status: 404 });
      return new Response(file.body as BodyInit, {
        // A photo id is never reused, so its files never change.
        headers: { "content-type": file.contentType, "cache-control": "private, max-age=31536000, immutable" },
      });
    },
  };
}

/** Files on disk, for local development without Vercel Blob. */
export function diskPhotoStore(dir: string): PhotoStore {
  return {
    async put(pathname, bytes) {
      const file = path.join(dir, pathname);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    },
    async get(pathname) {
      try {
        return { body: new Uint8Array(await readFile(path.join(dir, pathname))), contentType: "image/jpeg" };
      } catch {
        return null;
      }
    },
  };
}

export function memoryPhotoStore(): PhotoStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async put(pathname, bytes) {
      files.set(pathname, bytes);
    },
    async get(pathname) {
      const body = files.get(pathname);
      return body ? { body, contentType: "image/jpeg" } : null;
    },
  };
}
