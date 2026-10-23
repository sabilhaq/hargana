import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DatabaseInUseError, lockDatabase } from "./lock";

const folder = () => mkdtempSync(path.join(tmpdir(), "hargana-lock-"));

describe("the local database lock", () => {
  it("lets one process in, refuses a second live one, and frees on release", () => {
    const dir = folder();
    const release = lockDatabase(dir);

    // Another live process: the parent of this test run.
    expect(() => lockDatabase(dir, process.ppid)).toThrow(DatabaseInUseError);
    expect(lockDatabase(dir)).toBeTypeOf("function"); // the holder may open it again (hot reload)

    release();
    const theirs = lockDatabase(dir, process.ppid);
    expect(() => lockDatabase(dir)).toThrow(/already open in process/);
    theirs();
  });

  it("takes over a lock left by a process that is gone", () => {
    const dir = folder();
    writeFileSync(path.join(dir, ".hargana.lock"), "999999"); // no such process

    const release = lockDatabase(dir);

    expect(() => lockDatabase(dir, process.ppid)).toThrow(DatabaseInUseError);
    release();
  });
});
