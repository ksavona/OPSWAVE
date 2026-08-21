ALTER TABLE "opsweave"."tasks" ADD COLUMN "size_manual_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "planning_eligible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "schedule_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "requires_breakdown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "planned_date" date;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "planned_start_time" time;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "planned_end_time" time;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "planning_score" integer;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "planning_rationale" text;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "last_planned_by" varchar(32);--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "last_planned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tasks_workspace_planning_idx" ON "opsweave"."tasks" USING btree ("workspace_id","planning_eligible","schedule_locked","workflow_lane","planning_score");--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_planning_score_range" CHECK ("opsweave"."tasks"."planning_score" is null or ("opsweave"."tasks"."planning_score" between 0 and 100));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_last_planned_by" CHECK ("opsweave"."tasks"."last_planned_by" is null or "opsweave"."tasks"."last_planned_by" in ('automation', 'llm', 'user'));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_planned_time_order" CHECK ("opsweave"."tasks"."planned_start_time" is null or "opsweave"."tasks"."planned_end_time" is null or "opsweave"."tasks"."planned_start_time" <= "opsweave"."tasks"."planned_end_time");