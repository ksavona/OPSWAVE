CREATE TABLE "opsweave"."learning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" varchar(64) NOT NULL,
	"summary" text NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"source_entity_type" varchar(32),
	"source_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opsweave"."project_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"depends_on_project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_dependencies_not_self" CHECK ("opsweave"."project_dependencies"."project_id" <> "opsweave"."project_dependencies"."depends_on_project_id")
);
--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" DROP CONSTRAINT "tasks_workflow_lane";--> statement-breakpoint
UPDATE "opsweave"."tasks" SET "workflow_lane"='today'
WHERE "workflow_lane" IN ('today_1','today_2','today_3');--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "notes" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "priority" integer;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "llm_link" varchar(2048);--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "hours_spent" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "notes" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opsweave"."learning_events" ADD CONSTRAINT "learning_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."project_dependencies" ADD CONSTRAINT "project_dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "opsweave"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."project_dependencies" ADD CONSTRAINT "project_dependencies_depends_on_project_id_projects_id_fk" FOREIGN KEY ("depends_on_project_id") REFERENCES "opsweave"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_events_workspace_created_idx" ON "opsweave"."learning_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "learning_events_workspace_kind_idx" ON "opsweave"."learning_events" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "project_dependencies_unique_idx" ON "opsweave"."project_dependencies" USING btree ("project_id","depends_on_project_id");--> statement-breakpoint
CREATE INDEX "project_dependencies_depends_on_idx" ON "opsweave"."project_dependencies" USING btree ("depends_on_project_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_project_idx" ON "opsweave"."tasks" USING btree ("workspace_id","project_id","deleted_at");--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD CONSTRAINT "projects_priority_range" CHECK ("opsweave"."projects"."priority" is null or ("opsweave"."projects"."priority" between 1 and 100));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_hours_spent_range" CHECK ("opsweave"."tasks"."hours_spent" is null or ("opsweave"."tasks"."hours_spent" >= 0 and "opsweave"."tasks"."hours_spent" <= 10000));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_date_order" CHECK ("opsweave"."tasks"."start_date" is null or "opsweave"."tasks"."due_date" is null or "opsweave"."tasks"."start_date" <= "opsweave"."tasks"."due_date");--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_workflow_lane" CHECK ("opsweave"."tasks"."workflow_lane" in ('inbox', 'this_week', 'today', 'in_focus', 'monitor_validate', 'waiting', 'delegated', 'done', 'cancelled'));
