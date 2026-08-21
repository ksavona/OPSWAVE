CREATE TABLE "opsweave"."entity_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"dependent_type" varchar(16) NOT NULL,
	"dependent_id" uuid NOT NULL,
	"blocker_type" varchar(16) NOT NULL,
	"blocker_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_dependencies_types_valid" CHECK ("opsweave"."entity_dependencies"."dependent_type" in ('task','project') and "opsweave"."entity_dependencies"."blocker_type" in ('task','project')),
	CONSTRAINT "entity_dependencies_not_self" CHECK ("opsweave"."entity_dependencies"."dependent_type" <> "opsweave"."entity_dependencies"."blocker_type" or "opsweave"."entity_dependencies"."dependent_id" <> "opsweave"."entity_dependencies"."blocker_id")
);
--> statement-breakpoint
ALTER TABLE "opsweave"."entity_dependencies" ADD CONSTRAINT "entity_dependencies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "opsweave"."entity_dependencies"
  ("workspace_id","dependent_type","dependent_id","blocker_type","blocker_id","created_at","updated_at")
SELECT task."workspace_id",'task',dependency."task_id",'task',dependency."depends_on_task_id",
  dependency."created_at",dependency."updated_at"
FROM "opsweave"."task_dependencies" dependency
JOIN "opsweave"."tasks" task ON task."id"=dependency."task_id";--> statement-breakpoint
INSERT INTO "opsweave"."entity_dependencies"
  ("workspace_id","dependent_type","dependent_id","blocker_type","blocker_id","created_at","updated_at")
SELECT project."workspace_id",'project',dependency."project_id",'project',dependency."depends_on_project_id",
  dependency."created_at",dependency."updated_at"
FROM "opsweave"."project_dependencies" dependency
JOIN "opsweave"."projects" project ON project."id"=dependency."project_id";--> statement-breakpoint
CREATE UNIQUE INDEX "entity_dependencies_unique_idx" ON "opsweave"."entity_dependencies" USING btree ("workspace_id","dependent_type","dependent_id","blocker_type","blocker_id");--> statement-breakpoint
CREATE INDEX "entity_dependencies_dependent_idx" ON "opsweave"."entity_dependencies" USING btree ("workspace_id","dependent_type","dependent_id");--> statement-breakpoint
CREATE INDEX "entity_dependencies_blocker_idx" ON "opsweave"."entity_dependencies" USING btree ("workspace_id","blocker_type","blocker_id");
