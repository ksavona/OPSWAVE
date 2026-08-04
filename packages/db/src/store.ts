import { randomUUID } from "node:crypto";

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

  public async listAuditMetadata(workspaceId: string): Promise<unknown[]> {
    const result = await this.pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM opsweave.audit_events WHERE workspace_id=$1 ORDER BY created_at",
      [workspaceId],
    );
    return result.rows.map((row) => row.metadata);
  }
}
