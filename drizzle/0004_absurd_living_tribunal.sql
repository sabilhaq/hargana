ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'contributor' NOT NULL;--> statement-breakpoint
-- The account that existed first is the person who runs Hargana.
UPDATE "user" SET "role" = 'owner' WHERE "id" = (SELECT "id" FROM "user" ORDER BY "created_at" LIMIT 1);
