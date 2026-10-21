import { sql } from "drizzle-orm";
import { bigint, boolean, index, jsonb, pgSequence, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Better Auth core tables.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Hargana domain tables, written only through sync. Each row keeps the record
// as the device sent it (`data`) plus the columns sync filters on. `seq` comes
// from one sequence shared by all of them and is bumped on every change, so
// "changed since cursor N" is `seq > N` in every table.

export const syncSeq = pgSequence("sync_seq");

const synced = {
  id: text("id").primaryKey(),
  seq: bigint("seq", { mode: "number" })
    .notNull()
    .default(sql`nextval('sync_seq')`),
  /** The record's own ISO timestamp; the newer one wins. */
  updatedAt: text("updated_at").notNull(),
  data: jsonb("data").notNull(),
};

export const regions = pgTable("regions", synced, (t) => [index().on(t.seq)]);

export const categories = pgTable("categories", synced, (t) => [index().on(t.seq)]);

export const chains = pgTable("chains", { ...synced, regionId: text("region_id").notNull() }, (t) => [
  index().on(t.regionId, t.seq),
]);

export const stores = pgTable("stores", { ...synced, regionId: text("region_id").notNull() }, (t) => [
  index().on(t.regionId, t.seq),
]);

export const items = pgTable("items", { ...synced, barcode: text("barcode") }, (t) => [
  index().on(t.seq),
  uniqueIndex().on(t.barcode),
]);

/** Append-only: an observation never changes once stored. */
export const observations = pgTable(
  "observations",
  { ...synced, regionId: text("region_id").notNull(), itemId: text("item_id").notNull() },
  (t) => [index().on(t.regionId, t.seq), index().on(t.itemId)],
);

/** Item ids a device pushed for a barcode the server already had under another id. */
export const itemAliases = pgTable("item_aliases", {
  fromId: text("from_id").primaryKey(),
  toId: text("to_id").notNull(),
});
