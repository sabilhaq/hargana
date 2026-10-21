import { describe, expect, it } from "vitest";
import { testCore } from "./testing";

describe("core status", () => {
  it("starts with an empty catalog and nothing waiting to sync", async () => {
    const { core } = testCore();

    expect(await core.status()).toEqual({ itemCount: 0, pendingSyncCount: 0 });
  });
});
