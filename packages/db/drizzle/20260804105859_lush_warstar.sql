CREATE SCHEMA "opsweave";
--> statement-breakpoint
CREATE TABLE "opsweave"."system_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "system_metadata_updated_at_idx" ON "opsweave"."system_metadata" USING btree ("updated_at");