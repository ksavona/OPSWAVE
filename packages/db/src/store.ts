import { createHash, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

export class StoreConflictError extends Error {}

export interface SessionTimes {
  absoluteExpiresAt: Date;
  createdAt: Date;
  idleExpiresAt: Date;
  lastSeenAt: Date;
  recentAuthenticatedAt: Date;
  revokedAt: Date | null;
}

export interface WorkingDayInput {
  availableHours: number;
  enabled: boolean;
  weekday: string;
}

export interface GeneralSettingsInput {
  dateDisplay: "iso" | "locale";
  defaultKanbanSort: "greatest_value" | "manual" | "planning_priority";
  defaultLandingView: "projects";
  displayName: string;
  firstDayOfWeek: "monday";
  timezone: string;
  version: number;
}

export interface PrioritizationSettingsInput {
  aiTieBreakingEnabled: boolean;
  allowFinalTaskOverflow: boolean;
  allowMissingSizeSubstitution: boolean;
  businessValueInfluenceEnabled: boolean;
  dailyAutomationEnabled: boolean;
  dailyBufferEnabled: boolean;
  dailyLargeQuota: number;
  dailyMediumQuota: number;
  dailySmallQuota: number;
  deadlineRiskHorizonDays: number;
  manualTodayCarryover: boolean;
  planningBufferPercent: number;
  version: number;
  weeklyAutomationEnabled: boolean;
}

const defaultWorkingDays: WorkingDayInput[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
].map((weekday, index) => ({ availableHours: index < 5 ? 8 : 0, enabled: index < 5, weekday }));

const redactAuditMetadata = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactAuditMetadata);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        /(?:api[_-]?key|authorization|credential|password|secret|session|token)/iu.test(key)
          ? "[REDACTED]"
          : redactAuditMetadata(nested),
      ]),
    );
  }
  return value;
};

export interface OwnerCredentialRecord {
  readonly credentialVersion: number;
  readonly normalizedUsername: string;
  readonly ownerId: string;
  readonly passwordChangedAt: Date;
  readonly passwordHash: string;
  readonly username: string;
  readonly workspaceId: string;
}

export interface SessionRecord extends SessionTimes {
  readonly id: string;
  readonly ownerId: string;
  readonly tokenDigest: string;
  readonly username: string;
  readonly workspaceId: string;
}

export interface WorkspaceConfiguration {
  readonly general: GeneralSettingsInput;
  readonly prioritization: PrioritizationSettingsInput;
  readonly workingDays: readonly WorkingDayInput[];
}

export interface StoredCredentialEnvelope {
  readonly algorithm: string;
  readonly authenticationTag: string;
  readonly ciphertext: string;
  readonly envelopeVersion: number;
  readonly initializationVector: string;
  readonly keyVersion: number;
}

export interface ProviderCredentialStatus {
  readonly configured: boolean;
  readonly lastVerifiedAt: Date | null;
  readonly provider: string;
  readonly updatedAt: Date | null;
  readonly verificationStatus: string;
}

export type BoardSortMode = "greatest_value" | "manual" | "planning_priority";
export type TaskLane =
  | "cancelled"
  | "delegated"
  | "done"
  | "in_focus"
  | "inbox"
  | "monitor_validate"
  | "this_week"
  | "today_1"
  | "today_2"
  | "today_3"
  | "waiting";

export interface ProjectStageRecord {
  readonly archivedAt: Date | null;
  readonly description: string | null;
  readonly id: string;
  readonly llmContext: string | null;
  readonly name: string;
  readonly sequence: number;
  readonly version: number;
}

export interface ProjectRecord {
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly description: string | null;
  readonly id: string;
  readonly name: string;
  readonly stageId: string | null;
  readonly stageName: string | null;
  readonly version: number;
}

export interface TaskChecklistItemRecord {
  readonly completed: boolean;
  readonly id: string;
  readonly label: string;
  readonly position: number;
}

export interface TaskRecord {
  readonly allocatedHours: number | null;
  readonly businessValueRationale: string | null;
  readonly businessValueScore: number | null;
  readonly cancelledAt: Date | null;
  readonly checklist: readonly TaskChecklistItemRecord[];
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly definitionOfDone: string | null;
  readonly dueDate: string | null;
  readonly id: string;
  readonly manualLanePosition: number;
  readonly projectId: string | null;
  readonly size: "large" | "medium" | "small" | null;
  readonly title: string;
  readonly valueAdd: string | null;
  readonly valueSource: "ai_proposed" | "imported" | "owner" | null;
  readonly version: number;
  readonly workDescription: string | null;
  readonly workflowLane: TaskLane;
}

export interface TaskDependencyRecord {
  readonly dependsOnTaskId: string;
  readonly taskId: string;
}

export interface IntakeSourceRecord {
  readonly content: string;
  readonly id: string;
  readonly sourceType: "instruction" | "meeting_note" | "other_text" | "transcript";
  readonly status: "completed" | "failed" | "processing" | "queued";
}

export interface IntakeRunRecord {
  readonly id: string;
  readonly sourceId: string;
}

export interface IntakeDraftRecord {
  readonly id: string;
  readonly proposal: unknown;
  readonly sourceType: IntakeSourceRecord["sourceType"];
  readonly status: "approved" | "declined" | "review_required" | "trashed";
}

export interface ProjectInput {
  description?: string | null | undefined;
  name: string;
  stageId?: string | null | undefined;
}

export interface TaskInput {
  allocatedHours?: number | null | undefined;
  businessValueRationale?: string | null | undefined;
  businessValueScore?: number | null | undefined;
  checklist?: readonly { completed: boolean; label: string; position: number }[] | undefined;
  definitionOfDone?: string | null | undefined;
  dueDate?: string | null | undefined;
  projectId?: string | null | undefined;
  size?: "large" | "medium" | "small" | null | undefined;
  title: string;
  valueAdd?: string | null | undefined;
  valueSource?: "ai_proposed" | "imported" | "owner" | null | undefined;
  workDescription?: string | null | undefined;
  workflowLane?: TaskLane | undefined;
}

const transaction = async <T>(pool: Pool, operation: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const audit = async (
  client: PoolClient,
  input: {
    action: string;
    actorOwnerId?: string;
    metadata?: unknown;
    targetId?: string;
    targetType: string;
    workspaceId: string;
  },
) => {
  await client.query(
    `INSERT INTO opsweave.audit_events
      (workspace_id, actor_owner_id, action, target_type, target_id, correlation_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      input.workspaceId,
      input.actorOwnerId ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      randomUUID(),
      JSON.stringify(redactAuditMetadata(input.metadata ?? {})),
    ],
  );
};

export class OpsWeaveStore {
  public constructor(public readonly pool: Pool) {}

  public async bootstrapOwner(input: {
    normalizedUsername: string;
    passwordHash: string;
    username: string;
    workspaceDisplayName: string;
  }): Promise<OwnerCredentialRecord> {
    return transaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('opsweave-owner-bootstrap'))");
      if ((await client.query("SELECT 1 FROM opsweave.owners LIMIT 1")).rowCount !== 0) {
        throw new StoreConflictError("Owner setup has already been completed.");
      }
      const workspaceResult = await client.query<{ id: string }>(
        "INSERT INTO opsweave.workspaces (display_name, timezone) VALUES ($1,'UTC') RETURNING id",
        [input.workspaceDisplayName],
      );
      const workspaceId = workspaceResult.rows[0]?.id;
      if (workspaceId === undefined) throw new Error("Workspace bootstrap failed.");
      const ownerResult = await client.query<{ id: string }>(
        `INSERT INTO opsweave.owners (workspace_id, username, normalized_username)
         VALUES ($1,$2,$3) RETURNING id`,
        [workspaceId, input.username, input.normalizedUsername],
      );
      const ownerId = ownerResult.rows[0]?.id;
      if (ownerId === undefined) throw new Error("Owner bootstrap failed.");
      const passwordChangedAt = new Date();
      await client.query(
        `INSERT INTO opsweave.owner_credentials
          (owner_id,password_hash,password_algorithm,password_parameters,password_changed_at)
         VALUES ($1,$2,'argon2id-v19',$3::jsonb,$4)`,
        [
          ownerId,
          input.passwordHash,
          JSON.stringify({ memoryCost: 19_456, outputLen: 32, parallelism: 1, timeCost: 2 }),
          passwordChangedAt,
        ],
      );
      await client.query("INSERT INTO opsweave.workspace_settings (workspace_id) VALUES ($1)", [
        workspaceId,
      ]);
      for (const [sequence, name] of ["Planned", "In progress", "Done"].entries()) {
        await client.query(
          "INSERT INTO opsweave.project_stages (workspace_id,name,sequence) VALUES ($1,$2,$3)",
          [workspaceId, name, sequence],
        );
      }
      for (const day of defaultWorkingDays) {
        await client.query(
          `INSERT INTO opsweave.workspace_working_hours
            (workspace_id,weekday,enabled,available_hours) VALUES ($1,$2,$3,$4)`,
          [workspaceId, day.weekday, day.enabled, day.availableHours],
        );
      }
      await audit(client, {
        action: "owner.bootstrap.completed",
        actorOwnerId: ownerId,
        metadata: { normalizedUsername: input.normalizedUsername },
        targetId: ownerId,
        targetType: "owner",
        workspaceId,
      });
      return {
        credentialVersion: 1,
        normalizedUsername: input.normalizedUsername,
        ownerId,
        passwordChangedAt,
        passwordHash: input.passwordHash,
        username: input.username,
        workspaceId,
      };
    });
  }

  public async ownerExists(): Promise<boolean> {
    return (await this.pool.query("SELECT 1 FROM opsweave.owners LIMIT 1")).rowCount !== 0;
  }

  public async findOwnerForLogin(
    normalizedUsername: string,
  ): Promise<OwnerCredentialRecord | null> {
    const result = await this.pool.query<OwnerCredentialRecord>(
      `SELECT o.id AS "ownerId",o.workspace_id AS "workspaceId",o.username,
        o.normalized_username AS "normalizedUsername",c.password_hash AS "passwordHash",
        c.password_changed_at AS "passwordChangedAt",c.credential_version AS "credentialVersion"
       FROM opsweave.owners o JOIN opsweave.owner_credentials c ON c.owner_id=o.id
       WHERE o.normalized_username=$1`,
      [normalizedUsername],
    );
    return result.rows[0] ?? null;
  }

  public async getOnlyOwnerCredential(): Promise<OwnerCredentialRecord | null> {
    const result = await this.pool.query<OwnerCredentialRecord>(
      `SELECT o.id AS "ownerId",o.workspace_id AS "workspaceId",o.username,
        o.normalized_username AS "normalizedUsername",c.password_hash AS "passwordHash",
        c.password_changed_at AS "passwordChangedAt",c.credential_version AS "credentialVersion"
       FROM opsweave.owners o JOIN opsweave.owner_credentials c ON c.owner_id=o.id LIMIT 1`,
    );
    return result.rows[0] ?? null;
  }

  public async recoverOwner(normalizedUsername: string, passwordHash: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query<{ ownerId: string; workspaceId: string }>(
        `SELECT id AS "ownerId",workspace_id AS "workspaceId"
         FROM opsweave.owners WHERE normalized_username=$1 FOR UPDATE`,
        [normalizedUsername],
      );
      const owner = result.rows[0];
      if (owner === undefined) {
        throw new StoreConflictError("The local owner was not found.");
      }
      await client.query(
        `UPDATE opsweave.owner_credentials SET password_hash=$1,password_changed_at=now(),
          credential_version=credential_version+1,updated_at=now() WHERE owner_id=$2`,
        [passwordHash, owner.ownerId],
      );
      await client.query(
        "UPDATE opsweave.sessions SET revoked_at=now() WHERE owner_id=$1 AND revoked_at IS NULL",
        [owner.ownerId],
      );
      await audit(client, {
        action: "owner.credentials.recovered",
        actorOwnerId: owner.ownerId,
        metadata: { allSessionsRevoked: true },
        targetId: owner.ownerId,
        targetType: "owner",
        workspaceId: owner.workspaceId,
      });
    });
  }

  public async createSession(
    owner: OwnerCredentialRecord,
    tokenDigest: string,
    times: SessionTimes,
  ): Promise<SessionRecord> {
    const result = await this.pool.query<SessionRecord>(
      `INSERT INTO opsweave.sessions
        (owner_id,workspace_id,token_digest,created_at,last_seen_at,idle_expires_at,
         absolute_expires_at,recent_authenticated_at,revoked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id,owner_id AS "ownerId",workspace_id AS "workspaceId",token_digest AS "tokenDigest",
        created_at AS "createdAt",last_seen_at AS "lastSeenAt",idle_expires_at AS "idleExpiresAt",
        absolute_expires_at AS "absoluteExpiresAt",recent_authenticated_at AS "recentAuthenticatedAt",
        revoked_at AS "revokedAt"`,
      [
        owner.ownerId,
        owner.workspaceId,
        tokenDigest,
        times.createdAt,
        times.lastSeenAt,
        times.idleExpiresAt,
        times.absoluteExpiresAt,
        times.recentAuthenticatedAt,
        times.revokedAt,
      ],
    );
    const session = result.rows[0];
    if (session === undefined) throw new Error("Session creation failed.");
    return { ...session, username: owner.username };
  }

  public async findSessionByDigest(tokenDigest: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRecord>(
      `SELECT s.id,s.owner_id AS "ownerId",s.workspace_id AS "workspaceId",
        s.token_digest AS "tokenDigest",s.created_at AS "createdAt",s.last_seen_at AS "lastSeenAt",
        s.idle_expires_at AS "idleExpiresAt",s.absolute_expires_at AS "absoluteExpiresAt",
        s.recent_authenticated_at AS "recentAuthenticatedAt",s.revoked_at AS "revokedAt",o.username
       FROM opsweave.sessions s JOIN opsweave.owners o ON o.id=s.owner_id WHERE s.token_digest=$1`,
      [tokenDigest],
    );
    return result.rows[0] ?? null;
  }

  public async touchSession(id: string, now: Date, idleExpiresAt: Date): Promise<void> {
    await this.pool.query(
      "UPDATE opsweave.sessions SET last_seen_at=$2,idle_expires_at=$3 WHERE id=$1 AND revoked_at IS NULL",
      [id, now, idleExpiresAt],
    );
  }

  public async revokeSession(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE opsweave.sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL",
      [id],
    );
  }

  public async revokeOtherSessions(
    ownerId: string,
    workspaceId: string,
    currentSessionId: string,
  ): Promise<number> {
    return transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE opsweave.sessions SET revoked_at=now()
         WHERE owner_id=$1 AND id<>$2 AND revoked_at IS NULL`,
        [ownerId, currentSessionId],
      );
      await audit(client, {
        action: "sessions.others_revoked",
        actorOwnerId: ownerId,
        metadata: { revokedCount: result.rowCount ?? 0 },
        targetType: "session",
        workspaceId,
      });
      return result.rowCount ?? 0;
    });
  }

  public async countOtherActiveSessions(ownerId: string, currentId: string, now: Date) {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM opsweave.sessions
       WHERE owner_id=$1 AND id<>$2 AND revoked_at IS NULL
         AND idle_expires_at>$3 AND absolute_expires_at>$3`,
      [ownerId, currentId, now],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  public async changePassword(input: {
    credentialVersion: number;
    newPasswordHash: string;
    ownerId: string;
    tokenDigest: string;
    times: SessionTimes;
    username: string;
    workspaceId: string;
  }): Promise<SessionRecord> {
    return transaction(this.pool, async (client) => {
      const updated = await client.query(
        `UPDATE opsweave.owner_credentials SET password_hash=$1,password_changed_at=now(),
          credential_version=credential_version+1,updated_at=now()
         WHERE owner_id=$2 AND credential_version=$3`,
        [input.newPasswordHash, input.ownerId, input.credentialVersion],
      );
      if (updated.rowCount !== 1) {
        throw new StoreConflictError("Credentials changed in another request.");
      }
      await client.query(
        "UPDATE opsweave.sessions SET revoked_at=now() WHERE owner_id=$1 AND revoked_at IS NULL",
        [input.ownerId],
      );
      const sessionResult = await client.query<SessionRecord>(
        `INSERT INTO opsweave.sessions
          (owner_id,workspace_id,token_digest,created_at,last_seen_at,idle_expires_at,
           absolute_expires_at,recent_authenticated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,owner_id AS "ownerId",workspace_id AS "workspaceId",token_digest AS "tokenDigest",
          created_at AS "createdAt",last_seen_at AS "lastSeenAt",idle_expires_at AS "idleExpiresAt",
          absolute_expires_at AS "absoluteExpiresAt",recent_authenticated_at AS "recentAuthenticatedAt",
          revoked_at AS "revokedAt"`,
        [
          input.ownerId,
          input.workspaceId,
          input.tokenDigest,
          input.times.createdAt,
          input.times.lastSeenAt,
          input.times.idleExpiresAt,
          input.times.absoluteExpiresAt,
          input.times.recentAuthenticatedAt,
        ],
      );
      await audit(client, {
        action: "owner.password_changed",
        actorOwnerId: input.ownerId,
        metadata: { otherSessionsInvalidated: true, sessionRotated: true },
        targetId: input.ownerId,
        targetType: "owner",
        workspaceId: input.workspaceId,
      });
      const session = sessionResult.rows[0];
      if (session === undefined) throw new Error("Session rotation failed.");
      return { ...session, username: input.username };
    });
  }

  public async recordLoginAttempt(
    accountSignalDigest: string,
    networkSignalDigest: string,
    outcome: "failed" | "limited" | "succeeded",
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO opsweave.login_attempts
        (account_signal_digest,network_signal_digest,outcome,expires_at)
       VALUES ($1,$2,$3,now()+interval '30 days')`,
      [accountSignalDigest, networkSignalDigest, outcome],
    );
    await this.pool.query("DELETE FROM opsweave.login_attempts WHERE expires_at<=now()");
  }

  public async getWorkspaceConfiguration(workspaceId: string): Promise<WorkspaceConfiguration> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT w.display_name AS "displayName",w.timezone,s.date_display AS "dateDisplay",
        s.default_kanban_sort AS "defaultKanbanSort",s.default_landing_view AS "defaultLandingView",
        s.first_day_of_week AS "firstDayOfWeek",s.planning_buffer_percent::float8 AS "planningBufferPercent",
        s.deadline_risk_horizon_days AS "deadlineRiskHorizonDays",s.daily_large_quota AS "dailyLargeQuota",
        s.daily_medium_quota AS "dailyMediumQuota",s.daily_small_quota AS "dailySmallQuota",
        s.allow_missing_size_substitution AS "allowMissingSizeSubstitution",
        s.allow_final_task_overflow AS "allowFinalTaskOverflow",s.manual_today_carryover AS "manualTodayCarryover",
        s.daily_buffer_enabled AS "dailyBufferEnabled",s.ai_tie_breaking_enabled AS "aiTieBreakingEnabled",
        s.business_value_influence_enabled AS "businessValueInfluenceEnabled",
        s.weekly_automation_enabled AS "weeklyAutomationEnabled",s.daily_automation_enabled AS "dailyAutomationEnabled",
        s.version FROM opsweave.workspaces w JOIN opsweave.workspace_settings s ON s.workspace_id=w.id
       WHERE w.id=$1`,
      [workspaceId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Workspace settings not found.");
    const days = await this.pool.query<WorkingDayInput>(
      `SELECT weekday,enabled,available_hours::float8 AS "availableHours"
       FROM opsweave.workspace_working_hours WHERE workspace_id=$1
       ORDER BY array_position(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],weekday)`,
      [workspaceId],
    );
    const version = Number(row.version);
    return {
      general: {
        dateDisplay: row.dateDisplay as "iso" | "locale",
        defaultKanbanSort: row.defaultKanbanSort as
          "manual" | "planning_priority" | "greatest_value",
        defaultLandingView: "projects",
        displayName: String(row.displayName),
        firstDayOfWeek: "monday",
        timezone: String(row.timezone),
        version,
      },
      prioritization: {
        aiTieBreakingEnabled: Boolean(row.aiTieBreakingEnabled),
        allowFinalTaskOverflow: Boolean(row.allowFinalTaskOverflow),
        allowMissingSizeSubstitution: Boolean(row.allowMissingSizeSubstitution),
        businessValueInfluenceEnabled: Boolean(row.businessValueInfluenceEnabled),
        dailyAutomationEnabled: Boolean(row.dailyAutomationEnabled),
        dailyBufferEnabled: Boolean(row.dailyBufferEnabled),
        dailyLargeQuota: Number(row.dailyLargeQuota),
        dailyMediumQuota: Number(row.dailyMediumQuota),
        dailySmallQuota: Number(row.dailySmallQuota),
        deadlineRiskHorizonDays: Number(row.deadlineRiskHorizonDays),
        manualTodayCarryover: Boolean(row.manualTodayCarryover),
        planningBufferPercent: Number(row.planningBufferPercent),
        version,
        weeklyAutomationEnabled: Boolean(row.weeklyAutomationEnabled),
      },
      workingDays: days.rows,
    };
  }

  private async claimVersion(client: PoolClient, workspaceId: string, expected: number) {
    const result = await client.query<{ version: number }>(
      `UPDATE opsweave.workspace_settings SET version=version+1,updated_at=now()
       WHERE workspace_id=$1 AND version=$2 RETURNING version`,
      [workspaceId, expected],
    );
    const version = result.rows[0]?.version;
    if (version === undefined) {
      throw new StoreConflictError(
        "Settings changed in another session. Review the latest values and try again.",
      );
    }
    return version;
  }

  public async updateGeneral(workspaceId: string, ownerId: string, input: GeneralSettingsInput) {
    return transaction(this.pool, async (client) => {
      const before = await this.getWorkspaceConfiguration(workspaceId);
      const version = await this.claimVersion(client, workspaceId, input.version);
      await client.query(
        "UPDATE opsweave.workspaces SET display_name=$2,timezone=$3,version=version+1,updated_at=now() WHERE id=$1",
        [workspaceId, input.displayName, input.timezone],
      );
      await client.query(
        `UPDATE opsweave.workspace_settings SET date_display=$2,default_kanban_sort=$3,
          default_landing_view=$4,first_day_of_week=$5 WHERE workspace_id=$1`,
        [
          workspaceId,
          input.dateDisplay,
          input.defaultKanbanSort,
          input.defaultLandingView,
          input.firstDayOfWeek,
        ],
      );
      await audit(client, {
        action: "settings.general.updated",
        actorOwnerId: ownerId,
        metadata: { after: { ...input, version }, before: before.general },
        targetId: workspaceId,
        targetType: "workspace_settings",
        workspaceId,
      });
      return version;
    });
  }

  public async updateWorkingTime(
    workspaceId: string,
    ownerId: string,
    days: readonly WorkingDayInput[],
    expectedVersion: number,
  ) {
    return transaction(this.pool, async (client) => {
      const before = await this.getWorkspaceConfiguration(workspaceId);
      const version = await this.claimVersion(client, workspaceId, expectedVersion);
      for (const day of days) {
        await client.query(
          `INSERT INTO opsweave.workspace_working_hours
            (workspace_id,weekday,enabled,available_hours,updated_at) VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (workspace_id,weekday) DO UPDATE SET enabled=excluded.enabled,
            available_hours=excluded.available_hours,updated_at=now()`,
          [workspaceId, day.weekday, day.enabled, day.availableHours],
        );
      }
      await audit(client, {
        action: "settings.working_time.updated",
        actorOwnerId: ownerId,
        metadata: { after: days, before: before.workingDays, version },
        targetId: workspaceId,
        targetType: "workspace_working_hours",
        workspaceId,
      });
      return version;
    });
  }

  public async updatePrioritization(
    workspaceId: string,
    ownerId: string,
    input: PrioritizationSettingsInput,
  ) {
    return transaction(this.pool, async (client) => {
      const before = await this.getWorkspaceConfiguration(workspaceId);
      const version = await this.claimVersion(client, workspaceId, input.version);
      await client.query(
        `UPDATE opsweave.workspace_settings SET planning_buffer_percent=$2,deadline_risk_horizon_days=$3,
          daily_large_quota=$4,daily_medium_quota=$5,daily_small_quota=$6,
          allow_missing_size_substitution=$7,allow_final_task_overflow=$8,manual_today_carryover=$9,
          daily_buffer_enabled=$10,ai_tie_breaking_enabled=$11,business_value_influence_enabled=$12,
          weekly_automation_enabled=$13,daily_automation_enabled=$14 WHERE workspace_id=$1`,
        [
          workspaceId,
          input.planningBufferPercent,
          input.deadlineRiskHorizonDays,
          input.dailyLargeQuota,
          input.dailyMediumQuota,
          input.dailySmallQuota,
          input.allowMissingSizeSubstitution,
          input.allowFinalTaskOverflow,
          input.manualTodayCarryover,
          input.dailyBufferEnabled,
          input.aiTieBreakingEnabled,
          input.businessValueInfluenceEnabled,
          input.weeklyAutomationEnabled,
          input.dailyAutomationEnabled,
        ],
      );
      await audit(client, {
        action: "settings.prioritization.updated",
        actorOwnerId: ownerId,
        metadata: { after: { ...input, version }, before: before.prioritization },
        targetId: workspaceId,
        targetType: "workspace_settings",
        workspaceId,
      });
      return version;
    });
  }

  public async credentialStatus(
    workspaceId: string,
    provider: string,
  ): Promise<ProviderCredentialStatus> {
    const result = await this.pool.query<ProviderCredentialStatus>(
      `SELECT provider,true AS configured,verification_status AS "verificationStatus",
        last_verified_at AS "lastVerifiedAt",updated_at AS "updatedAt"
       FROM opsweave.encrypted_provider_credentials WHERE workspace_id=$1 AND provider=$2`,
      [workspaceId, provider],
    );
    return (
      result.rows[0] ?? {
        configured: false,
        lastVerifiedAt: null,
        provider,
        updatedAt: null,
        verificationStatus: "unconfigured",
      }
    );
  }

  public async credentialEnvelope(workspaceId: string, provider: string) {
    const result = await this.pool.query<StoredCredentialEnvelope>(
      `SELECT algorithm,authentication_tag AS "authenticationTag",ciphertext,
        envelope_version AS "envelopeVersion",initialization_vector AS "initializationVector",
        key_version AS "keyVersion" FROM opsweave.encrypted_provider_credentials
       WHERE workspace_id=$1 AND provider=$2`,
      [workspaceId, provider],
    );
    return result.rows[0] ?? null;
  }

  public async saveCredential(input: {
    envelope: StoredCredentialEnvelope;
    ownerId: string;
    provider: string;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const previous = await client.query(
        "SELECT 1 FROM opsweave.encrypted_provider_credentials WHERE workspace_id=$1 AND provider=$2",
        [input.workspaceId, input.provider],
      );
      const e = input.envelope;
      await client.query(
        `INSERT INTO opsweave.encrypted_provider_credentials
          (workspace_id,provider,algorithm,authentication_tag,ciphertext,envelope_version,
           initialization_vector,key_version,verification_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unverified')
         ON CONFLICT (workspace_id,provider) DO UPDATE SET algorithm=excluded.algorithm,
          authentication_tag=excluded.authentication_tag,ciphertext=excluded.ciphertext,
          envelope_version=excluded.envelope_version,initialization_vector=excluded.initialization_vector,
          key_version=excluded.key_version,verification_status='unverified',last_verified_at=null,updated_at=now()`,
        [
          input.workspaceId,
          input.provider,
          e.algorithm,
          e.authenticationTag,
          e.ciphertext,
          e.envelopeVersion,
          e.initializationVector,
          e.keyVersion,
        ],
      );
      await audit(client, {
        action: previous.rowCount === 0 ? "ai.credential.configured" : "ai.credential.replaced",
        actorOwnerId: input.ownerId,
        metadata: { configured: true, provider: input.provider },
        targetId: input.provider,
        targetType: "provider_credential",
        workspaceId: input.workspaceId,
      });
    });
  }

  public async removeCredential(workspaceId: string, ownerId: string, provider: string) {
    return transaction(this.pool, async (client) => {
      const result = await client.query(
        "DELETE FROM opsweave.encrypted_provider_credentials WHERE workspace_id=$1 AND provider=$2",
        [workspaceId, provider],
      );
      await audit(client, {
        action: "ai.credential.removed",
        actorOwnerId: ownerId,
        metadata: { configured: false, provider },
        targetId: provider,
        targetType: "provider_credential",
        workspaceId,
      });
      return result.rowCount === 1;
    });
  }

  public async recordCredentialVerification(
    workspaceId: string,
    ownerId: string,
    provider: string,
    status: "configuration_error" | "invalid" | "unavailable" | "verified",
  ) {
    await transaction(this.pool, async (client) => {
      await client.query(
        `UPDATE opsweave.encrypted_provider_credentials SET verification_status=$3,
          last_verified_at=now(),updated_at=now() WHERE workspace_id=$1 AND provider=$2`,
        [workspaceId, provider, status],
      );
      await audit(client, {
        action: "ai.credential.verified",
        actorOwnerId: ownerId,
        metadata: { provider, status },
        targetId: provider,
        targetType: "provider_credential",
        workspaceId,
      });
    });
  }

  public async listProjectStages(workspaceId: string): Promise<ProjectStageRecord[]> {
    const result = await this.pool.query<ProjectStageRecord>(
      `SELECT id,name,description,llm_context AS "llmContext",sequence,archived_at AS "archivedAt",version
       FROM opsweave.project_stages WHERE workspace_id=$1 ORDER BY archived_at NULLS FIRST,sequence,id`,
      [workspaceId],
    );
    return result.rows;
  }

  public async createProjectStage(
    workspaceId: string,
    ownerId: string,
    input: {
      description?: string | null | undefined;
      llmContext?: string | null | undefined;
      name: string;
      sequence: number;
    },
  ): Promise<ProjectStageRecord> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<ProjectStageRecord>(
        `INSERT INTO opsweave.project_stages (workspace_id,name,description,llm_context,sequence)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id,name,description,llm_context AS "llmContext",sequence,archived_at AS "archivedAt",version`,
        [
          workspaceId,
          input.name,
          input.description ?? null,
          input.llmContext ?? null,
          input.sequence,
        ],
      );
      const stage = result.rows[0];
      if (stage === undefined) throw new Error("Project stage creation failed.");
      await audit(client, {
        action: "project_stage.created",
        actorOwnerId: ownerId,
        metadata: { name: stage.name, sequence: stage.sequence },
        targetId: stage.id,
        targetType: "project_stage",
        workspaceId,
      });
      return stage;
    });
  }

  public async updateProjectStage(
    workspaceId: string,
    ownerId: string,
    stageId: string,
    input: {
      description?: string | null | undefined;
      llmContext?: string | null | undefined;
      name: string;
      sequence: number;
      version: number;
    },
  ): Promise<ProjectStageRecord> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<ProjectStageRecord>(
        `UPDATE opsweave.project_stages SET name=$3,description=$4,llm_context=$5,sequence=$6,
          version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$7
         RETURNING id,name,description,llm_context AS "llmContext",sequence,archived_at AS "archivedAt",version`,
        [
          stageId,
          workspaceId,
          input.name,
          input.description ?? null,
          input.llmContext ?? null,
          input.sequence,
          input.version,
        ],
      );
      const stage = result.rows[0];
      if (stage === undefined)
        throw new StoreConflictError("Project stage changed in another request.");
      await audit(client, {
        action: "project_stage.updated",
        actorOwnerId: ownerId,
        metadata: { name: stage.name, sequence: stage.sequence },
        targetId: stage.id,
        targetType: "project_stage",
        workspaceId,
      });
      return stage;
    });
  }

  public async archiveProjectStage(
    workspaceId: string,
    ownerId: string,
    stageId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE opsweave.project_stages SET archived_at=now(),version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL`,
        [stageId, workspaceId],
      );
      if (result.rowCount !== 1) throw new StoreConflictError("Project stage is not available.");
      await audit(client, {
        action: "project_stage.archived",
        actorOwnerId: ownerId,
        metadata: {},
        targetId: stageId,
        targetType: "project_stage",
        workspaceId,
      });
    });
  }

  public async listProjects(workspaceId: string): Promise<ProjectRecord[]> {
    const result = await this.pool.query<ProjectRecord>(
      `SELECT p.id,p.name,p.description,p.stage_id AS "stageId",s.name AS "stageName",
        p.archived_at AS "archivedAt",p.created_at AS "createdAt",p.version
       FROM opsweave.projects p LEFT JOIN opsweave.project_stages s ON s.id=p.stage_id
       WHERE p.workspace_id=$1 ORDER BY p.archived_at NULLS FIRST,s.sequence NULLS LAST,p.created_at,p.id`,
      [workspaceId],
    );
    return result.rows;
  }

  public async createProject(
    workspaceId: string,
    ownerId: string,
    input: ProjectInput,
  ): Promise<ProjectRecord> {
    return transaction(this.pool, async (client) => {
      let stageId = input.stageId ?? null;
      if (stageId === null) {
        const defaultStage = await client.query<{ id: string }>(
          `SELECT id FROM opsweave.project_stages WHERE workspace_id=$1 AND archived_at IS NULL
           ORDER BY sequence,id LIMIT 1`,
          [workspaceId],
        );
        stageId = defaultStage.rows[0]?.id ?? null;
      }
      if (stageId !== null) {
        const stage = await client.query(
          "SELECT 1 FROM opsweave.project_stages WHERE id=$1 AND workspace_id=$2",
          [stageId, workspaceId],
        );
        if (stage.rowCount !== 1)
          throw new StoreConflictError("The selected project stage is unavailable.");
      }
      const result = await client.query<ProjectRecord>(
        `INSERT INTO opsweave.projects (workspace_id,name,description,stage_id) VALUES ($1,$2,$3,$4)
         RETURNING id,name,description,stage_id AS "stageId",archived_at AS "archivedAt",created_at AS "createdAt",version`,
        [workspaceId, input.name, input.description ?? null, stageId],
      );
      const project = result.rows[0];
      if (project === undefined) throw new Error("Project creation failed.");
      const stageName =
        stageId === null
          ? null
          : ((
              await client.query<{ name: string }>(
                "SELECT name FROM opsweave.project_stages WHERE id=$1",
                [stageId],
              )
            ).rows[0]?.name ?? null);
      const record = { ...project, stageName };
      await audit(client, {
        action: "project.created",
        actorOwnerId: ownerId,
        metadata: { name: project.name, stageId },
        targetId: project.id,
        targetType: "project",
        workspaceId,
      });
      return record;
    });
  }

  public async updateProject(
    workspaceId: string,
    ownerId: string,
    projectId: string,
    input: ProjectInput & { archived?: boolean | undefined; version: number },
  ): Promise<ProjectRecord> {
    return transaction(this.pool, async (client) => {
      const stageId = input.stageId ?? null;
      if (stageId !== null) {
        const stage = await client.query(
          "SELECT 1 FROM opsweave.project_stages WHERE id=$1 AND workspace_id=$2",
          [stageId, workspaceId],
        );
        if (stage.rowCount !== 1)
          throw new StoreConflictError("The selected project stage is unavailable.");
      }
      const result = await client.query<ProjectRecord>(
        `UPDATE opsweave.projects SET name=$3,description=$4,stage_id=$5,
          archived_at=CASE WHEN $6 THEN coalesce(archived_at,now()) ELSE NULL END,
          version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$7
         RETURNING id,name,description,stage_id AS "stageId",archived_at AS "archivedAt",created_at AS "createdAt",version`,
        [
          projectId,
          workspaceId,
          input.name,
          input.description ?? null,
          stageId,
          input.archived ?? false,
          input.version,
        ],
      );
      const project = result.rows[0];
      if (project === undefined)
        throw new StoreConflictError("Project changed in another request.");
      const stageName =
        stageId === null
          ? null
          : ((
              await client.query<{ name: string }>(
                "SELECT name FROM opsweave.project_stages WHERE id=$1",
                [stageId],
              )
            ).rows[0]?.name ?? null);
      await audit(client, {
        action: input.archived ? "project.archived" : "project.updated",
        actorOwnerId: ownerId,
        metadata: { name: project.name, stageId, archived: Boolean(input.archived) },
        targetId: project.id,
        targetType: "project",
        workspaceId,
      });
      return { ...project, stageName };
    });
  }

  private async attachChecklist(
    tasksToAttach: Omit<TaskRecord, "checklist">[],
  ): Promise<TaskRecord[]> {
    if (tasksToAttach.length === 0) return [];
    const ids = tasksToAttach.map((task) => task.id);
    const result = await this.pool.query<TaskChecklistItemRecord & { taskId: string }>(
      `SELECT id,task_id AS "taskId",label,completed,position FROM opsweave.task_checklist_items
       WHERE task_id=ANY($1::uuid[]) ORDER BY task_id,position,id`,
      [ids],
    );
    const byTask = new Map<string, TaskChecklistItemRecord[]>();
    for (const item of result.rows) {
      const items = byTask.get(item.taskId) ?? [];
      items.push({
        completed: item.completed,
        id: item.id,
        label: item.label,
        position: item.position,
      });
      byTask.set(item.taskId, items);
    }
    return tasksToAttach.map((task) => ({ ...task, checklist: byTask.get(task.id) ?? [] }));
  }

  public async listTasks(
    workspaceId: string,
    sort: BoardSortMode,
    projectId?: string,
  ): Promise<TaskRecord[]> {
    const orderBy =
      sort === "greatest_value"
        ? `CASE WHEN business_value_score IS NULL THEN 1 ELSE 0 END,business_value_score DESC,
           due_date NULLS LAST,created_at,id`
        : sort === "planning_priority"
          ? "due_date NULLS LAST,created_at,id"
          : "manual_lane_position,created_at,id";
    const result = await this.pool.query<Omit<TaskRecord, "checklist">>(
      `SELECT id,project_id AS "projectId",title,workflow_lane AS "workflowLane",
        allocated_hours::float8 AS "allocatedHours",size,value_add AS "valueAdd",
        work_description AS "workDescription",definition_of_done AS "definitionOfDone",due_date AS "dueDate",
        business_value_score AS "businessValueScore",business_value_rationale AS "businessValueRationale",
        value_source AS "valueSource",manual_lane_position::float8 AS "manualLanePosition",
        completed_at AS "completedAt",cancelled_at AS "cancelledAt",version,created_at AS "createdAt"
       FROM opsweave.tasks WHERE workspace_id=$1 ${projectId === undefined ? "" : "AND project_id=$2"}
       ORDER BY workflow_lane,${orderBy}`,
      projectId === undefined ? [workspaceId] : [workspaceId, projectId],
    );
    return this.attachChecklist(result.rows);
  }

  public async createTask(
    workspaceId: string,
    ownerId: string,
    input: TaskInput,
  ): Promise<TaskRecord> {
    return transaction(this.pool, async (client) => {
      const lane = input.workflowLane ?? "inbox";
      if (input.projectId !== undefined && input.projectId !== null) {
        const project = await client.query(
          "SELECT 1 FROM opsweave.projects WHERE id=$1 AND workspace_id=$2",
          [input.projectId, workspaceId],
        );
        if (project.rowCount !== 1)
          throw new StoreConflictError("The selected project is unavailable.");
      }
      const position = await client.query<{ position: number }>(
        `SELECT coalesce(max(manual_lane_position),0)::float8+1 AS position FROM opsweave.tasks
         WHERE workspace_id=$1 AND workflow_lane=$2`,
        [workspaceId, lane],
      );
      const result = await client.query<Omit<TaskRecord, "checklist">>(
        `INSERT INTO opsweave.tasks
          (workspace_id,project_id,title,workflow_lane,allocated_hours,size,value_add,work_description,
           definition_of_done,due_date,business_value_score,business_value_rationale,value_source,
           value_updated_at,manual_lane_position,completed_at,cancelled_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
           CASE WHEN $11::integer IS NULL THEN NULL ELSE now() END,$14,
           CASE WHEN $4::varchar='done' THEN now() ELSE NULL END,CASE WHEN $4::varchar='cancelled' THEN now() ELSE NULL END)
         RETURNING id,project_id AS "projectId",title,workflow_lane AS "workflowLane",
          allocated_hours::float8 AS "allocatedHours",size,value_add AS "valueAdd",work_description AS "workDescription",
          definition_of_done AS "definitionOfDone",due_date AS "dueDate",business_value_score AS "businessValueScore",
          business_value_rationale AS "businessValueRationale",value_source AS "valueSource",
          manual_lane_position::float8 AS "manualLanePosition",completed_at AS "completedAt",cancelled_at AS "cancelledAt",version,created_at AS "createdAt"`,
        [
          workspaceId,
          input.projectId ?? null,
          input.title,
          lane,
          input.allocatedHours ?? null,
          input.size ?? null,
          input.valueAdd ?? null,
          input.workDescription ?? null,
          input.definitionOfDone ?? null,
          input.dueDate ?? null,
          input.businessValueScore ?? null,
          input.businessValueRationale ?? null,
          input.valueSource ?? null,
          position.rows[0]?.position ?? 1,
        ],
      );
      const task = result.rows[0];
      if (task === undefined) throw new Error("Task creation failed.");
      for (const item of input.checklist ?? []) {
        await client.query(
          "INSERT INTO opsweave.task_checklist_items (task_id,label,completed,position) VALUES ($1,$2,$3,$4)",
          [task.id, item.label, item.completed, item.position],
        );
      }
      await audit(client, {
        action: "task.created",
        actorOwnerId: ownerId,
        metadata: { lane, projectId: task.projectId, title: task.title },
        targetId: task.id,
        targetType: "task",
        workspaceId,
      });
      return {
        ...task,
        checklist: (input.checklist ?? []).map((item, index) => ({
          ...item,
          id: `created-${String(index)}`,
        })),
      };
    });
  }

  public async updateTask(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    input: TaskInput & { version: number },
  ): Promise<TaskRecord> {
    return transaction(this.pool, async (client) => {
      const existingResult = await client.query<{ valueSource: TaskRecord["valueSource"] }>(
        'SELECT value_source AS "valueSource" FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2',
        [taskId, workspaceId],
      );
      const existing = existingResult.rows[0];
      if (existing === undefined) throw new StoreConflictError("Task is unavailable.");
      if (existing.valueSource === "owner" && input.valueSource === "ai_proposed")
        throw new StoreConflictError("An AI proposal cannot overwrite an owner value.");
      if (input.projectId !== undefined && input.projectId !== null) {
        const project = await client.query(
          "SELECT 1 FROM opsweave.projects WHERE id=$1 AND workspace_id=$2",
          [input.projectId, workspaceId],
        );
        if (project.rowCount !== 1)
          throw new StoreConflictError("The selected project is unavailable.");
      }
      const lane = input.workflowLane ?? "inbox";
      const result = await client.query<Omit<TaskRecord, "checklist">>(
        `UPDATE opsweave.tasks SET project_id=$3,title=$4,workflow_lane=$5,allocated_hours=$6,size=$7,
          value_add=$8,work_description=$9,definition_of_done=$10,due_date=$11,business_value_score=$12,
          business_value_rationale=$13,value_source=$14,value_updated_at=CASE WHEN $12 IS NULL THEN NULL ELSE now() END,
          completed_at=CASE WHEN $5='done' THEN coalesce(completed_at,now()) ELSE NULL END,
          cancelled_at=CASE WHEN $5='cancelled' THEN coalesce(cancelled_at,now()) ELSE NULL END,
          version=version+1,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND version=$15
         RETURNING id,project_id AS "projectId",title,workflow_lane AS "workflowLane",allocated_hours::float8 AS "allocatedHours",
          size,value_add AS "valueAdd",work_description AS "workDescription",definition_of_done AS "definitionOfDone",due_date AS "dueDate",
          business_value_score AS "businessValueScore",business_value_rationale AS "businessValueRationale",value_source AS "valueSource",
          manual_lane_position::float8 AS "manualLanePosition",completed_at AS "completedAt",cancelled_at AS "cancelledAt",version,created_at AS "createdAt"`,
        [
          taskId,
          workspaceId,
          input.projectId ?? null,
          input.title,
          lane,
          input.allocatedHours ?? null,
          input.size ?? null,
          input.valueAdd ?? null,
          input.workDescription ?? null,
          input.definitionOfDone ?? null,
          input.dueDate ?? null,
          input.businessValueScore ?? null,
          input.businessValueRationale ?? null,
          input.valueSource ?? null,
          input.version,
        ],
      );
      const task = result.rows[0];
      if (task === undefined) throw new StoreConflictError("Task changed in another request.");
      if (input.checklist !== undefined) {
        await client.query("DELETE FROM opsweave.task_checklist_items WHERE task_id=$1", [taskId]);
        for (const item of input.checklist)
          await client.query(
            "INSERT INTO opsweave.task_checklist_items (task_id,label,completed,position) VALUES ($1,$2,$3,$4)",
            [taskId, item.label, item.completed, item.position],
          );
      }
      await audit(client, {
        action: "task.updated",
        actorOwnerId: ownerId,
        metadata: { lane, valueScore: task.businessValueScore, valueSource: task.valueSource },
        targetId: task.id,
        targetType: "task",
        workspaceId,
      });
      return {
        ...task,
        checklist: (input.checklist ?? []).map((item, index) => ({
          ...item,
          id: `updated-${String(index)}`,
        })),
      };
    });
  }

  public async moveTask(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    lane: TaskLane,
    version: number,
  ): Promise<TaskRecord> {
    return transaction(this.pool, async (client) => {
      const position = await client.query<{ position: number }>(
        `SELECT coalesce(max(manual_lane_position),0)::float8+1 AS position FROM opsweave.tasks WHERE workspace_id=$1 AND workflow_lane=$2`,
        [workspaceId, lane],
      );
      const result = await client.query<Omit<TaskRecord, "checklist">>(
        `UPDATE opsweave.tasks SET workflow_lane=$3,manual_lane_position=$4,
          completed_at=CASE WHEN $3::varchar='done' THEN coalesce(completed_at,now()) ELSE NULL END,
          cancelled_at=CASE WHEN $3::varchar='cancelled' THEN coalesce(cancelled_at,now()) ELSE NULL END,
          version=version+1,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND version=$5
         RETURNING id,project_id AS "projectId",title,workflow_lane AS "workflowLane",allocated_hours::float8 AS "allocatedHours",size,value_add AS "valueAdd",work_description AS "workDescription",definition_of_done AS "definitionOfDone",due_date AS "dueDate",business_value_score AS "businessValueScore",business_value_rationale AS "businessValueRationale",value_source AS "valueSource",manual_lane_position::float8 AS "manualLanePosition",completed_at AS "completedAt",cancelled_at AS "cancelledAt",version,created_at AS "createdAt"`,
        [taskId, workspaceId, lane, position.rows[0]?.position ?? 1, version],
      );
      const task = result.rows[0];
      if (task === undefined) throw new StoreConflictError("Task changed in another request.");
      await audit(client, {
        action: "task.moved",
        actorOwnerId: ownerId,
        metadata: { workflowLane: lane },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
      return { ...task, checklist: [] };
    });
  }

  public async reorderTask(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    direction: "earlier" | "later",
    version: number,
  ): Promise<number> {
    return transaction(this.pool, async (client) => {
      const currentResult = await client.query<{ workflowLane: TaskLane }>(
        'SELECT workflow_lane AS "workflowLane" FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2 AND version=$3 FOR UPDATE',
        [taskId, workspaceId, version],
      );
      const current = currentResult.rows[0];
      if (current === undefined) throw new StoreConflictError("Task changed in another request.");
      const rows = await client.query<{ id: string }>(
        "SELECT id FROM opsweave.tasks WHERE workspace_id=$1 AND workflow_lane=$2 ORDER BY manual_lane_position,created_at,id FOR UPDATE",
        [workspaceId, current.workflowLane],
      );
      const index = rows.rows.findIndex((row) => row.id === taskId);
      const target = direction === "earlier" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= rows.rows.length) return version;
      const ids = rows.rows.map((row) => row.id);
      const selected = ids.splice(index, 1)[0];
      if (selected === undefined) throw new Error("Task ordering failed.");
      ids.splice(target, 0, selected);
      for (const [position, id] of ids.entries())
        await client.query(
          "UPDATE opsweave.tasks SET manual_lane_position=$2,version=CASE WHEN id=$3 THEN version+1 ELSE version END,updated_at=now() WHERE id=$1",
          [id, position + 1, taskId],
        );
      await audit(client, {
        action: "task.manual_reordered",
        actorOwnerId: ownerId,
        metadata: { direction },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
      return version + 1;
    });
  }

  public async listTaskDependencies(workspaceId: string): Promise<TaskDependencyRecord[]> {
    const result = await this.pool.query<TaskDependencyRecord>(
      `SELECT dependency.task_id AS "taskId",dependency.depends_on_task_id AS "dependsOnTaskId"
       FROM opsweave.task_dependencies dependency
       JOIN opsweave.tasks task ON task.id=dependency.task_id
       WHERE task.workspace_id=$1 ORDER BY dependency.task_id,dependency.depends_on_task_id`,
      [workspaceId],
    );
    return result.rows;
  }

  public async createTaskDependency(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    dependsOnTaskId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const tasks = await client.query<{ id: string }>(
        "SELECT id FROM opsweave.tasks WHERE workspace_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE",
        [workspaceId, [taskId, dependsOnTaskId]],
      );
      if (tasks.rowCount !== 2)
        throw new StoreConflictError("Both dependency tasks must belong to this workspace.");
      const cycle = await client.query<{ found: boolean }>(
        `WITH RECURSIVE descendants(id) AS (
           SELECT depends_on_task_id FROM opsweave.task_dependencies WHERE task_id=$1
           UNION
           SELECT dependency.depends_on_task_id FROM opsweave.task_dependencies dependency
           JOIN descendants ON dependency.task_id=descendants.id
         ) SELECT exists(SELECT 1 FROM descendants WHERE id=$2) AS found`,
        [dependsOnTaskId, taskId],
      );
      if (cycle.rows[0]?.found)
        throw new StoreConflictError("This dependency would create a cycle.");
      try {
        await client.query(
          "INSERT INTO opsweave.task_dependencies (task_id,depends_on_task_id) VALUES ($1,$2)",
          [taskId, dependsOnTaskId],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505")
          throw new StoreConflictError("This dependency already exists.");
        throw error;
      }
      await audit(client, {
        action: "task.dependency.created",
        actorOwnerId: ownerId,
        metadata: { dependsOnTaskId },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
    });
  }

  public async removeTaskDependency(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    dependsOnTaskId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        `DELETE FROM opsweave.task_dependencies dependency USING opsweave.tasks task
         WHERE dependency.task_id=$1 AND dependency.depends_on_task_id=$2 AND task.id=dependency.task_id AND task.workspace_id=$3`,
        [taskId, dependsOnTaskId, workspaceId],
      );
      if (result.rowCount !== 1) throw new StoreConflictError("Dependency is unavailable.");
      await audit(client, {
        action: "task.dependency.removed",
        actorOwnerId: ownerId,
        metadata: { dependsOnTaskId },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
    });
  }

  public async submitIntakeSource(
    workspaceId: string,
    ownerId: string,
    input: { content: string; sourceType: IntakeSourceRecord["sourceType"] },
  ): Promise<IntakeRunRecord> {
    return transaction(this.pool, async (client) => {
      const fingerprint = createHash("sha256").update(input.content).digest("hex");
      const source = await client.query<{ id: string }>(
        `INSERT INTO opsweave.intake_sources (workspace_id,source_type,content,content_fingerprint)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [workspaceId, input.sourceType, input.content, fingerprint],
      );
      const sourceId = source.rows[0]?.id;
      if (sourceId === undefined) throw new Error("Intake source creation failed.");
      const run = await client.query<IntakeRunRecord>(
        `INSERT INTO opsweave.intake_runs (source_id,provider,schema_version) VALUES ($1,'deterministic-fake','2026-08-06')
         RETURNING id,source_id AS "sourceId"`,
        [sourceId],
      );
      const record = run.rows[0];
      if (record === undefined) throw new Error("Intake run creation failed.");
      await audit(client, {
        action: "intake.submitted",
        actorOwnerId: ownerId,
        metadata: { sourceType: input.sourceType },
        targetId: sourceId,
        targetType: "intake_source",
        workspaceId,
      });
      return record;
    });
  }

  public async nextQueuedIntakeRun(): Promise<(IntakeRunRecord & IntakeSourceRecord) | null> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<IntakeRunRecord & IntakeSourceRecord>(
        `WITH next_run AS (SELECT id,source_id FROM opsweave.intake_runs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1),
         claimed AS (UPDATE opsweave.intake_runs run SET status='processing',updated_at=now() FROM next_run
         WHERE run.id=next_run.id RETURNING run.id,run.source_id)
         UPDATE opsweave.intake_sources source SET status='processing',updated_at=now() FROM claimed
         WHERE source.id=claimed.source_id
         RETURNING claimed.id,claimed.source_id AS "sourceId",source.id,source.content,source.source_type AS "sourceType",source.status`,
      );
      return result.rows[0] ?? null;
    });
  }

  public async completeIntakeRun(runId: string, proposal: unknown): Promise<void> {
    await transaction(this.pool, async (client) => {
      const run = await client.query<{ sourceId: string }>(
        `UPDATE opsweave.intake_runs SET status='completed',safe_error=NULL,updated_at=now()
         WHERE id=$1 AND status='processing' RETURNING source_id AS "sourceId"`,
        [runId],
      );
      const sourceId = run.rows[0]?.sourceId;
      if (sourceId === undefined) throw new StoreConflictError("Intake run is unavailable.");
      await client.query(
        "INSERT INTO opsweave.intake_drafts (run_id,proposal) VALUES ($1,$2::jsonb)",
        [runId, JSON.stringify(proposal)],
      );
      await client.query(
        "UPDATE opsweave.intake_sources SET status='completed',updated_at=now() WHERE id=$1",
        [sourceId],
      );
    });
  }

  public async failIntakeRun(runId: string, safeError: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const run = await client.query<{ sourceId: string }>(
        `UPDATE opsweave.intake_runs SET status='failed',safe_error=$2,updated_at=now()
         WHERE id=$1 AND status='processing' RETURNING source_id AS "sourceId"`,
        [runId, safeError.slice(0, 500)],
      );
      const sourceId = run.rows[0]?.sourceId;
      if (sourceId === undefined) return;
      await client.query(
        "UPDATE opsweave.intake_sources SET status='failed',updated_at=now() WHERE id=$1",
        [sourceId],
      );
    });
  }

  public async listIntakeDrafts(workspaceId: string): Promise<IntakeDraftRecord[]> {
    const result = await this.pool.query<IntakeDraftRecord>(
      `SELECT draft.id,draft.proposal,draft.status,source.source_type AS "sourceType"
       FROM opsweave.intake_drafts draft
       JOIN opsweave.intake_runs run ON run.id=draft.run_id
       JOIN opsweave.intake_sources source ON source.id=run.source_id
       WHERE source.workspace_id=$1 ORDER BY draft.created_at DESC`,
      [workspaceId],
    );
    return result.rows;
  }

  public async approveIntakeDraft(
    workspaceId: string,
    ownerId: string,
    draftId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const draft = await client.query<{ proposal: { tasks?: TaskInput[] } }>(
        `SELECT draft.proposal FROM opsweave.intake_drafts draft
         JOIN opsweave.intake_runs run ON run.id=draft.run_id
         JOIN opsweave.intake_sources source ON source.id=run.source_id
         WHERE draft.id=$1 AND source.workspace_id=$2 AND draft.status='review_required' FOR UPDATE`,
        [draftId, workspaceId],
      );
      const proposal = draft.rows[0]?.proposal;
      if (proposal === undefined) throw new StoreConflictError("Intake draft is unavailable.");
      for (const task of proposal.tasks ?? []) {
        await client.query(
          `INSERT INTO opsweave.tasks (workspace_id,title,workflow_lane,business_value_score,business_value_rationale,value_source,manual_lane_position)
           VALUES ($1,$2,'inbox',$3,$4,'ai_proposed',(SELECT coalesce(max(manual_lane_position),0)+1 FROM opsweave.tasks WHERE workspace_id=$1 AND workflow_lane='inbox'))`,
          [
            workspaceId,
            task.title,
            task.businessValueScore ?? null,
            task.businessValueRationale ?? null,
          ],
        );
      }
      await client.query(
        "UPDATE opsweave.intake_drafts SET status='approved',updated_at=now() WHERE id=$1",
        [draftId],
      );
      await audit(client, {
        action: "intake.draft.approved",
        actorOwnerId: ownerId,
        metadata: { taskCount: proposal.tasks?.length ?? 0 },
        targetId: draftId,
        targetType: "intake_draft",
        workspaceId,
      });
    });
  }

  public async declineIntakeDraft(
    workspaceId: string,
    ownerId: string,
    draftId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE opsweave.intake_drafts draft SET status='declined',updated_at=now()
         FROM opsweave.intake_runs run JOIN opsweave.intake_sources source ON source.id=run.source_id
         WHERE draft.id=$1 AND draft.run_id=run.id AND source.workspace_id=$2 AND draft.status='review_required'`,
        [draftId, workspaceId],
      );
      if (result.rowCount !== 1) throw new StoreConflictError("Intake draft is unavailable.");
      await audit(client, {
        action: "intake.draft.declined",
        actorOwnerId: ownerId,
        metadata: {},
        targetId: draftId,
        targetType: "intake_draft",
        workspaceId,
      });
    });
  }

  public async retryIntakeRun(workspaceId: string, ownerId: string, runId: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE opsweave.intake_runs run SET status='queued',safe_error=NULL,updated_at=now()
         FROM opsweave.intake_sources source
         WHERE run.id=$1 AND run.source_id=source.id AND source.workspace_id=$2 AND run.status='failed'`,
        [runId, workspaceId],
      );
      if (result.rowCount !== 1) throw new StoreConflictError("Intake run cannot be retried.");
      await audit(client, {
        action: "intake.retry_queued",
        actorOwnerId: ownerId,
        metadata: {},
        targetId: runId,
        targetType: "intake_run",
        workspaceId,
      });
    });
  }

  public async trashIntakeDraft(
    workspaceId: string,
    ownerId: string,
    draftId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE opsweave.intake_drafts draft SET status='trashed',updated_at=now()
         FROM opsweave.intake_runs run JOIN opsweave.intake_sources source ON source.id=run.source_id
         WHERE draft.id=$1 AND draft.run_id=run.id AND source.workspace_id=$2 AND draft.status IN ('declined','approved')`,
        [draftId, workspaceId],
      );
      if (result.rowCount !== 1)
        throw new StoreConflictError("Intake draft cannot be moved to trash.");
      await client.query(
        `INSERT INTO opsweave.trash_records (workspace_id,entity_type,entity_id,purge_after)
         VALUES ($1,'intake_draft',$2,now()+interval '30 days')
         ON CONFLICT (workspace_id,entity_type,entity_id) DO UPDATE SET deleted_at=now(),purge_after=excluded.purge_after`,
        [workspaceId, draftId],
      );
      await audit(client, {
        action: "intake.draft.trashed",
        actorOwnerId: ownerId,
        metadata: { retentionDays: 30 },
        targetId: draftId,
        targetType: "intake_draft",
        workspaceId,
      });
    });
  }

  public async restoreIntakeDraft(
    workspaceId: string,
    ownerId: string,
    draftId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE opsweave.intake_drafts draft SET status='review_required',updated_at=now()
         FROM opsweave.intake_runs run JOIN opsweave.intake_sources source ON source.id=run.source_id
         WHERE draft.id=$1 AND draft.run_id=run.id AND source.workspace_id=$2 AND draft.status='trashed'`,
        [draftId, workspaceId],
      );
      if (result.rowCount !== 1) throw new StoreConflictError("Intake draft cannot be restored.");
      await client.query(
        "DELETE FROM opsweave.trash_records WHERE workspace_id=$1 AND entity_type='intake_draft' AND entity_id=$2",
        [workspaceId, draftId],
      );
      await audit(client, {
        action: "intake.draft.restored",
        actorOwnerId: ownerId,
        metadata: {},
        targetId: draftId,
        targetType: "intake_draft",
        workspaceId,
      });
    });
  }

  public async listAuditMetadata(workspaceId: string): Promise<unknown[]> {
    const result = await this.pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM opsweave.audit_events WHERE workspace_id=$1 ORDER BY created_at",
      [workspaceId],
    );
    return result.rows.map((row) => row.metadata);
  }
}
