import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const opsweaveSchema = pgSchema("opsweave");

const timestamps = {
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
};

export const systemMetadata = opsweaveSchema.table(
  "system_metadata",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    ...timestamps,
  },
  (table) => [index("system_metadata_updated_at_idx").on(table.updatedAt)],
);

export const workspaces = opsweaveSchema.table(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [check("workspaces_version_positive", sql`${table.version} > 0`)],
);

export const owners = opsweaveSchema.table(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    username: varchar("username", { length: 64 }).notNull(),
    normalizedUsername: varchar("normalized_username", { length: 64 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("owners_single_owner_per_workspace_idx").on(table.workspaceId),
    uniqueIndex("owners_normalized_username_idx").on(table.normalizedUsername),
  ],
);

export const ownerCredentials = opsweaveSchema.table(
  "owner_credentials",
  {
    ownerId: uuid("owner_id")
      .primaryKey()
      .references(() => owners.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    passwordAlgorithm: varchar("password_algorithm", { length: 32 }).notNull(),
    passwordParameters: jsonb("password_parameters").notNull(),
    passwordChangedAt: timestamp("password_changed_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    credentialVersion: integer("credential_version").notNull().default(1),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("owner_credentials_version_positive", sql`${table.credentialVersion} > 0`)],
);

export const sessions = opsweaveSchema.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tokenDigest: varchar("token_digest", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { mode: "date", withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { mode: "date", withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    recentAuthenticatedAt: timestamp("recent_authenticated_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    uniqueIndex("sessions_token_digest_idx").on(table.tokenDigest),
    index("sessions_owner_active_idx").on(table.ownerId, table.revokedAt, table.absoluteExpiresAt),
    index("sessions_expiry_idx").on(table.absoluteExpiresAt, table.idleExpiresAt),
    check("sessions_absolute_after_creation", sql`${table.absoluteExpiresAt} > ${table.createdAt}`),
  ],
);

export const loginAttempts = opsweaveSchema.table(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountSignalDigest: varchar("account_signal_digest", { length: 64 }).notNull(),
    networkSignalDigest: varchar("network_signal_digest", { length: 64 }).notNull(),
    outcome: varchar("outcome", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    index("login_attempts_expiry_idx").on(table.expiresAt),
    check("login_attempts_outcome", sql`${table.outcome} in ('failed', 'succeeded', 'limited')`),
  ],
);

export const rateLimitCounters = opsweaveSchema.table("rate_limit_counters", {
  key: varchar("key", { length: 255 }).primaryKey(),
  points: integer("points").notNull().default(0),
  expire: bigint("expire", { mode: "number" }),
});

export const workspaceSettings = opsweaveSchema.table(
  "workspace_settings",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    dateDisplay: varchar("date_display", { length: 16 }).notNull().default("iso"),
    defaultKanbanSort: varchar("default_kanban_sort", { length: 32 }).notNull().default("manual"),
    defaultLandingView: varchar("default_landing_view", { length: 32 })
      .notNull()
      .default("projects"),
    firstDayOfWeek: varchar("first_day_of_week", { length: 16 }).notNull().default("monday"),
    planningBufferPercent: numeric("planning_buffer_percent", {
      mode: "number",
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default(10),
    deadlineRiskHorizonDays: integer("deadline_risk_horizon_days").notNull().default(14),
    dailyLargeQuota: integer("daily_large_quota").notNull().default(1),
    dailyMediumQuota: integer("daily_medium_quota").notNull().default(2),
    dailySmallQuota: integer("daily_small_quota").notNull().default(3),
    allowMissingSizeSubstitution: boolean("allow_missing_size_substitution")
      .notNull()
      .default(true),
    allowFinalTaskOverflow: boolean("allow_final_task_overflow").notNull().default(false),
    manualTodayCarryover: boolean("manual_today_carryover").notNull().default(true),
    dailyBufferEnabled: boolean("daily_buffer_enabled").notNull().default(false),
    aiExtractionEnabled: boolean("ai_extraction_enabled").notNull().default(false),
    aiTieBreakingEnabled: boolean("ai_tie_breaking_enabled").notNull().default(false),
    businessValueInfluenceEnabled: boolean("business_value_influence_enabled")
      .notNull()
      .default(false),
    weeklyAutomationEnabled: boolean("weekly_automation_enabled").notNull().default(false),
    dailyAutomationEnabled: boolean("daily_automation_enabled").notNull().default(false),
    extractionModel: varchar("extraction_model", { length: 100 }).notNull().default("gpt-5.6-sol"),
    prioritizationModel: varchar("prioritization_model", { length: 100 })
      .notNull()
      .default("gpt-5.6-sol"),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("workspace_settings_version_positive", sql`${table.version} > 0`),
    check(
      "workspace_settings_buffer_range",
      sql`${table.planningBufferPercent} >= 0 and ${table.planningBufferPercent} <= 50`,
    ),
    check(
      "workspace_settings_horizon_range",
      sql`${table.deadlineRiskHorizonDays} >= 1 and ${table.deadlineRiskHorizonDays} <= 90`,
    ),
    check(
      "workspace_settings_quota_ranges",
      sql`${table.dailyLargeQuota} between 0 and 20 and ${table.dailyMediumQuota} between 0 and 20 and ${table.dailySmallQuota} between 0 and 20`,
    ),
    check("workspace_settings_first_day", sql`${table.firstDayOfWeek} = 'monday'`),
    check("workspace_settings_date_display", sql`${table.dateDisplay} in ('iso', 'locale')`),
    check(
      "workspace_settings_kanban_sort",
      sql`${table.defaultKanbanSort} in ('manual', 'planning_priority', 'greatest_value')`,
    ),
  ],
);

export const workspaceWorkingHours = opsweaveSchema.table(
  "workspace_working_hours",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    weekday: varchar("weekday", { length: 16 }).notNull(),
    enabled: boolean("enabled").notNull(),
    availableHours: numeric("available_hours", {
      mode: "number",
      precision: 5,
      scale: 2,
    }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.weekday] }),
    check(
      "workspace_working_hours_weekday",
      sql`${table.weekday} in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')`,
    ),
    check(
      "workspace_working_hours_range",
      sql`${table.availableHours} >= 0 and ${table.availableHours} <= 24`,
    ),
  ],
);

export const encryptedProviderCredentials = opsweaveSchema.table(
  "encrypted_provider_credentials",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    algorithm: varchar("algorithm", { length: 32 }).notNull(),
    ciphertext: text("ciphertext").notNull(),
    authenticationTag: text("authentication_tag").notNull(),
    initializationVector: text("initialization_vector").notNull(),
    envelopeVersion: integer("envelope_version").notNull(),
    keyVersion: integer("key_version").notNull(),
    verificationStatus: varchar("verification_status", { length: 32 })
      .notNull()
      .default("unverified"),
    lastVerifiedAt: timestamp("last_verified_at", { mode: "date", withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.provider] }),
    check("provider_credentials_envelope_version", sql`${table.envelopeVersion} > 0`),
    check("provider_credentials_key_version", sql`${table.keyVersion} > 0`),
    check(
      "provider_credentials_verification_status",
      sql`${table.verificationStatus} in ('unverified', 'verified', 'invalid', 'unavailable', 'configuration_error')`,
    ),
  ],
);

export const delegates = opsweaveSchema.table(
  "delegates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    ...timestamps,
  },
  (table) => [index("delegates_workspace_idx").on(table.workspaceId)],
);

export const projects = opsweaveSchema.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [index("projects_workspace_idx").on(table.workspaceId)],
);

export const tasks = opsweaveSchema.table(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: varchar("title", { length: 300 }).notNull(),
    workflowLane: varchar("workflow_lane", { length: 32 }).notNull().default("inbox"),
    businessValueScore: integer("business_value_score"),
    businessValueRationale: text("business_value_rationale"),
    valueSource: varchar("value_source", { length: 16 }),
    valueUpdatedAt: timestamp("value_updated_at", { mode: "date", withTimezone: true }),
    manualLanePosition: numeric("manual_lane_position", { mode: "number", precision: 20, scale: 6 })
      .notNull()
      .default(0),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("tasks_workspace_lane_position_idx").on(
      table.workspaceId,
      table.workflowLane,
      table.manualLanePosition,
    ),
    index("tasks_workspace_value_idx").on(
      table.workspaceId,
      table.workflowLane,
      table.businessValueScore,
    ),
    check(
      "tasks_business_value_range",
      sql`${table.businessValueScore} is null or (${table.businessValueScore} between 1 and 100)`,
    ),
    check(
      "tasks_value_source",
      sql`${table.valueSource} is null or ${table.valueSource} in ('owner', 'ai', 'import')`,
    ),
  ],
);

export const auditEvents = opsweaveSchema.table(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorOwnerId: uuid("actor_owner_id").references(() => owners.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: varchar("target_id", { length: 100 }),
    correlationId: uuid("correlation_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_events_correlation_idx").on(table.correlationId),
  ],
);

export const trashRecords = opsweaveSchema.table(
  "trash_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    purgeAfter: timestamp("purge_after", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("trash_records_entity_idx").on(table.workspaceId, table.entityType, table.entityId),
    index("trash_records_purge_idx").on(table.purgeAfter),
  ],
);

export const planningRuns = opsweaveSchema.table(
  "planning_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    settingsVersion: integer("settings_version").notNull(),
    settingsSnapshot: jsonb("settings_snapshot").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("planning_runs_workspace_created_idx").on(table.workspaceId, table.createdAt),
    check("planning_runs_kind", sql`${table.kind} in ('weekly', 'daily', 'preview')`),
    check("planning_runs_status", sql`${table.status} in ('completed', 'no_capacity', 'failed')`),
  ],
);
