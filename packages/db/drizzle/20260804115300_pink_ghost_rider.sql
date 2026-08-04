CREATE TABLE "opsweave"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_owner_id" uuid,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(64) NOT NULL,
	"target_id" varchar(100),
	"correlation_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opsweave"."delegates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opsweave"."encrypted_provider_credentials" (
	"workspace_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"algorithm" varchar(32) NOT NULL,
	"ciphertext" text NOT NULL,
	"authentication_tag" text NOT NULL,
	"initialization_vector" text NOT NULL,
	"envelope_version" integer NOT NULL,
	"key_version" integer NOT NULL,
	"verification_status" varchar(32) DEFAULT 'unverified' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encrypted_provider_credentials_workspace_id_provider_pk" PRIMARY KEY("workspace_id","provider"),
	CONSTRAINT "provider_credentials_envelope_version" CHECK ("opsweave"."encrypted_provider_credentials"."envelope_version" > 0),
	CONSTRAINT "provider_credentials_key_version" CHECK ("opsweave"."encrypted_provider_credentials"."key_version" > 0),
	CONSTRAINT "provider_credentials_verification_status" CHECK ("opsweave"."encrypted_provider_credentials"."verification_status" in ('unverified', 'verified', 'invalid', 'unavailable', 'configuration_error'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_signal_digest" varchar(64) NOT NULL,
	"network_signal_digest" varchar(64) NOT NULL,
	"outcome" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "login_attempts_outcome" CHECK ("opsweave"."login_attempts"."outcome" in ('failed', 'succeeded', 'limited'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."owner_credentials" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"password_algorithm" varchar(32) NOT NULL,
	"password_parameters" jsonb NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_credentials_version_positive" CHECK ("opsweave"."owner_credentials"."credential_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"username" varchar(64) NOT NULL,
	"normalized_username" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opsweave"."planning_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"status" varchar(32) NOT NULL,
	"settings_version" integer NOT NULL,
	"settings_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_runs_kind" CHECK ("opsweave"."planning_runs"."kind" in ('weekly', 'daily', 'preview')),
	CONSTRAINT "planning_runs_status" CHECK ("opsweave"."planning_runs"."status" in ('completed', 'no_capacity', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opsweave"."rate_limit_counters" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"expire" bigint
);
--> statement-breakpoint
CREATE TABLE "opsweave"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"recent_authenticated_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_absolute_after_creation" CHECK ("opsweave"."sessions"."absolute_expires_at" > "opsweave"."sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "opsweave"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"title" varchar(300) NOT NULL,
	"workflow_lane" varchar(32) DEFAULT 'inbox' NOT NULL,
	"business_value_score" integer,
	"business_value_rationale" text,
	"value_source" varchar(16),
	"value_updated_at" timestamp with time zone,
	"manual_lane_position" numeric(20, 6) DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_business_value_range" CHECK ("opsweave"."tasks"."business_value_score" is null or ("opsweave"."tasks"."business_value_score" between 1 and 100)),
	CONSTRAINT "tasks_value_source" CHECK ("opsweave"."tasks"."value_source" is null or "opsweave"."tasks"."value_source" in ('owner', 'ai', 'import'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."trash_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opsweave"."workspace_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"date_display" varchar(16) DEFAULT 'iso' NOT NULL,
	"default_kanban_sort" varchar(32) DEFAULT 'manual' NOT NULL,
	"default_landing_view" varchar(32) DEFAULT 'projects' NOT NULL,
	"first_day_of_week" varchar(16) DEFAULT 'monday' NOT NULL,
	"planning_buffer_percent" numeric(5, 2) DEFAULT 10 NOT NULL,
	"deadline_risk_horizon_days" integer DEFAULT 14 NOT NULL,
	"daily_large_quota" integer DEFAULT 1 NOT NULL,
	"daily_medium_quota" integer DEFAULT 2 NOT NULL,
	"daily_small_quota" integer DEFAULT 3 NOT NULL,
	"allow_missing_size_substitution" boolean DEFAULT true NOT NULL,
	"allow_final_task_overflow" boolean DEFAULT false NOT NULL,
	"manual_today_carryover" boolean DEFAULT true NOT NULL,
	"daily_buffer_enabled" boolean DEFAULT false NOT NULL,
	"ai_extraction_enabled" boolean DEFAULT false NOT NULL,
	"ai_tie_breaking_enabled" boolean DEFAULT false NOT NULL,
	"business_value_influence_enabled" boolean DEFAULT false NOT NULL,
	"weekly_automation_enabled" boolean DEFAULT false NOT NULL,
	"daily_automation_enabled" boolean DEFAULT false NOT NULL,
	"extraction_model" varchar(100) DEFAULT 'gpt-5.6-sol' NOT NULL,
	"prioritization_model" varchar(100) DEFAULT 'gpt-5.6-sol' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_settings_version_positive" CHECK ("opsweave"."workspace_settings"."version" > 0),
	CONSTRAINT "workspace_settings_buffer_range" CHECK ("opsweave"."workspace_settings"."planning_buffer_percent" >= 0 and "opsweave"."workspace_settings"."planning_buffer_percent" <= 50),
	CONSTRAINT "workspace_settings_horizon_range" CHECK ("opsweave"."workspace_settings"."deadline_risk_horizon_days" >= 1 and "opsweave"."workspace_settings"."deadline_risk_horizon_days" <= 90),
	CONSTRAINT "workspace_settings_quota_ranges" CHECK ("opsweave"."workspace_settings"."daily_large_quota" between 0 and 20 and "opsweave"."workspace_settings"."daily_medium_quota" between 0 and 20 and "opsweave"."workspace_settings"."daily_small_quota" between 0 and 20),
	CONSTRAINT "workspace_settings_first_day" CHECK ("opsweave"."workspace_settings"."first_day_of_week" = 'monday'),
	CONSTRAINT "workspace_settings_date_display" CHECK ("opsweave"."workspace_settings"."date_display" in ('iso', 'locale')),
	CONSTRAINT "workspace_settings_kanban_sort" CHECK ("opsweave"."workspace_settings"."default_kanban_sort" in ('manual', 'planning_priority', 'greatest_value'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."workspace_working_hours" (
	"workspace_id" uuid NOT NULL,
	"weekday" varchar(16) NOT NULL,
	"enabled" boolean NOT NULL,
	"available_hours" numeric(5, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_working_hours_workspace_id_weekday_pk" PRIMARY KEY("workspace_id","weekday"),
	CONSTRAINT "workspace_working_hours_weekday" CHECK ("opsweave"."workspace_working_hours"."weekday" in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
	CONSTRAINT "workspace_working_hours_range" CHECK ("opsweave"."workspace_working_hours"."available_hours" >= 0 and "opsweave"."workspace_working_hours"."available_hours" <= 24)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_version_positive" CHECK ("opsweave"."workspaces"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD CONSTRAINT "audit_events_actor_owner_id_owners_id_fk" FOREIGN KEY ("actor_owner_id") REFERENCES "opsweave"."owners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegates" ADD CONSTRAINT "delegates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."encrypted_provider_credentials" ADD CONSTRAINT "encrypted_provider_credentials_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."owner_credentials" ADD CONSTRAINT "owner_credentials_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "opsweave"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."owners" ADD CONSTRAINT "owners_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."planning_runs" ADD CONSTRAINT "planning_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ADD CONSTRAINT "sessions_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "opsweave"."owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "opsweave"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."trash_records" ADD CONSTRAINT "trash_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_working_hours" ADD CONSTRAINT "workspace_working_hours_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_workspace_created_idx" ON "opsweave"."audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "opsweave"."audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "delegates_workspace_idx" ON "opsweave"."delegates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "login_attempts_expiry_idx" ON "opsweave"."login_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "owners_single_owner_per_workspace_idx" ON "opsweave"."owners" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owners_normalized_username_idx" ON "opsweave"."owners" USING btree ("normalized_username");--> statement-breakpoint
CREATE INDEX "planning_runs_workspace_created_idx" ON "opsweave"."planning_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "projects_workspace_idx" ON "opsweave"."projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_digest_idx" ON "opsweave"."sessions" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "sessions_owner_active_idx" ON "opsweave"."sessions" USING btree ("owner_id","revoked_at","absolute_expires_at");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "opsweave"."sessions" USING btree ("absolute_expires_at","idle_expires_at");--> statement-breakpoint
CREATE INDEX "tasks_workspace_lane_position_idx" ON "opsweave"."tasks" USING btree ("workspace_id","workflow_lane","manual_lane_position");--> statement-breakpoint
CREATE INDEX "tasks_workspace_value_idx" ON "opsweave"."tasks" USING btree ("workspace_id","workflow_lane","business_value_score");--> statement-breakpoint
CREATE UNIQUE INDEX "trash_records_entity_idx" ON "opsweave"."trash_records" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "trash_records_purge_idx" ON "opsweave"."trash_records" USING btree ("purge_after");