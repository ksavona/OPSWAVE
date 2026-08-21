CREATE TABLE "opsweave"."task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_not_self" CHECK ("opsweave"."task_dependencies"."task_id" <> "opsweave"."task_dependencies"."depends_on_task_id")
);
--> statement-breakpoint
ALTER TABLE "opsweave"."task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_dependencies_unique_idx" ON "opsweave"."task_dependencies" USING btree ("task_id","depends_on_task_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_depends_on_idx" ON "opsweave"."task_dependencies" USING btree ("depends_on_task_id");