CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chains" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" text NOT NULL,
	"data" jsonb NOT NULL,
	"region_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_aliases" (
	"from_id" text PRIMARY KEY NOT NULL,
	"to_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" text NOT NULL,
	"data" jsonb NOT NULL,
	"barcode" text
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" text NOT NULL,
	"data" jsonb NOT NULL,
	"region_id" text NOT NULL,
	"item_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" text NOT NULL,
	"data" jsonb NOT NULL,
	"region_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "categories_seq_index" ON "categories" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "chains_region_id_seq_index" ON "chains" USING btree ("region_id","seq");--> statement-breakpoint
CREATE INDEX "items_seq_index" ON "items" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "items_barcode_index" ON "items" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "observations_region_id_seq_index" ON "observations" USING btree ("region_id","seq");--> statement-breakpoint
CREATE INDEX "observations_item_id_index" ON "observations" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "regions_seq_index" ON "regions" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "stores_region_id_seq_index" ON "stores" USING btree ("region_id","seq");