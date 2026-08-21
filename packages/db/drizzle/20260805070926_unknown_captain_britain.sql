CREATE TABLE "opsweave"."project_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"llm_context" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_stages_version_positive" CHECK ("opsweave"."project_stages"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."task_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"label" varchar(500) NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_checklist_items_position_non_negative" CHECK ("opsweave"."task_checklist_items"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" DROP CONSTRAINT "tasks_value_source";--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "allocated_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "size" varchar(16);--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "value_add" text;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "work_description" text;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "definition_of_done" text;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "delegate_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
INSERT INTO "opsweave"."project_stages" ("workspace_id","name","sequence")
SELECT "id",'Planned',0 FROM "opsweave"."workspaces";--> statement-breakpoint
INSERT INTO "opsweave"."project_stages" ("workspace_id","name","sequence")
SELECT "id",'In progress',1 FROM "opsweave"."workspaces";--> statement-breakpoint
INSERT INTO "opsweave"."project_stages" ("workspace_id","name","sequence")
SELECT "id",'Done',2 FROM "opsweave"."workspaces";--> statement-breakpoint
UPDATE "opsweave"."projects" AS project SET "stage_id"=stage."id"
FROM "opsweave"."project_stages" AS stage
WHERE project."workspace_id"=stage."workspace_id" AND stage."name"='Planned';--> statement-breakpoint
ALTER TABLE "opsweave"."project_stages" ADD CONSTRAINT "project_stages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_stages_workspace_sequence_idx" ON "opsweave"."project_stages" USING btree ("workspace_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "project_stages_workspace_name_idx" ON "opsweave"."project_stages" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "task_checklist_items_position_idx" ON "opsweave"."task_checklist_items" USING btree ("task_id","position");--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD CONSTRAINT "projects_stage_id_project_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "opsweave"."project_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_delegate_id_delegates_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "opsweave"."delegates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_workspace_stage_idx" ON "opsweave"."projects" USING btree ("workspace_id","stage_id","created_at");--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_size" CHECK ("opsweave"."tasks"."size" is null or "opsweave"."tasks"."size" in ('small', 'medium', 'large'));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_workflow_lane" CHECK ("opsweave"."tasks"."workflow_lane" in ('inbox', 'this_week', 'today_1', 'today_2', 'today_3', 'in_focus', 'monitor_validate', 'waiting', 'delegated', 'done', 'cancelled'));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_allocated_hours_range" CHECK ("opsweave"."tasks"."allocated_hours" is null or ("opsweave"."tasks"."allocated_hours" >= 0 and "opsweave"."tasks"."allocated_hours" <= 10000));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_value_source" CHECK ("opsweave"."tasks"."value_source" is null or "opsweave"."tasks"."value_source" in ('owner', 'ai_proposed', 'imported'));
