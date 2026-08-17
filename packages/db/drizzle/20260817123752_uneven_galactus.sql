CREATE TABLE "opsweave"."access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_type" varchar(16) NOT NULL,
	"subject_project_id" uuid,
	"subject_task_id" uuid,
	"delegate_user_id" uuid,
	"delegate_email" varchar(320) NOT NULL,
	"normalized_delegate_email" varchar(320) NOT NULL,
	"scope" varchar(16) NOT NULL,
	"access_role" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'invite_pending' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"granted_by_user_id" uuid NOT NULL,
	"revoked_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"delegation_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grants_subject_type" CHECK ("opsweave"."access_grants"."subject_type" in ('project','task')),
	CONSTRAINT "access_grants_scope" CHECK ("opsweave"."access_grants"."scope" in ('project','task')),
	CONSTRAINT "access_grants_subject_matches_type" CHECK (("opsweave"."access_grants"."subject_type"='project' and "opsweave"."access_grants"."subject_project_id" is not null and "opsweave"."access_grants"."subject_task_id" is null and "opsweave"."access_grants"."scope"='project') or ("opsweave"."access_grants"."subject_type"='task' and "opsweave"."access_grants"."subject_task_id" is not null and "opsweave"."access_grants"."subject_project_id" is null and "opsweave"."access_grants"."scope"='task')),
	CONSTRAINT "access_grants_role" CHECK ("opsweave"."access_grants"."access_role" in ('contributor','project_collaborator','reviewer')),
	CONSTRAINT "access_grants_project_collaborator_scope" CHECK ("opsweave"."access_grants"."access_role"<>'project_collaborator' or "opsweave"."access_grants"."scope"='project'),
	CONSTRAINT "access_grants_status" CHECK ("opsweave"."access_grants"."status" in ('invite_pending','active','expired','declined','revoked')),
	CONSTRAINT "access_grants_version_positive" CHECK ("opsweave"."access_grants"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."activity_mentions" (
	"audit_event_id" uuid NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"display_alias_snapshot" varchar(100),
	CONSTRAINT "activity_mentions_audit_event_id_mentioned_user_id_pk" PRIMARY KEY("audit_event_id","mentioned_user_id")
);
--> statement-breakpoint
CREATE TABLE "opsweave"."activity_payloads" (
	"audit_event_id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"body" text NOT NULL,
	"delegate_safe_body" text,
	"content_status" varchar(16) DEFAULT 'approved' NOT NULL,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_payloads_kind" CHECK ("opsweave"."activity_payloads"."kind" in ('message','log_note')),
	CONSTRAINT "activity_payloads_content_status" CHECK ("opsweave"."activity_payloads"."content_status" in ('approved','quarantined','rejected'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."attachment_delegate_audience" (
	"attachment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"access_grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_delegate_audience_attachment_id_user_id_pk" PRIMARY KEY("attachment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "opsweave"."compliance_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_audit_event_id" uuid,
	"attachment_id" uuid,
	"subject_project_id" uuid,
	"subject_task_id" uuid,
	"delegate_user_id" uuid,
	"delegate_alias_snapshot" varchar(100),
	"risk_level" varchar(16) NOT NULL,
	"categories" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"evidence_reference" text,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"model" varchar(100),
	"provider" varchar(64),
	"prompt_version" varchar(64),
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"actioned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_flags_risk" CHECK ("opsweave"."compliance_flags"."risk_level" in ('low','medium','high')),
	CONSTRAINT "compliance_flags_status" CHECK ("opsweave"."compliance_flags"."status" in ('open','dismissed','warned','restricted','revoked')),
	CONSTRAINT "compliance_flags_source" CHECK (num_nonnulls("opsweave"."compliance_flags"."source_audit_event_id","opsweave"."compliance_flags"."attachment_id")>=1)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."delegate_entity_presentations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_project_id" uuid,
	"subject_task_id" uuid,
	"source_version" integer NOT NULL,
	"safe_title" varchar(300) NOT NULL,
	"safe_description" text,
	"safe_work_description" text,
	"safe_definition_of_done" text,
	"safe_notes" jsonb DEFAULT '{"type":"doc","content":[]}'::jsonb NOT NULL,
	"neutral_client_label" varchar(200),
	"neutral_project_label" varchar(200),
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegate_presentations_exact_subject" CHECK (num_nonnulls("opsweave"."delegate_entity_presentations"."subject_project_id","opsweave"."delegate_entity_presentations"."subject_task_id")=1),
	CONSTRAINT "delegate_presentations_status" CHECK ("opsweave"."delegate_entity_presentations"."status" in ('draft','approved','stale','blocked')),
	CONSTRAINT "delegate_presentations_versions_positive" CHECK ("opsweave"."delegate_entity_presentations"."source_version" > 0 and "opsweave"."delegate_entity_presentations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."delegate_kanban_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"semantic_kind" varchar(32) DEFAULT 'custom' NOT NULL,
	"color" varchar(32) DEFAULT '#5ee5b5' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegate_kanban_stages_kind" CHECK ("opsweave"."delegate_kanban_stages"."semantic_kind" in ('assigned','in_progress','waiting_for_input','ready_for_review','complete','custom')),
	CONSTRAINT "delegate_kanban_stages_version_positive" CHECK ("opsweave"."delegate_kanban_stages"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."delegate_task_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"task_assignment_id" uuid,
	"stage_id" uuid NOT NULL,
	"latest_update" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegate_task_states_version_positive" CHECK ("opsweave"."delegate_task_states"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."delegation_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"context_type" varchar(16) NOT NULL,
	"context_project_id" uuid,
	"context_task_id" uuid,
	"alias" varchar(100) NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegation_aliases_context_type" CHECK ("opsweave"."delegation_aliases"."context_type" in ('project','task')),
	CONSTRAINT "delegation_aliases_context_matches_type" CHECK (("opsweave"."delegation_aliases"."context_type"='project' and "opsweave"."delegation_aliases"."context_project_id" is not null and "opsweave"."delegation_aliases"."context_task_id" is null) or ("opsweave"."delegation_aliases"."context_type"='task' and "opsweave"."delegation_aliases"."context_task_id" is not null and "opsweave"."delegation_aliases"."context_project_id" is null))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."invitation_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_grant_id" uuid NOT NULL,
	"token_digest" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opsweave"."notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"notification_id" uuid,
	"invitation_token_id" uuid,
	"recipient_user_id" uuid,
	"recipient_email" varchar(320) NOT NULL,
	"channel" varchar(16) DEFAULT 'email' NOT NULL,
	"template_key" varchar(64) NOT NULL,
	"encrypted_payload" text,
	"idempotency_key" varchar(200) NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"safe_error" varchar(500),
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_channel" CHECK ("opsweave"."notification_outbox"."channel"='email'),
	CONSTRAINT "notification_outbox_state" CHECK ("opsweave"."notification_outbox"."state" in ('pending','processing','delivered','failed','cancelled')),
	CONSTRAINT "notification_outbox_reference" CHECK (num_nonnulls("opsweave"."notification_outbox"."notification_id","opsweave"."notification_outbox"."invitation_token_id")=1)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"source_audit_event_id" uuid,
	"type" varchar(64) NOT NULL,
	"state" varchar(16) DEFAULT 'unread' NOT NULL,
	"title" varchar(300) NOT NULL,
	"body" text,
	"route_type" varchar(32),
	"route_id" uuid,
	"idempotency_key" varchar(200) NOT NULL,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_state" CHECK ("opsweave"."notifications"."state" in ('unread','read','dismissed','cancelled')),
	CONSTRAINT "notifications_route_type" CHECK ("opsweave"."notifications"."route_type" is null or "opsweave"."notifications"."route_type" in ('project','task','delegations','notifications'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."protected_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"context_project_id" uuid,
	"context_task_id" uuid,
	"term_type" varchar(32) NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protected_terms_exact_context" CHECK (num_nonnulls("opsweave"."protected_terms"."context_project_id","opsweave"."protected_terms"."context_task_id")=1),
	CONSTRAINT "protected_terms_type" CHECK ("opsweave"."protected_terms"."term_type" in ('client','company','contact','email','phone','domain','url','social','other'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."task_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"access_grant_id" uuid,
	"assignment_role" varchar(16) DEFAULT 'delivery' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignments_role" CHECK ("opsweave"."task_assignments"."assignment_role" in ('delivery','review'))
);
--> statement-breakpoint
CREATE TABLE "opsweave"."task_delegate_audience" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_delegate_audience_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "opsweave"."user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"password_algorithm" varchar(32) NOT NULL,
	"password_parameters" jsonb NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_credentials_version_positive" CHECK ("opsweave"."user_credentials"."credential_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320),
	"normalized_email" varchar(320),
	"username" varchar(64),
	"normalized_username" varchar(64),
	"full_name" varchar(200),
	"status" varchar(32) DEFAULT 'invited' NOT NULL,
	"authorization_version" integer DEFAULT 1 NOT NULL,
	"deactivated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status" CHECK ("opsweave"."users"."status" in ('invited','active','deactivated','archived')),
	CONSTRAINT "users_authorization_version_positive" CHECK ("opsweave"."users"."authorization_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "opsweave"."workspace_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'invited' NOT NULL,
	"authorization_version" integer DEFAULT 1 NOT NULL,
	"activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"lifecycle_actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_memberships_role" CHECK ("opsweave"."workspace_memberships"."role" in ('owner','admin','delegate')),
	CONSTRAINT "workspace_memberships_status" CHECK ("opsweave"."workspace_memberships"."status" in ('invited','active','deactivated','archived')),
	CONSTRAINT "workspace_memberships_authorization_version_positive" CHECK ("opsweave"."workspace_memberships"."authorization_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "uploaded_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "visibility" varchar(32) DEFAULT 'internal_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "original_attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "delegate_safe_name" varchar(500);--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "approval_status" varchar(16) DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "scan_status" varchar(16) DEFAULT 'clean' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "quarantined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD COLUMN "content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD COLUMN "actor_alias_snapshot" varchar(100);--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD COLUMN "category" varchar(64) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD COLUMN "visibility" varchar(32) DEFAULT 'owner_admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD COLUMN "user_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD COLUMN "subject_project_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD COLUMN "subject_task_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD COLUMN "occurred_for_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."owners" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "anonymise_delegation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ADD COLUMN "membership_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ADD COLUMN "authorization_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."task_checklist_items" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."task_checklist_items" ADD COLUMN "delegate_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD COLUMN "access_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD COLUMN "actor_alias_snapshot" varchar(100);--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "anonymise_delegation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "delegate_visibility" varchar(32) DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "owner_work_assigned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD COLUMN "pre_delegation_lane" varchar(32);--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_settings" ADD COLUMN "multi_user_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_settings" ADD COLUMN "invitation_email_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_settings" ADD COLUMN "delegate_uploads_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_settings" ADD COLUMN "compliance_monitor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "opsweave"."users"
  (username,normalized_username,full_name,status,authorization_version,created_at,updated_at)
SELECT owner.username,owner.normalized_username,owner.full_name,'active',1,owner.created_at,now()
FROM "opsweave"."owners" owner;--> statement-breakpoint
UPDATE "opsweave"."owners" owner
SET user_id="user".id
FROM "opsweave"."users" "user"
WHERE "user".normalized_username=owner.normalized_username AND owner.user_id IS NULL;--> statement-breakpoint
INSERT INTO "opsweave"."user_credentials"
  (user_id,password_hash,password_algorithm,password_parameters,password_changed_at,credential_version,updated_at)
SELECT owner.user_id,credential.password_hash,credential.password_algorithm,
  credential.password_parameters,credential.password_changed_at,credential.credential_version,credential.updated_at
FROM "opsweave"."owners" owner
JOIN "opsweave"."owner_credentials" credential ON credential.owner_id=owner.id
ON CONFLICT (user_id) DO NOTHING;--> statement-breakpoint
INSERT INTO "opsweave"."workspace_memberships"
  (workspace_id,user_id,role,status,authorization_version,activated_at,created_at,updated_at)
SELECT owner.workspace_id,owner.user_id,'owner','active',1,owner.created_at,owner.created_at,now()
FROM "opsweave"."owners" owner;--> statement-breakpoint
UPDATE "opsweave"."sessions" session
SET user_id=owner.user_id,membership_id=membership.id
FROM "opsweave"."owners" owner
JOIN "opsweave"."workspace_memberships" membership
  ON membership.workspace_id=owner.workspace_id AND membership.user_id=owner.user_id
WHERE session.owner_id=owner.id AND (session.user_id IS NULL OR session.membership_id IS NULL);--> statement-breakpoint
UPDATE "opsweave"."audit_events" event
SET actor_user_id=owner.user_id,
  subject_project_id=CASE WHEN event.target_type='project' AND event.target_id ~* '^[0-9a-f-]{36}$' THEN event.target_id::uuid ELSE event.subject_project_id END,
  subject_task_id=CASE WHEN event.target_type='task' AND event.target_id ~* '^[0-9a-f-]{36}$' THEN event.target_id::uuid ELSE event.subject_task_id END
FROM "opsweave"."owners" owner
WHERE event.actor_owner_id=owner.id;--> statement-breakpoint
UPDATE "opsweave"."projects" project SET created_by_user_id=owner.user_id
FROM "opsweave"."owners" owner
WHERE owner.workspace_id=project.workspace_id AND project.created_by_user_id IS NULL;--> statement-breakpoint
UPDATE "opsweave"."tasks" task SET created_by_user_id=owner.user_id
FROM "opsweave"."owners" owner
WHERE owner.workspace_id=task.workspace_id AND task.created_by_user_id IS NULL;--> statement-breakpoint
UPDATE "opsweave"."task_checklist_items" item SET created_by_user_id=owner.user_id
FROM "opsweave"."tasks" task
JOIN "opsweave"."owners" owner ON owner.workspace_id=task.workspace_id
WHERE item.task_id=task.id AND item.created_by_user_id IS NULL;--> statement-breakpoint
UPDATE "opsweave"."task_time_entries" entry SET user_id=owner.user_id
FROM "opsweave"."tasks" task
JOIN "opsweave"."owners" owner ON owner.workspace_id=task.workspace_id
WHERE entry.task_id=task.id AND entry.user_id IS NULL;--> statement-breakpoint
UPDATE "opsweave"."attachments" attachment SET uploaded_by_user_id=owner.user_id,
  approved_by_user_id=owner.user_id,approved_at=attachment.created_at
FROM "opsweave"."owners" owner
WHERE owner.workspace_id=attachment.workspace_id AND attachment.uploaded_by_user_id IS NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."owners" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ALTER COLUMN "membership_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ALTER COLUMN "uploaded_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."access_grants" ADD CONSTRAINT "access_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."access_grants" ADD CONSTRAINT "access_grants_subject_project_id_projects_id_fk" FOREIGN KEY ("subject_project_id") REFERENCES "opsweave"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."access_grants" ADD CONSTRAINT "access_grants_subject_task_id_tasks_id_fk" FOREIGN KEY ("subject_task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."access_grants" ADD CONSTRAINT "access_grants_delegate_user_id_users_id_fk" FOREIGN KEY ("delegate_user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."access_grants" ADD CONSTRAINT "access_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."access_grants" ADD CONSTRAINT "access_grants_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."activity_mentions" ADD CONSTRAINT "activity_mentions_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "opsweave"."audit_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."activity_mentions" ADD CONSTRAINT "activity_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."activity_payloads" ADD CONSTRAINT "activity_payloads_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "opsweave"."audit_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."attachment_delegate_audience" ADD CONSTRAINT "attachment_delegate_audience_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "opsweave"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."attachment_delegate_audience" ADD CONSTRAINT "attachment_delegate_audience_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."attachment_delegate_audience" ADD CONSTRAINT "attachment_delegate_audience_access_grant_id_access_grants_id_fk" FOREIGN KEY ("access_grant_id") REFERENCES "opsweave"."access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."compliance_flags" ADD CONSTRAINT "compliance_flags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."compliance_flags" ADD CONSTRAINT "compliance_flags_source_audit_event_id_audit_events_id_fk" FOREIGN KEY ("source_audit_event_id") REFERENCES "opsweave"."audit_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."compliance_flags" ADD CONSTRAINT "compliance_flags_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "opsweave"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."compliance_flags" ADD CONSTRAINT "compliance_flags_subject_project_id_projects_id_fk" FOREIGN KEY ("subject_project_id") REFERENCES "opsweave"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."compliance_flags" ADD CONSTRAINT "compliance_flags_subject_task_id_tasks_id_fk" FOREIGN KEY ("subject_task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."compliance_flags" ADD CONSTRAINT "compliance_flags_delegate_user_id_users_id_fk" FOREIGN KEY ("delegate_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."compliance_flags" ADD CONSTRAINT "compliance_flags_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegate_entity_presentations" ADD CONSTRAINT "delegate_entity_presentations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegate_entity_presentations" ADD CONSTRAINT "delegate_entity_presentations_subject_project_id_projects_id_fk" FOREIGN KEY ("subject_project_id") REFERENCES "opsweave"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegate_entity_presentations" ADD CONSTRAINT "delegate_entity_presentations_subject_task_id_tasks_id_fk" FOREIGN KEY ("subject_task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegate_entity_presentations" ADD CONSTRAINT "delegate_entity_presentations_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegate_kanban_stages" ADD CONSTRAINT "delegate_kanban_stages_membership_id_workspace_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "opsweave"."workspace_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegate_task_states" ADD CONSTRAINT "delegate_task_states_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegate_task_states" ADD CONSTRAINT "delegate_task_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegate_task_states" ADD CONSTRAINT "delegate_task_states_task_assignment_id_task_assignments_id_fk" FOREIGN KEY ("task_assignment_id") REFERENCES "opsweave"."task_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegate_task_states" ADD CONSTRAINT "delegate_task_states_stage_id_delegate_kanban_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "opsweave"."delegate_kanban_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegation_aliases" ADD CONSTRAINT "delegation_aliases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegation_aliases" ADD CONSTRAINT "delegation_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegation_aliases" ADD CONSTRAINT "delegation_aliases_context_project_id_projects_id_fk" FOREIGN KEY ("context_project_id") REFERENCES "opsweave"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."delegation_aliases" ADD CONSTRAINT "delegation_aliases_context_task_id_tasks_id_fk" FOREIGN KEY ("context_task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."invitation_tokens" ADD CONSTRAINT "invitation_tokens_access_grant_id_access_grants_id_fk" FOREIGN KEY ("access_grant_id") REFERENCES "opsweave"."access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."invitation_tokens" ADD CONSTRAINT "invitation_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."notification_outbox" ADD CONSTRAINT "notification_outbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."notification_outbox" ADD CONSTRAINT "notification_outbox_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "opsweave"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."notification_outbox" ADD CONSTRAINT "notification_outbox_invitation_token_id_invitation_tokens_id_fk" FOREIGN KEY ("invitation_token_id") REFERENCES "opsweave"."invitation_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "opsweave"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "opsweave"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."notifications" ADD CONSTRAINT "notifications_source_audit_event_id_audit_events_id_fk" FOREIGN KEY ("source_audit_event_id") REFERENCES "opsweave"."audit_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."protected_terms" ADD CONSTRAINT "protected_terms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."protected_terms" ADD CONSTRAINT "protected_terms_context_project_id_projects_id_fk" FOREIGN KEY ("context_project_id") REFERENCES "opsweave"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."protected_terms" ADD CONSTRAINT "protected_terms_context_task_id_tasks_id_fk" FOREIGN KEY ("context_task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."protected_terms" ADD CONSTRAINT "protected_terms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_assignments" ADD CONSTRAINT "task_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_assignments" ADD CONSTRAINT "task_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_assignments" ADD CONSTRAINT "task_assignments_access_grant_id_access_grants_id_fk" FOREIGN KEY ("access_grant_id") REFERENCES "opsweave"."access_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_assignments" ADD CONSTRAINT "task_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_delegate_audience" ADD CONSTRAINT "task_delegate_audience_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_delegate_audience" ADD CONSTRAINT "task_delegate_audience_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_delegate_audience" ADD CONSTRAINT "task_delegate_audience_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."workspace_memberships" ADD CONSTRAINT "workspace_memberships_lifecycle_actor_user_id_users_id_fk" FOREIGN KEY ("lifecycle_actor_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_grants_workspace_status_idx" ON "opsweave"."access_grants" USING btree ("workspace_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "access_grants_delegate_user_idx" ON "opsweave"."access_grants" USING btree ("delegate_user_id","status");--> statement-breakpoint
CREATE INDEX "access_grants_project_idx" ON "opsweave"."access_grants" USING btree ("subject_project_id","status");--> statement-breakpoint
CREATE INDEX "access_grants_task_idx" ON "opsweave"."access_grants" USING btree ("subject_task_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "access_grants_live_subject_email_idx" ON "opsweave"."access_grants" USING btree ("workspace_id","subject_type","subject_project_id","subject_task_id","normalized_delegate_email") WHERE "opsweave"."access_grants"."status" in ('invite_pending','active');--> statement-breakpoint
CREATE INDEX "compliance_flags_workspace_status_idx" ON "opsweave"."compliance_flags" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delegate_presentations_project_idx" ON "opsweave"."delegate_entity_presentations" USING btree ("subject_project_id") WHERE "opsweave"."delegate_entity_presentations"."subject_project_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "delegate_presentations_task_idx" ON "opsweave"."delegate_entity_presentations" USING btree ("subject_task_id") WHERE "opsweave"."delegate_entity_presentations"."subject_task_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "delegate_kanban_stages_membership_sequence_idx" ON "opsweave"."delegate_kanban_stages" USING btree ("membership_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "delegate_task_states_task_user_idx" ON "opsweave"."delegate_task_states" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX "delegate_task_states_user_stage_idx" ON "opsweave"."delegate_task_states" USING btree ("user_id","stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delegation_aliases_user_context_idx" ON "opsweave"."delegation_aliases" USING btree ("user_id","context_type","context_project_id","context_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delegation_aliases_alias_context_idx" ON "opsweave"."delegation_aliases" USING btree ("alias","context_type","context_project_id","context_task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_tokens_digest_idx" ON "opsweave"."invitation_tokens" USING btree ("token_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_tokens_live_grant_idx" ON "opsweave"."invitation_tokens" USING btree ("access_grant_id") WHERE "opsweave"."invitation_tokens"."consumed_at" is null and "opsweave"."invitation_tokens"."invalidated_at" is null;--> statement-breakpoint
CREATE INDEX "invitation_tokens_expiry_idx" ON "opsweave"."invitation_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_idempotency_idx" ON "opsweave"."notification_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_outbox_claim_idx" ON "opsweave"."notification_outbox" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_idempotency_idx" ON "opsweave"."notifications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_state_idx" ON "opsweave"."notifications" USING btree ("recipient_user_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "protected_terms_context_value_idx" ON "opsweave"."protected_terms" USING btree ("workspace_id","context_project_id","context_task_id","normalized_value");--> statement-breakpoint
CREATE UNIQUE INDEX "task_assignments_active_task_user_idx" ON "opsweave"."task_assignments" USING btree ("task_id","user_id") WHERE "opsweave"."task_assignments"."active";--> statement-breakpoint
CREATE INDEX "task_assignments_user_active_idx" ON "opsweave"."task_assignments" USING btree ("user_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_email_idx" ON "opsweave"."users" USING btree ("normalized_email") WHERE "opsweave"."users"."normalized_email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_username_idx" ON "opsweave"."users" USING btree ("normalized_username") WHERE "opsweave"."users"."normalized_username" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_memberships_workspace_user_idx" ON "opsweave"."workspace_memberships" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_memberships_active_owner_idx" ON "opsweave"."workspace_memberships" USING btree ("workspace_id") WHERE "opsweave"."workspace_memberships"."role" = 'owner' and "opsweave"."workspace_memberships"."status" = 'active';--> statement-breakpoint
CREATE INDEX "workspace_memberships_user_status_idx" ON "opsweave"."workspace_memberships" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD CONSTRAINT "attachments_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD CONSTRAINT "audit_events_subject_project_id_projects_id_fk" FOREIGN KEY ("subject_project_id") REFERENCES "opsweave"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD CONSTRAINT "audit_events_subject_task_id_tasks_id_fk" FOREIGN KEY ("subject_task_id") REFERENCES "opsweave"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD CONSTRAINT "audit_events_occurred_for_user_id_users_id_fk" FOREIGN KEY ("occurred_for_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."owners" ADD CONSTRAINT "owners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."projects" ADD CONSTRAINT "projects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ADD CONSTRAINT "sessions_membership_id_workspace_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "opsweave"."workspace_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_checklist_items" ADD CONSTRAINT "task_checklist_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD CONSTRAINT "task_time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "opsweave"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD CONSTRAINT "task_time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD CONSTRAINT "task_time_entries_access_grant_id_access_grants_id_fk" FOREIGN KEY ("access_grant_id") REFERENCES "opsweave"."access_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_project_created_idx" ON "opsweave"."audit_events" USING btree ("subject_project_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_task_created_idx" ON "opsweave"."audit_events" USING btree ("subject_task_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "opsweave"."sessions" USING btree ("user_id","revoked_at","absolute_expires_at");--> statement-breakpoint
CREATE INDEX "task_time_entries_project_date_idx" ON "opsweave"."task_time_entries" USING btree ("project_id","entry_date","created_at");--> statement-breakpoint
CREATE INDEX "task_time_entries_user_date_idx" ON "opsweave"."task_time_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD CONSTRAINT "attachments_visibility" CHECK ("opsweave"."attachments"."visibility" in ('internal_only','shared_all_delegates','shared_selected_delegates','redacted_delegate_copy'));--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD CONSTRAINT "attachments_approval_status" CHECK ("opsweave"."attachments"."approval_status" in ('draft','approved','rejected'));--> statement-breakpoint
ALTER TABLE "opsweave"."attachments" ADD CONSTRAINT "attachments_scan_status" CHECK ("opsweave"."attachments"."scan_status" in ('pending','clean','rejected','unavailable'));--> statement-breakpoint
ALTER TABLE "opsweave"."audit_events" ADD CONSTRAINT "audit_events_visibility" CHECK ("opsweave"."audit_events"."visibility" in ('owner_admin','authorised_participants','selected_participants','actor_and_owner'));--> statement-breakpoint
ALTER TABLE "opsweave"."sessions" ADD CONSTRAINT "sessions_authorization_version_positive" CHECK ("opsweave"."sessions"."authorization_version" > 0);--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD CONSTRAINT "task_time_entries_exact_subject" CHECK (num_nonnulls("opsweave"."task_time_entries"."task_id","opsweave"."task_time_entries"."project_id")=1);--> statement-breakpoint
ALTER TABLE "opsweave"."task_time_entries" ADD CONSTRAINT "task_time_entries_version_positive" CHECK ("opsweave"."task_time_entries"."version" > 0);--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_delegate_visibility" CHECK ("opsweave"."tasks"."delegate_visibility" in ('internal','project_delegates','selected_delegates'));--> statement-breakpoint
ALTER TABLE "opsweave"."tasks" ADD CONSTRAINT "tasks_pre_delegation_lane" CHECK ("opsweave"."tasks"."pre_delegation_lane" is null or "opsweave"."tasks"."pre_delegation_lane" in ('inbox','this_week','today','in_focus','monitor_validate','waiting','delegated','done','cancelled'));
