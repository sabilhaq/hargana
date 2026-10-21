import type { SyncTransport } from "@/core";

/** The session is gone: sync needs a fresh login. */
export class SignedOutError extends Error {}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  if (response.status === 401) throw new SignedOutError();
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  return (await request(path, init)).json();
}

/** The sync API over HTTP. */
export const httpTransport: SyncTransport = {
  push: (batch) => post("/api/sync/push", batch),
  pull: (pullRequest) => post("/api/sync/pull", pullRequest),
  async uploadPhoto({ id, image, thumb }) {
    const form = new FormData();
    form.set("id", id);
    form.set("image", new Blob([image], { type: "image/jpeg" }));
    form.set("thumb", new Blob([thumb], { type: "image/jpeg" }));
    return (await request("/api/photos", { method: "POST", body: form })).json();
  },
  download: async (url) => (await request(url)).arrayBuffer(),
};
