import type { SyncTransport } from "@/core";

/** The session is gone: sync needs a fresh login. */
export class SignedOutError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 401) throw new SignedOutError();
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
}

/** The sync API over HTTP. */
export const httpTransport: SyncTransport = {
  push: (batch) => post("/api/sync/push", batch),
  pull: (request) => post("/api/sync/pull", request),
};
