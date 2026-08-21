import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  time,
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

export const users = opsweaveSchema.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }),
    normalizedEmail: varchar("normalized_email", { length: 320 }),
    username: varchar("username", { length: 64 }),
    normalizedUsername: varchar("normalized_username", { length: 64 }),
    fullName: varchar("full_name", { length: 200 }),
    status: varchar("status", { length: 32 }).notNull().default("invited"),
    authorizationVersion: integer("authorization_version").notNull().default(1),
    deactivatedAt: timestamp("deactivated_at", { mode: "date", withTimezone: true }),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_normalized_email_idx")
      .on(table.normalizedEmail)
      .where(sql`${table.normalizedEmail} is not null`),
    uniqueIndex("users_normalized_username_idx")
      .on(table.normalizedUsername)
      .where(sql`${table.normalizedUsername} is not null`),
    check("users_status", sql`${table.status} in ('invited','active','deactivated','archived')`),
    check("users_authorization_version_positive", sql`${table.authorizationVersion} > 0`),
  ],
);

export const userCredentials = opsweaveSchema.table(
  "user_credentials",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
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
  (table) => [check("user_credentials_version_positive", sql`${table.credentialVersion} > 0`)],
);

export const workspaceMemberships = opsweaveSchema.table(
  "workspace_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: varchar("role", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("invited"),
    authorizationVersion: integer("authorization_version").notNull().default(1),
    activatedAt: timestamp("activated_at", { mode: "date", withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { mode: "date", withTimezone: true }),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    lifecycleActorUserId: uuid("lifecycle_actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_memberships_workspace_user_idx").on(table.workspaceId, table.userId),
    uniqueIndex("workspace_memberships_active_owner_idx")
      .on(table.workspaceId)
      .where(sql`${table.role} = 'owner' and ${table.status} = 'active'`),
    index("workspace_memberships_user_status_idx").on(table.userId, table.status),
    check("workspace_memberships_role", sql`${table.role} in ('owner','admin','delegate')`),
    check(
      "workspace_memberships_status",
      sql`${table.status} in ('invited','active','deactivated','archived')`,
    ),
    check(
      "workspace_memberships_authorization_version_positive",
      sql`${table.authorizationVersion} > 0`,
    ),
  ],
);

export const owners = opsweaveSchema.table(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    username: varchar("username", { length: 64 }).notNull(),
    normalizedUsername: varchar("normalized_username", { length: 64 }).notNull(),
    fullName: varchar("full_name", { length: 200 }),
    knownAs: text("known_as")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
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
    ownerId: uuid("owner_id").references(() => owners.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => workspaceMemberships.id, { onDelete: "cascade" }),
    authorizationVersion: integer("authorization_version").notNull().default(1),
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
    index("sessions_user_active_idx").on(table.userId, table.revokedAt, table.absoluteExpiresAt),
    index("sessions_expiry_idx").on(table.absoluteExpiresAt, table.idleExpiresAt),
    check("sessions_absolute_after_creation", sql`${table.absoluteExpiresAt} > ${table.createdAt}`),
    check("sessions_authorization_version_positive", sql`${table.authorizationVersion} > 0`),
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
    aiTieBreakingEnabled: boolean("ai_tie_breaking_enabled").notNull().default(true),
    multiUserEnabled: boolean("multi_user_enabled").notNull().default(false),
    invitationEmailEnabled: boolean("invitation_email_enabled").notNull().default(false),
    delegateUploadsEnabled: boolean("delegate_uploads_enabled").notNull().default(false),
    complianceMonitorEnabled: boolean("compliance_monitor_enabled").notNull().default(false),
    businessValueInfluenceEnabled: boolean("business_value_influence_enabled")
      .notNull()
      .default(false),
    weeklyAutomationEnabled: boolean("weekly_automation_enabled").notNull().default(true),
    dailyAutomationEnabled: boolean("daily_automation_enabled").notNull().default(true),
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
      sql`${table.defaultKanbanSort} in ('manual', 'planning_priority', 'greatest_value', 'dependency')`,
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
    startTime: time("start_time").notNull().default("09:00"),
    endTime: time("end_time").notNull().default("17:00"),
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

export const projectStages = opsweaveSchema.table(
  "project_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    llmContext: text("llm_context"),
    sequence: integer("sequence").notNull().default(0),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("project_stages_workspace_sequence_idx").on(table.workspaceId, table.sequence),
    uniqueIndex("project_stages_workspace_name_idx").on(table.workspaceId, table.name),
    check("project_stages_version_positive", sql`${table.version} > 0`),
  ],
);

export const projects = opsweaveSchema.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    clientName: varchar("client_name", { length: 200 }),
    description: text("description"),
    notes: jsonb("notes").notNull().default({ type: "doc", content: [] }),
    priorityLevel: integer("priority_level"),
    status: varchar("status", { length: 32 }).notNull().default("not_started"),
    anonymiseDelegation: boolean("anonymise_delegation").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    llmLink: varchar("llm_link", { length: 2_048 }),
    stageId: uuid("stage_id").references(() => projectStages.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("projects_workspace_idx").on(table.workspaceId),
    index("projects_workspace_stage_idx").on(table.workspaceId, table.stageId, table.createdAt),
    check(
      "projects_priority_level_range",
      sql`${table.priorityLevel} is null or (${table.priorityLevel} between 1 and 5)`,
    ),
    check(
      "projects_status",
      sql`${table.status} in ('not_started', 'on_track', 'in_progress', 'on_hold', 'at_risk')`,
    ),
  ],
);

export const tasks = opsweaveSchema.table(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    clientName: varchar("client_name", { length: 200 }),
    title: varchar("title", { length: 300 }).notNull(),
    allocatedHours: numeric("allocated_hours", { mode: "number", precision: 10, scale: 2 }),
    hoursSpent: numeric("hours_spent", { mode: "number", precision: 10, scale: 2 })
      .notNull()
      .default(0),
    size: varchar("size", { length: 16 }),
    sizeManualOverride: boolean("size_manual_override").notNull().default(false),
    valueAdd: text("value_add"),
    workDescription: text("work_description"),
    definitionOfDone: text("definition_of_done"),
    origin: text("origin"),
    notes: jsonb("notes").notNull().default({ type: "doc", content: [] }),
    startDate: date("start_date", { mode: "string" }),
    startTime: time("start_time"),
    dueDate: date("due_date", { mode: "string" }),
    endTime: time("end_time"),
    delegateId: uuid("delegate_id").references(() => delegates.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { mode: "date", withTimezone: true }),
    deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
    workflowLane: varchar("workflow_lane", { length: 32 }).notNull().default("inbox"),
    businessValueScore: integer("business_value_score"),
    priorityLevel: integer("priority_level"),
    status: varchar("status", { length: 32 }).notNull().default("not_started"),
    anonymiseDelegation: boolean("anonymise_delegation").notNull().default(false),
    delegateVisibility: varchar("delegate_visibility", { length: 32 })
      .notNull()
      .default("internal"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ownerWorkAssigned: boolean("owner_work_assigned").notNull().default(true),
    preDelegationLane: varchar("pre_delegation_lane", { length: 32 }),
    businessValueRationale: text("business_value_rationale"),
    valueSource: varchar("value_source", { length: 16 }),
    valueUpdatedAt: timestamp("value_updated_at", { mode: "date", withTimezone: true }),
    manualLanePosition: numeric("manual_lane_position", { mode: "number", precision: 20, scale: 6 })
      .notNull()
      .default(0),
    planningEligible: boolean("planning_eligible").notNull().default(true),
    scheduleLocked: boolean("schedule_locked").notNull().default(false),
    requiresBreakdown: boolean("requires_breakdown").notNull().default(false),
    plannedDate: date("planned_date", { mode: "string" }),
    plannedStartTime: time("planned_start_time"),
    plannedEndTime: time("planned_end_time"),
    planningScore: integer("planning_score"),
    planningRationale: text("planning_rationale"),
    lastPlannedBy: varchar("last_planned_by", { length: 32 }),
    lastPlannedAt: timestamp("last_planned_at", { mode: "date", withTimezone: true }),
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
    index("tasks_workspace_project_idx").on(table.workspaceId, table.projectId, table.deletedAt),
    index("tasks_workspace_planning_idx").on(
      table.workspaceId,
      table.planningEligible,
      table.scheduleLocked,
      table.workflowLane,
      table.planningScore,
    ),
    check(
      "tasks_business_value_range",
      sql`${table.businessValueScore} is null or (${table.businessValueScore} between 1 and 100)`,
    ),
    check(
      "tasks_priority_level_range",
      sql`${table.priorityLevel} is null or (${table.priorityLevel} between 1 and 5)`,
    ),
    check(
      "tasks_status",
      sql`${table.status} in ('not_started', 'on_track', 'in_progress', 'on_hold', 'at_risk')`,
    ),
    check(
      "tasks_delegate_visibility",
      sql`${table.delegateVisibility} in ('internal','project_delegates','selected_delegates')`,
    ),
    check(
      "tasks_pre_delegation_lane",
      sql`${table.preDelegationLane} is null or ${table.preDelegationLane} in ('inbox','this_week','today','in_focus','monitor_validate','waiting','delegated','done','cancelled')`,
    ),
    check(
      "tasks_value_source",
      sql`${table.valueSource} is null or ${table.valueSource} in ('owner', 'ai_proposed', 'imported')`,
    ),
    check(
      "tasks_size",
      sql`${table.size} is null or ${table.size} in ('small', 'medium', 'large', 'mega')`,
    ),
    check(
      "tasks_planning_score_range",
      sql`${table.planningScore} is null or (${table.planningScore} between 0 and 100)`,
    ),
    check(
      "tasks_last_planned_by",
      sql`${table.lastPlannedBy} is null or ${table.lastPlannedBy} in ('automation', 'llm', 'user')`,
    ),
    check(
      "tasks_planned_time_order",
      sql`${table.plannedStartTime} is null or ${table.plannedEndTime} is null or ${table.plannedStartTime} <= ${table.plannedEndTime}`,
    ),
    check(
      "tasks_workflow_lane",
      sql`${table.workflowLane} in ('inbox', 'this_week', 'today', 'in_focus', 'monitor_validate', 'waiting', 'delegated', 'done', 'cancelled')`,
    ),
    check(
      "tasks_allocated_hours_range",
      sql`${table.allocatedHours} is null or (${table.allocatedHours} >= 0 and ${table.allocatedHours} <= 10000)`,
    ),
    check(
      "tasks_hours_spent_range",
      sql`${table.hoursSpent} is null or (${table.hoursSpent} >= 0 and ${table.hoursSpent} <= 10000)`,
    ),
    check(
      "tasks_date_order",
      sql`${table.startDate} is null or ${table.dueDate} is null or ${table.startDate} <= ${table.dueDate}`,
    ),
  ],
);

export const taskChecklistItems = opsweaveSchema.table(
  "task_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 500 }).notNull(),
    description: text("description"),
    predictedHours: numeric("predicted_hours", { mode: "number", precision: 10, scale: 2 }),
    completed: boolean("completed").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    delegateVisible: boolean("delegate_visible").notNull().default(false),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("task_checklist_items_position_idx").on(table.taskId, table.position),
    check("task_checklist_items_position_non_negative", sql`${table.position} >= 0`),
    check(
      "task_checklist_items_predicted_hours_range",
      sql`${table.predictedHours} is null or (${table.predictedHours} >= 0 and ${table.predictedHours} <= 10000)`,
    ),
    check("task_checklist_items_version_positive", sql`${table.version} > 0`),
  ],
);

export const accessGrants = opsweaveSchema.table(
  "access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subjectType: varchar("subject_type", { length: 16 }).notNull(),
    subjectProjectId: uuid("subject_project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    subjectTaskId: uuid("subject_task_id").references(() => tasks.id, { onDelete: "cascade" }),
    delegateUserId: uuid("delegate_user_id").references(() => users.id, { onDelete: "restrict" }),
    delegateEmail: varchar("delegate_email", { length: 320 }).notNull(),
    normalizedDelegateEmail: varchar("normalized_delegate_email", { length: 320 }).notNull(),
    scope: varchar("scope", { length: 16 }).notNull(),
    accessRole: varchar("access_role", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("invite_pending"),
    invitedAt: timestamp("invited_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { mode: "date", withTimezone: true }),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }),
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    delegationNote: text("delegation_note"),
    profileDescription: text("profile_description"),
    privacyKeywords: text("privacy_keywords")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("access_grants_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.expiresAt,
    ),
    index("access_grants_delegate_user_idx").on(table.delegateUserId, table.status),
    index("access_grants_project_idx").on(table.subjectProjectId, table.status),
    index("access_grants_task_idx").on(table.subjectTaskId, table.status),
    uniqueIndex("access_grants_live_project_email_idx")
      .on(table.workspaceId, table.subjectProjectId, table.normalizedDelegateEmail)
      .where(
        sql`${table.subjectType}='project' and ${table.status} in ('invite_pending','active')`,
      ),
    uniqueIndex("access_grants_live_task_email_idx")
      .on(table.workspaceId, table.subjectTaskId, table.normalizedDelegateEmail)
      .where(sql`${table.subjectType}='task' and ${table.status} in ('invite_pending','active')`),
    check("access_grants_subject_type", sql`${table.subjectType} in ('project','task')`),
    check("access_grants_scope", sql`${table.scope} in ('project','task')`),
    check(
      "access_grants_subject_matches_type",
      sql`(${table.subjectType}='project' and ${table.subjectProjectId} is not null and ${table.subjectTaskId} is null and ${table.scope}='project') or (${table.subjectType}='task' and ${table.subjectTaskId} is not null and ${table.subjectProjectId} is null and ${table.scope}='task')`,
    ),
    check(
      "access_grants_role",
      sql`${table.accessRole} in ('contributor','project_collaborator','reviewer')`,
    ),
    check(
      "access_grants_project_collaborator_scope",
      sql`${table.accessRole}<>'project_collaborator' or ${table.scope}='project'`,
    ),
    check(
      "access_grants_status",
      sql`${table.status} in ('invite_pending','active','expired','declined','revoked')`,
    ),
    check("access_grants_version_positive", sql`${table.version} > 0`),
  ],
);

export const emailDeliverySettings = opsweaveSchema.table("email_delivery_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  endpoint: varchar("endpoint", { length: 2_048 }).notNull(),
  encryptedToken: text("encrypted_token"),
  configuredByUserId: uuid("configured_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
});

export const invitationTokens = opsweaveSchema.table(
  "invitation_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accessGrantId: uuid("access_grant_id")
      .notNull()
      .references(() => accessGrants.id, { onDelete: "cascade" }),
    tokenDigest: varchar("token_digest", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { mode: "date", withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { mode: "date", withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invitation_tokens_digest_idx").on(table.tokenDigest),
    uniqueIndex("invitation_tokens_live_grant_idx")
      .on(table.accessGrantId)
      .where(sql`${table.consumedAt} is null and ${table.invalidatedAt} is null`),
    index("invitation_tokens_expiry_idx").on(table.expiresAt),
  ],
);

export const taskDelegateAudience = opsweaveSchema.table(
  "task_delegate_audience",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.userId] })],
);

export const taskAssignments = opsweaveSchema.table(
  "task_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    accessGrantId: uuid("access_grant_id").references(() => accessGrants.id, {
      onDelete: "set null",
    }),
    assignmentRole: varchar("assignment_role", { length: 16 }).notNull().default("delivery"),
    active: boolean("active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    endedAt: timestamp("ended_at", { mode: "date", withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("task_assignments_active_task_user_idx")
      .on(table.taskId, table.userId)
      .where(sql`${table.active}`),
    index("task_assignments_user_active_idx").on(table.userId, table.active),
    check("task_assignments_role", sql`${table.assignmentRole} in ('delivery','review')`),
  ],
);

export const delegateKanbanStages = opsweaveSchema.table(
  "delegate_kanban_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => workspaceMemberships.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    semanticKind: varchar("semantic_kind", { length: 32 }).notNull().default("custom"),
    color: varchar("color", { length: 32 }).notNull().default("#5ee5b5"),
    sequence: integer("sequence").notNull().default(0),
    archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("delegate_kanban_stages_membership_sequence_idx").on(
      table.membershipId,
      table.sequence,
    ),
    check(
      "delegate_kanban_stages_kind",
      sql`${table.semanticKind} in ('assigned','in_progress','waiting_for_input','ready_for_review','complete','custom')`,
    ),
    check("delegate_kanban_stages_version_positive", sql`${table.version} > 0`),
  ],
);

export const delegateTaskStates = opsweaveSchema.table(
  "delegate_task_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    taskAssignmentId: uuid("task_assignment_id").references(() => taskAssignments.id, {
      onDelete: "set null",
    }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => delegateKanbanStages.id, { onDelete: "restrict" }),
    latestUpdate: text("latest_update"),
    lastActivityAt: timestamp("last_activity_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("delegate_task_states_task_user_idx").on(table.taskId, table.userId),
    index("delegate_task_states_user_stage_idx").on(table.userId, table.stageId),
    check("delegate_task_states_version_positive", sql`${table.version} > 0`),
  ],
);

export const delegateEntityPresentations = opsweaveSchema.table(
  "delegate_entity_presentations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subjectProjectId: uuid("subject_project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    subjectTaskId: uuid("subject_task_id").references(() => tasks.id, { onDelete: "cascade" }),
    sourceVersion: integer("source_version").notNull(),
    safeTitle: varchar("safe_title", { length: 300 }).notNull(),
    safeDescription: text("safe_description"),
    safeWorkDescription: text("safe_work_description"),
    safeDefinitionOfDone: text("safe_definition_of_done"),
    safeNotes: jsonb("safe_notes").notNull().default({ type: "doc", content: [] }),
    neutralClientLabel: varchar("neutral_client_label", { length: 200 }),
    neutralProjectLabel: varchar("neutral_project_label", { length: 200 }),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { mode: "date", withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("delegate_presentations_project_idx")
      .on(table.subjectProjectId)
      .where(sql`${table.subjectProjectId} is not null`),
    uniqueIndex("delegate_presentations_task_idx")
      .on(table.subjectTaskId)
      .where(sql`${table.subjectTaskId} is not null`),
    check(
      "delegate_presentations_exact_subject",
      sql`num_nonnulls(${table.subjectProjectId},${table.subjectTaskId})=1`,
    ),
    check(
      "delegate_presentations_status",
      sql`${table.status} in ('draft','approved','stale','blocked')`,
    ),
    check(
      "delegate_presentations_versions_positive",
      sql`${table.sourceVersion} > 0 and ${table.version} > 0`,
    ),
  ],
);

export const delegationAliases = opsweaveSchema.table(
  "delegation_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    contextType: varchar("context_type", { length: 16 }).notNull(),
    contextProjectId: uuid("context_project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    contextTaskId: uuid("context_task_id").references(() => tasks.id, { onDelete: "cascade" }),
    alias: varchar("alias", { length: 100 }).notNull(),
    retiredAt: timestamp("retired_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("delegation_aliases_project_user_idx")
      .on(table.contextProjectId, table.userId)
      .where(sql`${table.contextType}='project'`),
    uniqueIndex("delegation_aliases_task_user_idx")
      .on(table.contextTaskId, table.userId)
      .where(sql`${table.contextType}='task'`),
    uniqueIndex("delegation_aliases_project_alias_idx")
      .on(table.contextProjectId, table.alias)
      .where(sql`${table.contextType}='project'`),
    uniqueIndex("delegation_aliases_task_alias_idx")
      .on(table.contextTaskId, table.alias)
      .where(sql`${table.contextType}='task'`),
    check("delegation_aliases_context_type", sql`${table.contextType} in ('project','task')`),
    check(
      "delegation_aliases_context_matches_type",
      sql`(${table.contextType}='project' and ${table.contextProjectId} is not null and ${table.contextTaskId} is null) or (${table.contextType}='task' and ${table.contextTaskId} is not null and ${table.contextProjectId} is null)`,
    ),
  ],
);

export const taskTimeEntries = opsweaveSchema.table(
  "task_time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    accessGrantId: uuid("access_grant_id").references(() => accessGrants.id, {
      onDelete: "set null",
    }),
    actorAliasSnapshot: varchar("actor_alias_snapshot", { length: 100 }),
    version: integer("version").notNull().default(1),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    hours: numeric("hours", { mode: "number", precision: 10, scale: 2 }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("task_time_entries_task_date_idx").on(table.taskId, table.entryDate, table.createdAt),
    index("task_time_entries_project_date_idx").on(
      table.projectId,
      table.entryDate,
      table.createdAt,
    ),
    index("task_time_entries_user_date_idx").on(table.userId, table.entryDate),
    check(
      "task_time_entries_exact_subject",
      sql`num_nonnulls(${table.taskId},${table.projectId})=1`,
    ),
    check("task_time_entries_version_positive", sql`${table.version} > 0`),
    check("task_time_entries_hours_range", sql`${table.hours} > 0 and ${table.hours} <= 10000`),
  ],
);

export const attachments = opsweaveSchema.table(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 16 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    originalName: varchar("original_name", { length: 500 }).notNull(),
    storageKey: varchar("storage_key", { length: 100 }).notNull(),
    contentType: varchar("content_type", { length: 255 }).notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    visibility: varchar("visibility", { length: 32 }).notNull().default("internal_only"),
    originalAttachmentId: uuid("original_attachment_id"),
    delegateSafeName: varchar("delegate_safe_name", { length: 500 }),
    approvalStatus: varchar("approval_status", { length: 16 }).notNull().default("approved"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { mode: "date", withTimezone: true }),
    scanStatus: varchar("scan_status", { length: 16 }).notNull().default("clean"),
    quarantinedAt: timestamp("quarantined_at", { mode: "date", withTimezone: true }),
    contentHash: varchar("content_hash", { length: 64 }),
    purgeAfter: timestamp("purge_after", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attachments_storage_key_idx").on(table.storageKey),
    index("attachments_entity_idx").on(table.workspaceId, table.entityType, table.entityId),
    index("attachments_purge_after_idx").on(table.purgeAfter),
    check("attachments_entity_type", sql`${table.entityType} in ('task','project')`),
    check("attachments_byte_size_positive", sql`${table.byteSize} > 0`),
    foreignKey({
      columns: [table.originalAttachmentId],
      foreignColumns: [table.id],
      name: "attachments_original_attachment_id_fk",
    }).onDelete("set null"),
    check(
      "attachments_visibility",
      sql`${table.visibility} in ('internal_only','shared_all_delegates','shared_selected_delegates','redacted_delegate_copy')`,
    ),
    check(
      "attachments_approval_status",
      sql`${table.approvalStatus} in ('draft','approved','rejected')`,
    ),
    check(
      "attachments_scan_status",
      sql`${table.scanStatus} in ('pending','clean','rejected','unavailable')`,
    ),
  ],
);

export const attachmentDelegateAudience = opsweaveSchema.table(
  "attachment_delegate_audience",
  {
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessGrantId: uuid("access_grant_id").references(() => accessGrants.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.attachmentId, table.userId] })],
);

export const taskDependencies = opsweaveSchema.table(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("task_dependencies_unique_idx").on(table.taskId, table.dependsOnTaskId),
    index("task_dependencies_depends_on_idx").on(table.dependsOnTaskId),
    check("task_dependencies_not_self", sql`${table.taskId} <> ${table.dependsOnTaskId}`),
  ],
);

export const projectDependencies = opsweaveSchema.table(
  "project_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    dependsOnProjectId: uuid("depends_on_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("project_dependencies_unique_idx").on(table.projectId, table.dependsOnProjectId),
    index("project_dependencies_depends_on_idx").on(table.dependsOnProjectId),
    check("project_dependencies_not_self", sql`${table.projectId} <> ${table.dependsOnProjectId}`),
  ],
);

export const entityDependencies = opsweaveSchema.table(
  "entity_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    dependentType: varchar("dependent_type", { length: 16 }).notNull(),
    dependentId: uuid("dependent_id").notNull(),
    blockerType: varchar("blocker_type", { length: 16 }).notNull(),
    blockerId: uuid("blocker_id").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("entity_dependencies_unique_idx").on(
      table.workspaceId,
      table.dependentType,
      table.dependentId,
      table.blockerType,
      table.blockerId,
    ),
    index("entity_dependencies_dependent_idx").on(
      table.workspaceId,
      table.dependentType,
      table.dependentId,
    ),
    index("entity_dependencies_blocker_idx").on(
      table.workspaceId,
      table.blockerType,
      table.blockerId,
    ),
    check(
      "entity_dependencies_types_valid",
      sql`${table.dependentType} in ('task','project') and ${table.blockerType} in ('task','project')`,
    ),
    check(
      "entity_dependencies_not_self",
      sql`${table.dependentType} <> ${table.blockerType} or ${table.dependentId} <> ${table.blockerId}`,
    ),
  ],
);

export const learningEvents = opsweaveSchema.table(
  "learning_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),
    summary: text("summary").notNull(),
    keywords: text("keywords").array().notNull().default([]),
    sourceEntityType: varchar("source_entity_type", { length: 32 }),
    sourceEntityId: uuid("source_entity_id"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("learning_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("learning_events_workspace_kind_idx").on(table.workspaceId, table.kind),
  ],
);

export const protectedTerms = opsweaveSchema.table(
  "protected_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contextProjectId: uuid("context_project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    contextTaskId: uuid("context_task_id").references(() => tasks.id, { onDelete: "cascade" }),
    termType: varchar("term_type", { length: 32 }).notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("protected_terms_project_value_idx")
      .on(table.workspaceId, table.contextProjectId, table.normalizedValue)
      .where(sql`${table.contextProjectId} is not null`),
    uniqueIndex("protected_terms_task_value_idx")
      .on(table.workspaceId, table.contextTaskId, table.normalizedValue)
      .where(sql`${table.contextTaskId} is not null`),
    check(
      "protected_terms_exact_context",
      sql`num_nonnulls(${table.contextProjectId},${table.contextTaskId})=1`,
    ),
    check(
      "protected_terms_type",
      sql`${table.termType} in ('client','company','contact','email','phone','domain','url','social','other')`,
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
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorAliasSnapshot: varchar("actor_alias_snapshot", { length: 100 }),
    action: varchar("action", { length: 100 }).notNull(),
    category: varchar("category", { length: 64 }).notNull().default("system"),
    visibility: varchar("visibility", { length: 32 }).notNull().default("owner_admin"),
    userGenerated: boolean("user_generated").notNull().default(false),
    subjectProjectId: uuid("subject_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    subjectTaskId: uuid("subject_task_id").references(() => tasks.id, { onDelete: "set null" }),
    occurredForUserId: uuid("occurred_for_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: varchar("target_id", { length: 100 }),
    correlationId: uuid("correlation_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_events_correlation_idx").on(table.correlationId),
    index("audit_events_project_created_idx").on(table.subjectProjectId, table.createdAt),
    index("audit_events_task_created_idx").on(table.subjectTaskId, table.createdAt),
    check(
      "audit_events_visibility",
      sql`${table.visibility} in ('owner_admin','authorised_participants','selected_participants','actor_and_owner')`,
    ),
  ],
);

export const activityPayloads = opsweaveSchema.table(
  "activity_payloads",
  {
    auditEventId: uuid("audit_event_id")
      .primaryKey()
      .references(() => auditEvents.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 16 }).notNull(),
    body: text("body").notNull(),
    delegateSafeBody: text("delegate_safe_body"),
    contentStatus: varchar("content_status", { length: 16 }).notNull().default("approved"),
    searchText: text("search_text").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("activity_payloads_kind", sql`${table.kind} in ('message','log_note')`),
    check(
      "activity_payloads_content_status",
      sql`${table.contentStatus} in ('approved','quarantined','rejected')`,
    ),
  ],
);

export const activityMentions = opsweaveSchema.table(
  "activity_mentions",
  {
    auditEventId: uuid("audit_event_id")
      .notNull()
      .references(() => auditEvents.id, { onDelete: "cascade" }),
    mentionedUserId: uuid("mentioned_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    displayAliasSnapshot: varchar("display_alias_snapshot", { length: 100 }),
  },
  (table) => [primaryKey({ columns: [table.auditEventId, table.mentionedUserId] })],
);

export const notifications = opsweaveSchema.table(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceAuditEventId: uuid("source_audit_event_id").references(() => auditEvents.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 64 }).notNull(),
    state: varchar("state", { length: 16 }).notNull().default("unread"),
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body"),
    routeType: varchar("route_type", { length: 32 }),
    routeId: uuid("route_id"),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    readAt: timestamp("read_at", { mode: "date", withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { mode: "date", withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { mode: "date", withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notifications_idempotency_idx").on(table.idempotencyKey),
    index("notifications_recipient_state_idx").on(
      table.recipientUserId,
      table.state,
      table.createdAt,
    ),
    check("notifications_state", sql`${table.state} in ('unread','read','dismissed','cancelled')`),
    check(
      "notifications_route_type",
      sql`${table.routeType} is null or ${table.routeType} in ('project','task','delegations','notifications')`,
    ),
  ],
);

export const notificationOutbox = opsweaveSchema.table(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    notificationId: uuid("notification_id").references(() => notifications.id, {
      onDelete: "cascade",
    }),
    invitationTokenId: uuid("invitation_token_id").references(() => invitationTokens.id, {
      onDelete: "cascade",
    }),
    recipientUserId: uuid("recipient_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull().default("email"),
    templateKey: varchar("template_key", { length: 64 }).notNull(),
    encryptedPayload: text("encrypted_payload"),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    state: varchar("state", { length: 16 }).notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    safeError: varchar("safe_error", { length: 500 }),
    deliveredAt: timestamp("delivered_at", { mode: "date", withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { mode: "date", withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notification_outbox_idempotency_idx").on(table.idempotencyKey),
    index("notification_outbox_claim_idx").on(table.state, table.nextAttemptAt),
    check("notification_outbox_channel", sql`${table.channel}='email'`),
    check(
      "notification_outbox_state",
      sql`${table.state} in ('pending','processing','delivered','failed','cancelled')`,
    ),
    check(
      "notification_outbox_reference",
      sql`num_nonnulls(${table.notificationId},${table.invitationTokenId})=1`,
    ),
  ],
);

export const complianceFlags = opsweaveSchema.table(
  "compliance_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceAuditEventId: uuid("source_audit_event_id").references(() => auditEvents.id, {
      onDelete: "set null",
    }),
    attachmentId: uuid("attachment_id").references(() => attachments.id, {
      onDelete: "set null",
    }),
    subjectProjectId: uuid("subject_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    subjectTaskId: uuid("subject_task_id").references(() => tasks.id, { onDelete: "set null" }),
    delegateUserId: uuid("delegate_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    delegateAliasSnapshot: varchar("delegate_alias_snapshot", { length: 100 }),
    riskLevel: varchar("risk_level", { length: 16 }).notNull(),
    categories: text("categories")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    reason: varchar("reason", { length: 1_000 }).notNull(),
    evidenceReference: text("evidence_reference"),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    model: varchar("model", { length: 100 }),
    provider: varchar("provider", { length: 64 }),
    promptVersion: varchar("prompt_version", { length: 64 }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { mode: "date", withTimezone: true }),
    actionedAt: timestamp("actioned_at", { mode: "date", withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("compliance_flags_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    check("compliance_flags_risk", sql`${table.riskLevel} in ('low','medium','high')`),
    check(
      "compliance_flags_status",
      sql`${table.status} in ('open','dismissed','warned','restricted','revoked')`,
    ),
    check(
      "compliance_flags_source",
      sql`num_nonnulls(${table.sourceAuditEventId},${table.attachmentId})>=1`,
    ),
  ],
);

export const complianceJobs = opsweaveSchema.table(
  "compliance_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    auditEventId: uuid("audit_event_id")
      .notNull()
      .references(() => auditEvents.id, { onDelete: "cascade" }),
    state: varchar("state", { length: 16 }).notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp("claimed_at", { mode: "date", withTimezone: true }),
    completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
    safeError: varchar("safe_error", { length: 500 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("compliance_jobs_audit_event_idx").on(table.auditEventId),
    index("compliance_jobs_claim_idx").on(table.state, table.nextAttemptAt),
    check(
      "compliance_jobs_state",
      sql`${table.state} in ('pending','processing','completed','failed')`,
    ),
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

export const intakeSources = opsweaveSchema.table(
  "intake_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    content: text("content").notNull(),
    contentFingerprint: varchar("content_fingerprint", { length: 64 }).notNull(),
    selectedProjectIds: uuid("selected_project_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createNewProjects: boolean("create_new_projects").notNull().default(false),
    status: varchar("status", { length: 32 }).notNull().default("queued"),
    ...timestamps,
  },
  (table) => [
    index("intake_sources_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("intake_sources_workspace_fingerprint_idx").on(
      table.workspaceId,
      table.contentFingerprint,
      table.createdAt,
    ),
    check(
      "intake_sources_type",
      sql`${table.sourceType} in ('instruction', 'meeting_note', 'other_text', 'transcript')`,
    ),
    check(
      "intake_sources_status",
      sql`${table.status} in ('queued', 'processing', 'completed', 'failed')`,
    ),
  ],
);

export const intakeRuns = opsweaveSchema.table(
  "intake_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => intakeSources.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    schemaVersion: varchar("schema_version", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("queued"),
    safeError: varchar("safe_error", { length: 500 }),
    ...timestamps,
  },
  (table) => [
    index("intake_runs_source_created_idx").on(table.sourceId, table.createdAt),
    check(
      "intake_runs_status",
      sql`${table.status} in ('queued', 'processing', 'completed', 'failed')`,
    ),
  ],
);

export const intakeDrafts = opsweaveSchema.table(
  "intake_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => intakeRuns.id, { onDelete: "cascade" }),
    proposal: jsonb("proposal").notNull(),
    approvalResult: jsonb("approval_result"),
    status: varchar("status", { length: 32 }).notNull().default("review_required"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("intake_drafts_run_idx").on(table.runId),
    check(
      "intake_drafts_status",
      sql`${table.status} in ('review_required', 'approved', 'declined', 'trashed')`,
    ),
  ],
);

export const taskIntakeOrigins = opsweaveSchema.table(
  "task_intake_origins",
  {
    taskId: uuid("task_id")
      .primaryKey()
      .references(() => tasks.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => intakeDrafts.id, { onDelete: "restrict" }),
    confidence: numeric("confidence", { mode: "number", precision: 4, scale: 3 }).notNull(),
    sourceSpan: text("source_span"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("task_intake_origins_draft_idx").on(table.draftId),
    check(
      "task_intake_origins_confidence_range",
      sql`${table.confidence} >= 0 and ${table.confidence} <= 1`,
    ),
  ],
);

export const planningRuns = opsweaveSchema.table(
  "planning_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    settingsVersion: integer("settings_version").notNull(),
    settingsSnapshot: jsonb("settings_snapshot").notNull(),
    scheduledFor: date("scheduled_for"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("planning_runs_workspace_created_idx").on(table.workspaceId, table.createdAt),
    uniqueIndex("planning_runs_workspace_kind_date_idx").on(
      table.workspaceId,
      table.kind,
      table.scheduledFor,
    ),
    check(
      "planning_runs_kind",
      sql`${table.kind} in ('weekly', 'daily', 'preview', 'weekly_selection', 'daily_rollover', 'daily_selection')`,
    ),
    check("planning_runs_status", sql`${table.status} in ('completed', 'no_capacity', 'failed')`),
  ],
);
