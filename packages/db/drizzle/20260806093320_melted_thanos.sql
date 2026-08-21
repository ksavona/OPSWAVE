CREATE TABLE "opsweave"."intake_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"proposal" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'review_required' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_drafts_status" CHECK ("opsweave"."intake_drafts"."status" in ('review_required', 'approved', 'declined', 'trashed'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."intake_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"schema_version" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"safe_error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_runs_status" CHECK ("opsweave"."intake_runs"."status" in ('queued', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."intake_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"content" text NOT NULL,
	"content_fingerprint" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_sources_type" CHECK ("opsweave"."intake_sources"."source_type" in ('instruction', 'meeting_note', 'other_text', 'transcript')),
	CONSTRAINT "intake_sources_status" CHECK ("opsweave"."intake_sources"."status" in ('queued', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "opsweave"."intake_drafts" ADD CONSTRAINT "intake_drafts_run_id_intake_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "opsweave"."intake_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."intake_runs" ADD CONSTRAINT "intake_runs_source_id_intake_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "opsweave"."intake_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."intake_sources" ADD CONSTRAINT "intake_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intake_drafts_run_idx" ON "opsweave"."intake_drafts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "intake_runs_source_created_idx" ON "opsweave"."intake_runs" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "intake_sources_workspace_created_idx" ON "opsweave"."intake_sources" USING btree ("workspace_id","created_at");