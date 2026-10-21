import "fake-indexeddb/auto";
import { createCore } from ".";
import type { Clock } from "./clock";
import { HarganaStorage } from "./storage";

export type FakeClock = Clock & { set(iso: string): void; advance(ms: number): void };

export function fakeClock(start = "2026-01-01T08:00:00+07:00"): FakeClock {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set: (iso) => (current = new Date(iso)),
    advance: (ms) => (current = new Date(current.getTime() + ms)),
  };
}

let counter = 0;

/** A core over a fresh in-memory database and a controllable clock. */
export function testCore() {
  const storage = new HarganaStorage(`hargana-test-${++counter}`);
  const clock = fakeClock();
  return { core: createCore({ storage, clock }), storage, clock };
}
