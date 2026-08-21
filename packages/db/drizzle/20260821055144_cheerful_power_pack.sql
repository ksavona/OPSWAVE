CREATE TABLE "opsweave"."email_delivery_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"endpoint" varchar(2048) NOT NULL,
	"encrypted_token" text,
	"configured_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opsweave"."access_grants" ADD COLUMN "profile_description" text;--> statement-breakpoint
ALTER TABLE "opsweave"."access_grants" ADD COLUMN "privacy_keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "opsweave"."email_delivery_settings" ADD CONSTRAINT "email_delivery_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "opsweave"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opsweave"."email_delivery_settings" ADD CONSTRAINT "email_delivery_settings_configured_by_user_id_users_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "opsweave"."users"("id") ON DELETE restrict ON UPDATE no action;