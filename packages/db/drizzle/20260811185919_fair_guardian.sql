ALTER TABLE "opsweave"."workspace_settings" DROP CONSTRAINT "workspace_settings_kanban_sort";--> statement-breakpoint
ALTER TABLE "opsweave"."intake_drafts" ADD COLUMN "approval_result" jsonb;--> statement-breakpoint
ALTER TABLE "opsweave"."intake_sources" ADD COLUMN "selected_project_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."intake_sources" ADD COLUMN "create_new_projects" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "start_time" time;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "end_time" time;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_working_hours" ADD COLUMN "start_time" time DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_working_hours" ADD COLUMN "end_time" time DEFAULT '17:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_settings" ADD CONSTRAINT "workspace_settings_kanban_sort" CHECK ("opsweave"."workspace_settings"."default_kanban_sort" in ('manual', 'planning_priority', 'greatest_value', 'dependency'));--> statement-breakpoint
INSERT INTO "opsweave"."project_stages" ("workspace_id","name","description","sequence")
SELECT workspace.id,'Cancelled','Projects intentionally stopped without completion',
  coalesce((SELECT max(stage.sequence)+1 FROM "opsweave"."project_stages" stage WHERE stage.workspace_id=workspace.id),0)
FROM "opsweave"."workspaces" workspace
WHERE NOT EXISTS (
  SELECT 1 FROM "opsweave"."project_stages" stage
  WHERE stage.workspace_id=workspace.id AND lower(stage.name)='cancelled'
);
