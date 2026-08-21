CREATE TABLE "opsweave"."attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"entity_id" uuid NOT NULL,
	"original_name" varchar(500) NOT NULL,
	"storage_key" varchar(100) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"byte_size" bigint NOT NULL,
	"purge_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_entity_type" CHECK ("opsweave"."attachments"."entity_type" in ('task','project')),
	CONSTRAINT "attachments_byte_size_positive" CHECK ("opsweave"."attachments"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."task_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"description" text NOT NULL,
	"hours" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_time_entries_hours_range" CHECK ("opsweave"."task_time_entries"."hours" > 0 and "opsweave"."task_time_entries"."hours" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" DROP CONSTRAINT "tasks_size";--> statement-breakpoint
ALTER TABLE "opsweave"."task_checklist_items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "opsweave"."task_checklist_items" ADD COLUMN "predicted_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "origin" text;--> statement-breakpoint
INSERT INTO "opsweave"."task_time_entries" ("task_id","entry_date","description","hours")
SELECT "id",coalesce("start_date",current_date),'Imported existing hours',"hours_spent"
FROM "opsweave"."tasks" WHERE "hours_spent" > 0;--> statement-breakpoint
UPDATE "opsweave"."tasks" SET "size"=CASE
  WHEN "allocated_hours" IS NULL THEN NULL
  WHEN "allocated_hours" <= 0.5 THEN 'small'
  WHEN "allocated_hours" <= 2 THEN 'medium'
  WHEN "allocated_hours" <= 4 THEN 'large'
  ELSE 'mega' END;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD CONSTRAINT "attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD CONSTRAINT "task_time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_storage_key_idx" ON "opsweave"."attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "opsweave"."attachments" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "attachments_purge_after_idx" ON "opsweave"."attachments" USING btree ("purge_after");--> statement-breakpoint
CREATE INDEX "task_time_entries_task_date_idx" ON "opsweave"."task_time_entries" USING btree ("task_id","entry_date","created_at");--> statement-breakpoint
ALTER TABLE "opsweave"."task_checklist_items" ADD CONSTRAINT "task_checklist_items_predicted_hours_range" CHECK ("opsweave"."task_checklist_items"."predicted_hours" is null or ("opsweave"."task_checklist_items"."predicted_hours" >= 0 and "opsweave"."task_checklist_items"."predicted_hours" <= 10000));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_size" CHECK ("opsweave"."tasks"."size" is null or "opsweave"."tasks"."size" in ('small', 'medium', 'large', 'mega'));
