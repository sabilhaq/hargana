CREATE TABLE "unknown_barcodes" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" text NOT NULL,
	"data" jsonb NOT NULL,
	"region_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "unknown_barcodes_region_id_seq_index" ON "unknown_barcodes" USING btree ("region_id","seq");