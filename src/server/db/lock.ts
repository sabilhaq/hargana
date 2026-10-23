import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Only one process may open the on-disk PGlite database: two at once (a dev
 * server and a script, or several build workers) corrupt it. The lock is a
 * file holding the owner's process id; a lock left by a process that is gone
 * is taken over.
 */
export class DatabaseInUseError extends Error {
  constructor(
    readonly dir: string,
    readonly pid: number,
  ) {
    super(
      `The local database in ${dir} is already open in process ${pid} (probably the dev server). ` +
        `Stop it before running this, or set PGLITE_DIR to use another folder.`,
    );
  }
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** Takes the lock on `dir` for this process; returns a function that releases it. */
export function lockDatabase(dir: string, pid = process.pid): () => void {
  const file = path.join(dir, ".hargana.lock");
  for (;;) {
    try {
      writeFileSync(file, String(pid), { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const holder = Number(readFileSync(file, "utf8"));
      if (holder === pid) break;
      if (holder && isAlive(holder)) throw new DatabaseInUseError(dir, holder);
      rmSync(file, { force: true }); // stale: its process is gone
    }
  }
  return () => {
    try {
      if (Number(readFileSync(file, "utf8")) === pid) rmSync(file, { force: true });
    } catch {
      // Already gone.
    }
  };
}
