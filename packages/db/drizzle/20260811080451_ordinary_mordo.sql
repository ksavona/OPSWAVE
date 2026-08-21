CREATE TABLE "opsweave"."task_intake_origins" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"draft_id" uuid NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"source_span" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_intake_origins_confidence_range" CHECK ("opsweave"."task_intake_origins"."confidence" >= 0 and "opsweave"."task_intake_origins"."confidence" <= 1)
);
--> statement-breakpoint
ALTER TABLE "opsweave"."task_intake_origins" ADD CONSTRAINT "task_intake_origins_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_intake_origins" ADD CONSTRAINT "task_intake_origins_draft_id_intake_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "opsweave"."intake_drafts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_intake_origins_draft_idx" ON "opsweave"."task_intake_origins" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "intake_sources_workspace_fingerprint_idx" ON "opsweave"."intake_sources" USING btree ("workspace_id","content_fingerprint","created_at");