CREATE TABLE "opsweave"."compliance_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_event_id" uuid NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"safe_error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_jobs_state" CHECK ("opsweave"."compliance_jobs"."state" in ('pending','processing','completed','failed'))
);
--> statement-breakpoint
ALTER TABLE "opsweave"."compliance_jobs" ADD CONSTRAINT "compliance_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."compliance_jobs" ADD CONSTRAINT "compliance_jobs_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "opsweave"."audit_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_jobs_audit_event_idx" ON "opsweave"."compliance_jobs" USING btree ("audit_event_id");--> statement-breakpoint
CREATE INDEX "compliance_jobs_claim_idx" ON "opsweave"."compliance_jobs" USING btree ("state","next_attempt_at");