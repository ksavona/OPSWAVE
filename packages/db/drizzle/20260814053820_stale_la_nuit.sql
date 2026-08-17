ALTER TABLE "opsweave"."projects" ADD COLUMN "client_name" varchar(200);--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "priority_level" integer;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "status" varchar(32) DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "client_name" varchar(200);--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "priority_level" integer;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "status" varchar(32) DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD CONSTRAINT "projects_priority_level_range" CHECK ("opsweave"."projects"."priority_level" is null or ("opsweave"."projects"."priority_level" between 1 and 5));--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD CONSTRAINT "projects_status" CHECK ("opsweave"."projects"."status" in ('not_started', 'on_track', 'in_progress', 'on_hold', 'at_risk'));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_priority_level_range" CHECK ("opsweave"."tasks"."priority_level" is null or ("opsweave"."tasks"."priority_level" between 1 and 5));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_status" CHECK ("opsweave"."tasks"."status" in ('not_started', 'on_track', 'in_progress', 'on_hold', 'at_risk'));