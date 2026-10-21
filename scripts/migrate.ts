import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { database } from "@/server/db";

async function main() {
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
