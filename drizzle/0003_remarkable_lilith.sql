CREATE TABLE "price_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" text NOT NULL,
	"data" jsonb NOT NULL,
	"region_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "price_corrections_region_id_seq_index" ON "price_corrections" USING btree ("region_id","seq");