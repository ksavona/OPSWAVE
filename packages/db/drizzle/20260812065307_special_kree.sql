ALTER TABLE "opsweave"."owners" ADD COLUMN "full_name" varchar(200);--> statement-breakpoint
ALTER TABLE "opsweave"."owners" ADD COLUMN "known_as" text[] DEFAULT ARRAY[]::text[] NOT NULL;