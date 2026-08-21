ALTER TABLE "opsweave"."planning_runs" DROP CONSTRAINT "planning_runs_kind";--> statement-breakpoint
UPDATE "opsweave"."projects"
SET "priority_level" = LEAST(5, GREATEST(1, CEIL("priority"::numeric / 20)::integer))
WHERE "priority_level" IS NULL AND "priority" IS NOT NULL;--> statement-breakpoint
UPDATE "opsweave"."intake_drafts" AS draft
SET "proposal" = jsonb_set(
  draft."proposal",
  '{projects}',
  COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN project ? 'priority' THEN
            (project - 'priority') || jsonb_build_object(
              'priorityLevel',
              LEAST(5, GREATEST(1, CEIL((project->>'priority')::numeric / 20)::integer))
            )
          ELSE project
        END
      )
      FROM jsonb_array_elements(draft."proposal"->'projects') AS project
    ),
    '[]'::jsonb
  )
)
WHERE jsonb_typeof(draft."proposal"->'projects') = 'array';--> statement-breakpoint
UPDATE "opsweave"."workspace_settings"
SET "weekly_automation_enabled" = true, "daily_automation_enabled" = true,
    "ai_tie_breaking_enabled" = true,
    "updated_at" = now();--> statement-breakpoint
ALTER TABLE "opsweave"."projects" DROP CONSTRAINT "projects_priority_range";--> statement-breakpoint
ALTER TABLE "opsweave"."planning_runs" ALTER COLUMN "kind" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_settings" ALTER COLUMN "weekly_automation_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_settings" ALTER COLUMN "daily_automation_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_settings" ALTER COLUMN "ai_tie_breaking_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "opsweave"."planning_runs" ADD COLUMN "scheduled_for" date;--> statement-breakpoint
CREATE UNIQUE INDEX "planning_runs_workspace_kind_date_idx" ON "opsweave"."planning_runs" USING btree ("workspace_id","kind","scheduled_for");--> statement-breakpoint
ALTER TABLE "opsweave"."projects" DROP COLUMN "priority";--> statement-breakpoint
ALTER TABLE "opsweave"."planning_runs" ADD CONSTRAINT "planning_runs_kind" CHECK ("opsweave"."planning_runs"."kind" in ('weekly', 'daily', 'preview', 'weekly_selection', 'daily_rollover', 'daily_selection'));
