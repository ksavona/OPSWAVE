UPDATE "opsweave"."tasks" SET "hours_spent"=0 WHERE "hours_spent" IS NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ALTER COLUMN "hours_spent" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ALTER COLUMN "hours_spent" SET NOT NULL;
--> statement-breakpoint
UPDATE "opsweave"."tasks"
SET "size"=CASE
  WHEN greatest(coalesce("allocated_hours",0)-"hours_spent",0)<=0.5 THEN 'small'
  WHEN greatest(coalesce("allocated_hours",0)-"hours_spent",0)<=1 THEN 'medium'
  WHEN greatest(coalesce("allocated_hours",0)-"hours_spent",0)<=2 THEN 'large'
  ELSE 'mega'
END
WHERE NOT "size_manual_override" AND "allocated_hours" IS NOT NULL;--> statement-breakpoint
UPDATE "opsweave"."tasks" task
SET "requires_breakdown"=(coalesce(task."size"='mega',false) AND NOT EXISTS (
  SELECT 1 FROM "opsweave"."task_checklist_items" item WHERE item."task_id"=task."id"
));
