import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";

// `--production-only` (used by the Vercel build) migrates only when Vercel is
// building for production: previews share the production database and must
// not change it before their code is merged.
async function main() {
  if (process.argv.includes("--production-only") && process.env.VERCEL_ENV !== "production") {
    console.log(`Migrations skipped (${process.env.VERCEL_ENV ?? "not on Vercel"}).`);
    return;
  }
  const { database } = await import("@/server/db");
  const migrationsFolder = "./drizzle";
  if (database.kind === "neon") await migrateNeon(database.db, { migrationsFolder });
  else await migratePglite(database.db, { migrationsFolder });
  console.log(`Migrations applied (${database.kind}).`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
