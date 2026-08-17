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
  endTime: string;
  enabled: boolean;
  startTime: string;
  weekday: string;
}

export interface GeneralSettingsInput {
  dateDisplay: "iso" | "locale";
  defaultKanbanSort: "dependency" | "greatest_value" | "manual" | "planning_priority";
  defaultLandingView: "projects";
  displayName: string;
  firstDayOfWeek: "monday";
  fullName: string | null;
  knownAs: string[];
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
].map((weekday, index) => ({
  availableHours: index < 5 ? 8 : 0,
  endTime: "17:00",
  enabled: index < 5,
  startTime: "09:00",
  weekday,
}));

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
  readonly ownerIdentity: {
    readonly fullName: string | null;
    readonly knownAs: readonly string[];
    readonly username: string;
  };
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

export type BoardSortMode = "dependency" | "greatest_value" | "manual" | "planning_priority";
export type TaskLane =
  | "cancelled"
  | "delegated"
  | "done"
  | "in_focus"
  | "inbox"
  | "monitor_validate"
  | "this_week"
  | "today"
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
  readonly clientName: string | null;
  readonly createdAt: Date;
  readonly description: string | null;
  readonly id: string;
  readonly llmLink: string | null;
  readonly name: string;
  readonly notes: unknown;
  readonly priorityLevel: number | null;
  readonly stageId: string | null;
  readonly stageName: string | null;
  readonly status: "at_risk" | "in_progress" | "not_started" | "on_hold" | "on_track";
  readonly version: number;
}

export interface TaskChecklistItemRecord {
  readonly completed: boolean;
  readonly description: string | null;
  readonly id: string;
  readonly label: string;
  readonly position: number;
  readonly predictedHours: number | null;
}

export interface TaskTimeEntryRecord {
  readonly createdAt: Date;
  readonly description: string;
  readonly entryDate: string;
  readonly hours: number;
  readonly id: string;
  readonly taskId: string;
}

export interface AttachmentRecord {
  readonly byteSize: number;
  readonly contentType: string;
  readonly createdAt: Date;
  readonly entityId: string;
  readonly entityType: WorkEntityType;
  readonly id: string;
  readonly originalName: string;
  readonly purgeAfter: Date | null;
  readonly storageKey: string;
  readonly workspaceId: string;
}

export interface TaskRecord {
  readonly allocatedHours: number | null;
  readonly businessValueRationale: string | null;
  readonly businessValueScore: number | null;
  readonly cancelledAt: Date | null;
  readonly checklist: readonly TaskChecklistItemRecord[];
  readonly clientName: string | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly definitionOfDone: string | null;
  readonly deletedAt: Date | null;
  readonly dueDate: string | null;
  readonly endTime: string | null;
  readonly hoursSpent: number | null;
  readonly hoursLeft: number;
  readonly id: string;
  readonly manualLanePosition: number;
  readonly lastPlannedAt: Date | null;
  readonly lastPlannedBy: "automation" | "llm" | "user" | null;
  readonly projectId: string | null;
  readonly priorityLevel: number | null;
  readonly plannedDate: string | null;
  readonly plannedEndTime: string | null;
  readonly plannedStartTime: string | null;
  readonly planningEligible: boolean;
  readonly planningRationale: string | null;
  readonly planningScore: number | null;
  readonly requiresBreakdown: boolean;
  readonly scheduleLocked: boolean;
  readonly notes: unknown;
  readonly origin: string | null;
  readonly size: "large" | "medium" | "small" | "mega" | null;
  readonly sizeManualOverride: boolean;
  readonly startDate: string | null;
  readonly startTime: string | null;
  readonly status: "at_risk" | "in_progress" | "not_started" | "on_hold" | "on_track";
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

export interface ProjectDependencyRecord {
  readonly dependsOnProjectId: string;
  readonly projectId: string;
}

export type WorkEntityType = "project" | "task";

export interface EntityDependencyRecord {
  readonly blockerId: string;
  readonly blockerType: WorkEntityType;
  readonly dependentId: string;
  readonly dependentType: WorkEntityType;
}

export interface AuditEventRecord {
  readonly action: string;
  readonly actorName: string | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly metadata: unknown;
}

export interface LearningEventRecord {
  readonly createdAt: Date;
  readonly id: string;
  readonly keywords: readonly string[];
  readonly kind: string;
  readonly sourceEntityId: string | null;
  readonly sourceEntityType: string | null;
  readonly summary: string;
}

export interface IntakeSourceRecord {
  readonly content: string;
  readonly createNewProjects: boolean;
  readonly id: string;
  readonly selectedProjectIds: readonly string[];
  readonly sourceType: "instruction" | "meeting_note" | "other_text" | "transcript";
  readonly status: "completed" | "failed" | "processing" | "queued";
  readonly workspaceId: string;
}

export interface AiWorkspaceContext {
  readonly allowNewProjects: boolean;
  readonly learning: readonly Pick<LearningEventRecord, "kind" | "summary">[];
  readonly ownerIdentity: {
    readonly fullName: string | null;
    readonly knownAs: readonly string[];
    readonly username: string;
  };
  readonly projects: readonly Pick<
    ProjectRecord,
    "description" | "id" | "name" | "priorityLevel" | "stageName" | "status"
  >[];
  readonly selectedProjectIds: readonly string[];
  readonly tasks: readonly Pick<
    TaskRecord,
    | "allocatedHours"
    | "businessValueScore"
    | "dueDate"
    | "hoursSpent"
    | "id"
    | "projectId"
    | "priorityLevel"
    | "size"
    | "startDate"
    | "status"
    | "title"
    | "workflowLane"
  >[];
  readonly workingDays: readonly WorkingDayInput[];
}

export interface IntakeRunRecord {
  readonly id: string;
  readonly sourceId: string;
}

export interface SubmittedIntakeRunRecord extends IntakeRunRecord {
  readonly duplicateOfSourceId: string | null;
}

export interface IntakeDraftRecord {
  readonly approvalResult: unknown;
  readonly duplicateOfSourceId: string | null;
  readonly id: string;
  readonly purgeAfter: Date | null;
  readonly proposal: unknown;
  readonly selectedProjectIds: readonly string[];
  readonly sourceContent: string;
  readonly createNewProjects: boolean;
  readonly sourceType: IntakeSourceRecord["sourceType"];
  readonly status: "approved" | "declined" | "review_required" | "trashed";
}

export interface FailedIntakeRunRecord {
  readonly duplicateOfSourceId: string | null;
  readonly id: string;
  readonly safeError: string;
  readonly sourceType: IntakeSourceRecord["sourceType"];
}

export interface PlanningRunRecord {
  readonly id: string;
  readonly status: "completed" | "no_capacity";
}

export interface AutomationWorkspaceRecord {
  readonly ownerId: string;
  readonly timezone: string;
  readonly workspaceId: string;
}

export interface AutomationRunInput {
  readonly assessments?: readonly {
    readonly planningRationale: string;
    readonly planningScore: number;
    readonly reason: string;
    readonly selected: boolean;
    readonly taskId: string;
  }[];
  readonly destinationLane: TaskLane;
  readonly gapMinutes?: number | undefined;
  readonly kind: "daily" | "daily_rollover" | "daily_selection" | "weekly" | "weekly_selection";
  readonly localDate: string;
  readonly ownerId: string;
  readonly resetFromLanes: readonly TaskLane[];
  readonly resetToLane: TaskLane;
  readonly scheduleFromDate?: string | undefined;
  readonly selectedIds: readonly string[];
  readonly settingsSnapshot: unknown;
  readonly settingsVersion: number;
  readonly workspaceId: string;
}

export interface ProjectInput {
  clientName?: string | null | undefined;
  description?: string | null | undefined;
  llmLink?: string | null | undefined;
  name: string;
  notes?: unknown;
  priorityLevel?: number | null | undefined;
  stageId?: string | null | undefined;
  status?: ProjectRecord["status"] | undefined;
}

export interface TaskInput {
  allocatedHours?: number | null | undefined;
  businessValueRationale?: string | null | undefined;
  businessValueScore?: number | null | undefined;
  checklist?:
    | readonly {
        completed: boolean;
        description?: string | null | undefined;
        label: string;
        position: number;
        predictedHours?: number | null | undefined;
      }[]
    | undefined;
  clientName?: string | null | undefined;
  definitionOfDone?: string | null | undefined;
  dueDate?: string | null | undefined;
  endTime?: string | null | undefined;
  hoursSpent?: number | null | undefined;
  notes?: unknown;
  origin?: string | null | undefined;
  projectId?: string | null | undefined;
  priorityLevel?: number | null | undefined;
  plannedDate?: string | null | undefined;
  plannedEndTime?: string | null | undefined;
  plannedStartTime?: string | null | undefined;
  planningEligible?: boolean | undefined;
  planningRationale?: string | null | undefined;
  planningScore?: number | null | undefined;
  scheduleLocked?: boolean | undefined;
  size?: "large" | "medium" | "small" | "mega" | null | undefined;
  sizeManualOverride?: boolean | undefined;
  startDate?: string | null | undefined;
  startTime?: string | null | undefined;
  status?: TaskRecord["status"] | undefined;
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

const normalizedIntakeFingerprint = (content: string): string =>
  createHash("sha256").update(content.trim().replaceAll(/\s+/gu, " ")).digest("hex");

const hoursBetweenTimes = (startTime: string, endTime: string): number => {
  const [startHour = 0, startMinute = 0] = startTime.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = endTime.split(":").map(Number);
  return Math.max(
    0,
    Math.round(((endHour * 60 + endMinute - startHour * 60 - startMinute) / 60) * 100) / 100,
  );
};

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const DAY_MILLISECONDS = 86_400_000;
const timeMinutes = (value: string): number => {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
};
const dayStart = (value: number): number => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
const scheduleWithinWorkingTime = (
  requestedStart: number,
  allocatedHours: number,
  workingDays: readonly WorkingDayInput[],
  busyIntervals: readonly { end: number; start: number }[] = [],
): { end: number; start: number } => {
  const byWeekday = new Map(workingDays.map((day) => [day.weekday, day]));
  const normalizeStart = (value: number): number => {
    let cursor = Math.round(value / 900_000) * 900_000;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const startOfDay = dayStart(cursor);
      const weekday = WEEKDAY_NAMES[new Date(startOfDay).getUTCDay()] ?? "monday";
      const window = byWeekday.get(weekday);
      if (window?.enabled === true && window.startTime < window.endTime) {
        const windowStart = startOfDay + timeMinutes(window.startTime) * 60_000;
        const windowEnd = startOfDay + timeMinutes(window.endTime) * 60_000;
        if (cursor < windowStart) return windowStart;
        if (cursor < windowEnd) return cursor;
      }
      cursor = startOfDay + DAY_MILLISECONDS;
    }
    throw new StoreConflictError("No enabled working-time window is available.");
  };
  let cursor = normalizeStart(requestedStart);
  const remainingMinutes = Math.max(15, Math.round(Math.max(0.25, allocatedHours) * 60));
  const orderedBusyIntervals = [...busyIntervals].sort((left, right) => left.start - right.start);
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    cursor = normalizeStart(cursor);
    const startOfDay = dayStart(cursor);
    const weekday = WEEKDAY_NAMES[new Date(startOfDay).getUTCDay()] ?? "monday";
    const window = byWeekday.get(weekday);
    if (window === undefined) throw new StoreConflictError("Working-time settings are incomplete.");
    const windowEnd = startOfDay + timeMinutes(window.endTime) * 60_000;
    const availableMinutes = Math.max(0, Math.floor((windowEnd - cursor) / 60_000));
    const candidateEnd = cursor + remainingMinutes * 60_000;
    const collision = orderedBusyIntervals.find(
      (interval) => interval.end > cursor && interval.start < candidateEnd,
    );
    if (collision !== undefined) {
      cursor = collision.end;
      continue;
    }
    if (remainingMinutes <= availableMinutes) return { end: candidateEnd, start: cursor };
    cursor = startOfDay + DAY_MILLISECONDS;
  }
  throw new StoreConflictError("The task is too long to fit in the configured working calendar.");
};
const timestampParts = (value: number): { date: string; time: string } => {
  const iso = new Date(value).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};
const EMPTY_RICH_TEXT_DOCUMENT = { content: [], type: "doc" } as const;
const taskSizeForHours = (
  hours: number | null | undefined,
): "large" | "medium" | "small" | "mega" | null => {
  if (hours === null || hours === undefined) return null;
  if (hours <= 0.5) return "small";
  if (hours <= 1) return "medium";
  if (hours <= 2) return "large";
  return "mega";
};
const learningKeywords = (value: string): string[] =>
  [...new Set(value.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? [])].slice(0, 30);

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

const auditChanges = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> =>
  Object.fromEntries(
    Object.entries(after).flatMap(([field, nextValue]) => {
      const previous =
        Object.entries(before).find(([candidate]) => candidate === field)?.[1] ?? null;
      const next = nextValue ?? null;
      return JSON.stringify(previous) === JSON.stringify(next)
        ? []
        : [[field, { from: previous, to: next }]];
    }),
  );

export class OpsWeaveStore {
  public constructor(public readonly pool: Pool) {}

  private async syncProjectAttachmentRetention(
    client: PoolClient,
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    const terminal = await client.query<{ terminal: boolean }>(
      `SELECT lower(coalesce(stage.name,'')) IN ('done','cancelled','canceled','complete','completed') AS terminal
       FROM opsweave.projects project
       LEFT JOIN opsweave.project_stages stage ON stage.id=project.stage_id
       WHERE project.id=$1 AND project.workspace_id=$2`,
      [projectId, workspaceId],
    );
    const isTerminal = terminal.rows[0]?.terminal ?? false;
    await client.query(
      `UPDATE opsweave.attachments
       SET purge_after=CASE WHEN $3::boolean THEN coalesce(purge_after,now()+interval '90 days') ELSE NULL END
       WHERE workspace_id=$1 AND entity_type='project' AND entity_id=$2`,
      [workspaceId, projectId, isTerminal],
    );
    await client.query(
      `UPDATE opsweave.attachments attachment
       SET purge_after=CASE
         WHEN $3::boolean OR task.workflow_lane IN ('done','cancelled')
           THEN coalesce(attachment.purge_after,now()+interval '90 days')
         ELSE NULL END
       FROM opsweave.tasks task
       WHERE attachment.workspace_id=$1 AND attachment.entity_type='task'
         AND attachment.entity_id=task.id AND task.project_id=$2`,
      [workspaceId, projectId, isTerminal],
    );
  }

  private async syncTaskAttachmentRetention(
    client: PoolClient,
    workspaceId: string,
    taskId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE opsweave.attachments attachment
       SET purge_after=CASE WHEN task.workflow_lane IN ('done','cancelled')
         OR lower(coalesce(stage.name,'')) IN ('done','cancelled','canceled','complete','completed')
         THEN coalesce(attachment.purge_after,now()+interval '90 days') ELSE NULL END
       FROM opsweave.tasks task
       LEFT JOIN opsweave.projects project ON project.id=task.project_id
       LEFT JOIN opsweave.project_stages stage ON stage.id=project.stage_id
       WHERE attachment.workspace_id=$1 AND attachment.entity_type='task'
         AND attachment.entity_id=$2 AND task.id=$2`,
      [workspaceId, taskId],
    );
  }

  private async recordLearningEventWithClient(
    client: PoolClient,
    workspaceId: string,
    input: {
      kind: string;
      sourceEntityId?: string | null;
      sourceEntityType?: string | null;
      summary: string;
    },
  ): Promise<void> {
    const summary = input.summary.trim().slice(0, 4_000);
    if (summary.length === 0) return;
    await client.query(
      `INSERT INTO opsweave.learning_events
        (workspace_id,kind,summary,keywords,source_entity_type,source_entity_id)
       VALUES ($1,$2,$3,$4::text[],$5,$6)`,
      [
        workspaceId,
        input.kind.slice(0, 64),
        summary,
        learningKeywords(summary),
        input.sourceEntityType ?? null,
        input.sourceEntityId ?? null,
      ],
    );
  }

  public async listLearningEvents(
    workspaceId: string,
    limit = 200,
  ): Promise<LearningEventRecord[]> {
    const result = await this.pool.query<LearningEventRecord>(
      `SELECT id,kind,summary,keywords,source_entity_type AS "sourceEntityType",
        source_entity_id AS "sourceEntityId",created_at AS "createdAt"
       FROM opsweave.learning_events WHERE workspace_id=$1
       ORDER BY created_at DESC,id DESC LIMIT $2`,
      [workspaceId, Math.min(500, Math.max(1, limit))],
    );
    return result.rows;
  }

  public async listEntityAuditEvents(
    workspaceId: string,
    targetType: WorkEntityType,
    targetId: string,
    limit = 200,
  ): Promise<AuditEventRecord[]> {
    const result = await this.pool.query<AuditEventRecord>(
      `SELECT event.id,event.action,event.metadata,event.created_at AS "createdAt",
        owner.username AS "actorName"
       FROM opsweave.audit_events event
       LEFT JOIN opsweave.owners owner ON owner.id=event.actor_owner_id
       WHERE event.workspace_id=$1 AND event.target_type=$2 AND event.target_id=$3
       ORDER BY event.created_at DESC,event.id DESC LIMIT $4`,
      [workspaceId, targetType, targetId, Math.min(500, Math.max(1, limit))],
    );
    return result.rows;
  }

  public async getAiWorkspaceContext(
    workspaceId: string,
    query: string,
    selectedProjectIds: readonly string[] = [],
    allowNewProjects = false,
  ): Promise<AiWorkspaceContext> {
    const [projects, tasks, events, configuration] = await Promise.all([
      this.listProjects(workspaceId),
      this.listTasks(workspaceId, "manual"),
      this.listLearningEvents(workspaceId, 500),
      this.getWorkspaceConfiguration(workspaceId),
    ]);
    const queryKeywords = new Set(learningKeywords(query));
    const learning = events
      .map((event, index) => ({
        event,
        score: event.keywords.filter((keyword) => queryKeywords.has(keyword)).length * 100 - index,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 40)
      .map(({ event }) => ({ kind: event.kind, summary: event.summary }));
    return {
      allowNewProjects,
      learning,
      ownerIdentity: configuration.ownerIdentity,
      projects: projects
        .filter((project) => project.archivedAt === null)
        .sort(
          (left, right) =>
            Number(selectedProjectIds.includes(right.id)) -
            Number(selectedProjectIds.includes(left.id)),
        )
        .slice(0, 200)
        .map(({ description, id, name, priorityLevel, stageName, status }) => ({
          description,
          id,
          name,
          priorityLevel,
          stageName,
          status,
        })),
      tasks: tasks
        .sort(
          (left, right) =>
            Number(right.projectId !== null && selectedProjectIds.includes(right.projectId)) -
            Number(left.projectId !== null && selectedProjectIds.includes(left.projectId)),
        )
        .slice(0, 500)
        .map(
          ({
            allocatedHours,
            businessValueScore,
            dueDate,
            hoursSpent,
            id,
            projectId,
            priorityLevel,
            size,
            startDate,
            status,
            title,
            workflowLane,
          }) => ({
            allocatedHours,
            businessValueScore,
            dueDate,
            hoursSpent,
            id,
            projectId,
            priorityLevel,
            size,
            startDate,
            status,
            title,
            workflowLane,
          }),
        ),
      selectedProjectIds,
      workingDays: configuration.workingDays,
    };
  }

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
      for (const [sequence, name] of ["Planned", "In progress", "Done", "Cancelled"].entries()) {
        await client.query(
          "INSERT INTO opsweave.project_stages (workspace_id,name,sequence) VALUES ($1,$2,$3)",
          [workspaceId, name, sequence],
        );
      }
      for (const day of defaultWorkingDays) {
        await client.query(
          `INSERT INTO opsweave.workspace_working_hours
            (workspace_id,weekday,enabled,available_hours,start_time,end_time) VALUES ($1,$2,$3,$4,$5,$6)`,
          [workspaceId, day.weekday, day.enabled, day.availableHours, day.startTime, day.endTime],
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
      `SELECT w.display_name AS "displayName",w.timezone,o.username,o.full_name AS "fullName",
        o.known_as AS "knownAs",s.date_display AS "dateDisplay",
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
       JOIN opsweave.owners o ON o.workspace_id=w.id
       WHERE w.id=$1`,
      [workspaceId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("Workspace settings not found.");
    const days = await this.pool.query<WorkingDayInput>(
      `SELECT weekday,enabled,available_hours::float8 AS "availableHours",
        to_char(start_time,'HH24:MI') AS "startTime",to_char(end_time,'HH24:MI') AS "endTime"
       FROM opsweave.workspace_working_hours WHERE workspace_id=$1
       ORDER BY array_position(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],weekday)`,
      [workspaceId],
    );
    const version = Number(row.version);
    return {
      general: {
        dateDisplay: row.dateDisplay as "iso" | "locale",
        defaultKanbanSort: row.defaultKanbanSort as
          "manual" | "planning_priority" | "greatest_value" | "dependency",
        defaultLandingView: "projects",
        displayName: String(row.displayName),
        firstDayOfWeek: "monday",
        fullName: typeof row.fullName === "string" ? row.fullName : null,
        knownAs: Array.isArray(row.knownAs) ? row.knownAs.map(String) : [],
        timezone: String(row.timezone),
        version,
      },
      ownerIdentity: {
        fullName: typeof row.fullName === "string" ? row.fullName : null,
        knownAs: Array.isArray(row.knownAs) ? row.knownAs.map(String) : [],
        username: typeof row.username === "string" ? row.username : "",
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

  public async listAutomationWorkspaces(): Promise<AutomationWorkspaceRecord[]> {
    const result = await this.pool.query<AutomationWorkspaceRecord>(
      `SELECT workspace.id AS "workspaceId",workspace.timezone,owner.id AS "ownerId"
       FROM opsweave.workspaces workspace
       JOIN opsweave.owners owner ON owner.workspace_id=workspace.id
       JOIN opsweave.workspace_settings settings ON settings.workspace_id=workspace.id
       WHERE settings.weekly_automation_enabled OR settings.daily_automation_enabled
       ORDER BY workspace.id`,
    );
    return result.rows;
  }

  public async hasAutomationRun(
    workspaceId: string,
    kind: AutomationRunInput["kind"],
    localDate: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM opsweave.planning_runs
       WHERE workspace_id=$1 AND kind=$2 AND scheduled_for=$3::date LIMIT 1`,
      [workspaceId, kind, localDate],
    );
    return result.rowCount === 1;
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
        "UPDATE opsweave.owners SET full_name=$2,known_as=$3::text[],updated_at=now() WHERE id=$1 AND workspace_id=$4",
        [ownerId, input.fullName, input.knownAs, workspaceId],
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
            (workspace_id,weekday,enabled,available_hours,start_time,end_time,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,now())
           ON CONFLICT (workspace_id,weekday) DO UPDATE SET enabled=excluded.enabled,
            available_hours=excluded.available_hours,start_time=excluded.start_time,
            end_time=excluded.end_time,updated_at=now()`,
          [
            workspaceId,
            day.weekday,
            day.enabled,
            day.enabled ? hoursBetweenTimes(day.startTime, day.endTime) : 0,
            day.startTime,
            day.endTime,
          ],
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
      `SELECT p.id,p.name,p.client_name AS "clientName",p.description,p.notes,
        p.priority_level AS "priorityLevel",p.status,p.llm_link AS "llmLink",
        p.stage_id AS "stageId",s.name AS "stageName",
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
        `INSERT INTO opsweave.projects
          (workspace_id,name,client_name,description,notes,priority_level,status,llm_link,stage_id)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
         RETURNING id,name,client_name AS "clientName",description,notes,
          priority_level AS "priorityLevel",status,llm_link AS "llmLink",stage_id AS "stageId",
          archived_at AS "archivedAt",created_at AS "createdAt",version`,
        [
          workspaceId,
          input.name,
          input.clientName ?? null,
          input.description ?? null,
          JSON.stringify(input.notes ?? EMPTY_RICH_TEXT_DOCUMENT),
          input.priorityLevel ?? null,
          input.status ?? "not_started",
          input.llmLink ?? null,
          stageId,
        ],
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
      await this.recordLearningEventWithClient(client, workspaceId, {
        kind: "project_created",
        sourceEntityId: project.id,
        sourceEntityType: "project",
        summary: `Created project "${project.name}"${project.priorityLevel === null ? "" : ` with priority level ${String(project.priorityLevel)}`}.`,
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
      const existingResult = await client.query<
        Pick<
          ProjectRecord,
          | "archivedAt"
          | "clientName"
          | "description"
          | "llmLink"
          | "name"
          | "notes"
          | "priorityLevel"
          | "stageId"
          | "status"
        >
      >(
        `SELECT name,client_name AS "clientName",description,notes,
          priority_level AS "priorityLevel",status,llm_link AS "llmLink",stage_id AS "stageId",
          archived_at AS "archivedAt"
         FROM opsweave.projects WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [projectId, workspaceId],
      );
      const existing = existingResult.rows[0];
      if (existing === undefined) throw new StoreConflictError("Project is unavailable.");
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
        `UPDATE opsweave.projects SET name=$3,client_name=$4,description=$5,notes=$6::jsonb,
          priority_level=$7,status=$8,llm_link=$9,stage_id=$10,
          archived_at=CASE WHEN $11 THEN coalesce(archived_at,now()) ELSE NULL END,
          version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$12
         RETURNING id,name,client_name AS "clientName",description,notes,
          priority_level AS "priorityLevel",status,llm_link AS "llmLink",stage_id AS "stageId",
          archived_at AS "archivedAt",created_at AS "createdAt",version`,
        [
          projectId,
          workspaceId,
          input.name,
          input.clientName ?? null,
          input.description ?? null,
          JSON.stringify(input.notes ?? EMPTY_RICH_TEXT_DOCUMENT),
          input.priorityLevel ?? null,
          input.status ?? "not_started",
          input.llmLink ?? null,
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
      await client.query(
        `UPDATE opsweave.tasks SET client_name=$3,updated_at=now()
         WHERE workspace_id=$1 AND project_id=$2 AND client_name IS DISTINCT FROM $3`,
        [workspaceId, projectId, project.clientName],
      );
      await this.syncProjectAttachmentRetention(client, workspaceId, projectId);
      const changes = auditChanges(
        {
          archived: existing.archivedAt !== null,
          clientName: existing.clientName,
          description: existing.description,
          llmLink: existing.llmLink,
          name: existing.name,
          priorityLevel: existing.priorityLevel,
          stageId: existing.stageId,
          status: existing.status,
        },
        {
          archived: project.archivedAt !== null,
          clientName: project.clientName,
          description: project.description,
          llmLink: project.llmLink,
          name: project.name,
          priorityLevel: project.priorityLevel,
          stageId: project.stageId,
          status: project.status,
        },
      );
      if (JSON.stringify(existing.notes) !== JSON.stringify(project.notes))
        changes.notes = { from: "Previous content", to: "Edited content" };
      await audit(client, {
        action: input.archived ? "project.archived" : "project.updated",
        actorOwnerId: ownerId,
        metadata: { changes },
        targetId: project.id,
        targetType: "project",
        workspaceId,
      });
      await this.recordLearningEventWithClient(client, workspaceId, {
        kind: "project_updated",
        sourceEntityId: project.id,
        sourceEntityType: "project",
        summary: `Updated project "${project.name}"${project.priorityLevel === null ? "" : ` to priority level ${String(project.priorityLevel)}`}.`,
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
      `SELECT id,task_id AS "taskId",label,description,predicted_hours::float8 AS "predictedHours",completed,position FROM opsweave.task_checklist_items
       WHERE task_id=ANY($1::uuid[]) ORDER BY task_id,position,id`,
      [ids],
    );
    const byTask = new Map<string, TaskChecklistItemRecord[]>();
    for (const item of result.rows) {
      const items = byTask.get(item.taskId) ?? [];
      items.push({
        completed: item.completed,
        description: item.description,
        id: item.id,
        label: item.label,
        position: item.position,
        predictedHours: item.predictedHours,
      });
      byTask.set(item.taskId, items);
    }
    return tasksToAttach.map((task) => {
      const checklist = byTask.get(task.id) ?? [];
      return {
        ...task,
        checklist,
        hoursLeft: Math.max(0, (task.allocatedHours ?? 0) - (task.hoursSpent ?? 0)),
        requiresBreakdown: task.size === "mega" && checklist.length === 0,
      };
    });
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
          ? "planning_score DESC NULLS LAST,planned_date NULLS LAST,due_date NULLS LAST,created_at,id"
          : "manual_lane_position,created_at,id";
    const result = await this.pool.query<Omit<TaskRecord, "checklist">>(
      `SELECT id,project_id AS "projectId",client_name AS "clientName",title,
        priority_level AS "priorityLevel",status,workflow_lane AS "workflowLane",
        allocated_hours::float8 AS "allocatedHours",hours_spent::float8 AS "hoursSpent",
        greatest(coalesce(allocated_hours,0)-coalesce(hours_spent,0),0)::float8 AS "hoursLeft",
        size,size_manual_override AS "sizeManualOverride",
        value_add AS "valueAdd",work_description AS "workDescription",
        definition_of_done AS "definitionOfDone",origin,notes,start_date::text AS "startDate",
        to_char(start_time,'HH24:MI') AS "startTime",due_date::text AS "dueDate",
        to_char(end_time,'HH24:MI') AS "endTime",
        business_value_score AS "businessValueScore",business_value_rationale AS "businessValueRationale",
        value_source AS "valueSource",manual_lane_position::float8 AS "manualLanePosition",
        planning_eligible AS "planningEligible",schedule_locked AS "scheduleLocked",
        requires_breakdown AS "requiresBreakdown",planned_date::text AS "plannedDate",
        to_char(planned_start_time,'HH24:MI') AS "plannedStartTime",
        to_char(planned_end_time,'HH24:MI') AS "plannedEndTime",planning_score AS "planningScore",
        planning_rationale AS "planningRationale",last_planned_by AS "lastPlannedBy",
        last_planned_at AS "lastPlannedAt",
        completed_at AS "completedAt",cancelled_at AS "cancelledAt",deleted_at AS "deletedAt",
        version,created_at AS "createdAt"
       FROM opsweave.tasks WHERE workspace_id=$1 AND deleted_at IS NULL
        ${projectId === undefined ? "" : "AND project_id=$2"}
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
      let clientName = input.clientName ?? null;
      if (input.projectId !== undefined && input.projectId !== null) {
        const project = await client.query<{ clientName: string | null }>(
          `SELECT client_name AS "clientName" FROM opsweave.projects
           WHERE id=$1 AND workspace_id=$2`,
          [input.projectId, workspaceId],
        );
        if (project.rowCount !== 1)
          throw new StoreConflictError("The selected project is unavailable.");
        clientName = project.rows[0]?.clientName ?? null;
      }
      const position = await client.query<{ position: number }>(
        `SELECT coalesce(max(manual_lane_position),0)::float8+1 AS position FROM opsweave.tasks
         WHERE workspace_id=$1 AND workflow_lane=$2`,
        [workspaceId, lane],
      );
      const sizeManualOverride = input.sizeManualOverride ?? false;
      const hoursSpent = input.hoursSpent ?? 0;
      const hoursLeft = Math.max(0, (input.allocatedHours ?? 0) - hoursSpent);
      const size = sizeManualOverride
        ? (input.size ?? taskSizeForHours(hoursLeft))
        : taskSizeForHours(hoursLeft);
      const requiresBreakdown = size === "mega" && (input.checklist?.length ?? 0) === 0;
      const result = await client.query<Omit<TaskRecord, "checklist">>(
        `INSERT INTO opsweave.tasks
          (workspace_id,project_id,client_name,title,priority_level,status,workflow_lane,allocated_hours,hours_spent,size,size_manual_override,value_add,
           work_description,definition_of_done,origin,notes,start_date,start_time,due_date,end_time,business_value_score,
           business_value_rationale,value_source,value_updated_at,manual_lane_position,planning_eligible,schedule_locked,
           requires_breakdown,planned_date,planned_start_time,planned_end_time,planning_score,planning_rationale,
           last_planned_by,last_planned_at,completed_at,cancelled_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21,$22,$23,
           CASE WHEN $21::integer IS NULL THEN NULL ELSE now() END,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
           CASE WHEN $7::varchar='done' THEN now() ELSE NULL END,CASE WHEN $7::varchar='cancelled' THEN now() ELSE NULL END)
         RETURNING id,project_id AS "projectId",client_name AS "clientName",title,
          priority_level AS "priorityLevel",status,workflow_lane AS "workflowLane",
          allocated_hours::float8 AS "allocatedHours",hours_spent::float8 AS "hoursSpent",
          greatest(coalesce(allocated_hours,0)-coalesce(hours_spent,0),0)::float8 AS "hoursLeft",
          size,size_manual_override AS "sizeManualOverride",origin,
          value_add AS "valueAdd",work_description AS "workDescription",definition_of_done AS "definitionOfDone",
          notes,start_date::text AS "startDate",to_char(start_time,'HH24:MI') AS "startTime",
          due_date::text AS "dueDate",to_char(end_time,'HH24:MI') AS "endTime",business_value_score AS "businessValueScore",
          business_value_rationale AS "businessValueRationale",value_source AS "valueSource",
          manual_lane_position::float8 AS "manualLanePosition",planning_eligible AS "planningEligible",
          schedule_locked AS "scheduleLocked",requires_breakdown AS "requiresBreakdown",
          planned_date::text AS "plannedDate",to_char(planned_start_time,'HH24:MI') AS "plannedStartTime",
          to_char(planned_end_time,'HH24:MI') AS "plannedEndTime",planning_score AS "planningScore",
          planning_rationale AS "planningRationale",last_planned_by AS "lastPlannedBy",
          last_planned_at AS "lastPlannedAt",completed_at AS "completedAt",
          cancelled_at AS "cancelledAt",deleted_at AS "deletedAt",version,created_at AS "createdAt"`,
        [
          workspaceId,
          input.projectId ?? null,
          clientName,
          input.title,
          input.priorityLevel ?? null,
          input.status ?? "not_started",
          lane,
          input.allocatedHours ?? null,
          hoursSpent,
          size,
          sizeManualOverride,
          input.valueAdd ?? null,
          input.workDescription ?? null,
          input.definitionOfDone ?? null,
          input.origin ?? null,
          JSON.stringify(input.notes ?? EMPTY_RICH_TEXT_DOCUMENT),
          input.startDate ?? null,
          input.startTime ?? null,
          input.dueDate ?? null,
          input.endTime ?? null,
          input.businessValueScore ?? null,
          input.businessValueRationale ?? null,
          input.valueSource ?? null,
          position.rows[0]?.position ?? 1,
          input.planningEligible ?? true,
          input.scheduleLocked ?? false,
          requiresBreakdown,
          input.plannedDate ?? null,
          input.plannedStartTime ?? null,
          input.plannedEndTime ?? null,
          input.planningScore ?? null,
          input.planningRationale ?? null,
          input.plannedDate === undefined ? null : "user",
          input.plannedDate === undefined ? null : new Date(),
        ],
      );
      const task = result.rows[0];
      if (task === undefined) throw new Error("Task creation failed.");
      for (const item of input.checklist ?? []) {
        await client.query(
          "INSERT INTO opsweave.task_checklist_items (task_id,label,description,predicted_hours,completed,position) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            task.id,
            item.label,
            item.description ?? null,
            item.predictedHours ?? null,
            item.completed,
            item.position,
          ],
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
      await this.recordLearningEventWithClient(client, workspaceId, {
        kind: "task_created",
        sourceEntityId: task.id,
        sourceEntityType: "task",
        summary: `Created task "${task.title}"${task.projectId === null ? " without a project" : " in a project"}${task.allocatedHours === null ? "" : ` with ${String(task.allocatedHours)} allocated hours`}${task.size === null ? "" : ` and ${task.size} size`}${(input.checklist?.length ?? 0) === 0 ? "" : ` and ${String(input.checklist?.length)} subtasks`}.`,
      });
      return {
        ...task,
        checklist: (input.checklist ?? []).map((item, index) => ({
          completed: item.completed,
          description: item.description ?? null,
          id: `created-${String(index)}`,
          label: item.label,
          position: item.position,
          predictedHours: item.predictedHours ?? null,
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
      const existingResult = await client.query<
        Pick<
          TaskRecord,
          | "allocatedHours"
          | "businessValueRationale"
          | "businessValueScore"
          | "clientName"
          | "definitionOfDone"
          | "dueDate"
          | "endTime"
          | "hoursSpent"
          | "lastPlannedAt"
          | "lastPlannedBy"
          | "notes"
          | "origin"
          | "projectId"
          | "priorityLevel"
          | "plannedDate"
          | "plannedEndTime"
          | "plannedStartTime"
          | "planningEligible"
          | "planningRationale"
          | "planningScore"
          | "scheduleLocked"
          | "size"
          | "sizeManualOverride"
          | "startDate"
          | "startTime"
          | "status"
          | "title"
          | "valueAdd"
          | "valueSource"
          | "workDescription"
          | "workflowLane"
        >
      >(
        `SELECT title,project_id AS "projectId",client_name AS "clientName",
          priority_level AS "priorityLevel",status,allocated_hours::float8 AS "allocatedHours",
          hours_spent::float8 AS "hoursSpent",size,size_manual_override AS "sizeManualOverride",
          planning_eligible AS "planningEligible",schedule_locked AS "scheduleLocked",
          planned_date::text AS "plannedDate",to_char(planned_start_time,'HH24:MI') AS "plannedStartTime",
          to_char(planned_end_time,'HH24:MI') AS "plannedEndTime",planning_score AS "planningScore",
          planning_rationale AS "planningRationale",last_planned_by AS "lastPlannedBy",
          last_planned_at AS "lastPlannedAt",value_add AS "valueAdd",
          work_description AS "workDescription",definition_of_done AS "definitionOfDone",origin,notes,
          start_date::text AS "startDate",to_char(start_time,'HH24:MI') AS "startTime",
          due_date::text AS "dueDate",to_char(end_time,'HH24:MI') AS "endTime",
          business_value_score AS "businessValueScore",
          business_value_rationale AS "businessValueRationale",value_source AS "valueSource",
          workflow_lane AS "workflowLane"
         FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [taskId, workspaceId],
      );
      const existing = existingResult.rows[0];
      if (existing === undefined) throw new StoreConflictError("Task is unavailable.");
      if (existing.valueSource === "owner" && input.valueSource === "ai_proposed")
        throw new StoreConflictError("An AI proposal cannot overwrite an owner value.");
      let clientName = input.clientName ?? null;
      if (input.projectId !== undefined && input.projectId !== null) {
        const project = await client.query<{ clientName: string | null }>(
          `SELECT client_name AS "clientName" FROM opsweave.projects
           WHERE id=$1 AND workspace_id=$2`,
          [input.projectId, workspaceId],
        );
        if (project.rowCount !== 1)
          throw new StoreConflictError("The selected project is unavailable.");
        clientName = project.rows[0]?.clientName ?? null;
      }
      const lane = input.workflowLane ?? "inbox";
      const checklistCount =
        input.checklist?.length ??
        Number(
          (
            await client.query<{ count: string }>(
              "SELECT count(*)::text AS count FROM opsweave.task_checklist_items WHERE task_id=$1",
              [taskId],
            )
          ).rows[0]?.count ?? 0,
        );
      const allocatedHours = input.allocatedHours ?? null;
      const hoursLeft = Math.max(0, (allocatedHours ?? 0) - (existing.hoursSpent ?? 0));
      const sizeManualOverride = input.sizeManualOverride ?? existing.sizeManualOverride;
      const size = sizeManualOverride
        ? (input.size ?? existing.size ?? taskSizeForHours(hoursLeft))
        : taskSizeForHours(hoursLeft);
      const plannedDate =
        input.plannedDate === undefined ? existing.plannedDate : input.plannedDate;
      const plannedStartTime =
        input.plannedStartTime === undefined ? existing.plannedStartTime : input.plannedStartTime;
      const plannedEndTime =
        input.plannedEndTime === undefined ? existing.plannedEndTime : input.plannedEndTime;
      const scheduleChanged =
        plannedDate !== existing.plannedDate ||
        plannedStartTime !== existing.plannedStartTime ||
        plannedEndTime !== existing.plannedEndTime;
      const result = await client.query<Omit<TaskRecord, "checklist">>(
        `UPDATE opsweave.tasks SET project_id=$3,client_name=$4,title=$5,priority_level=$6,status=$7,
          workflow_lane=$8,allocated_hours=$9,size=$10,size_manual_override=$11,value_add=$12,
          work_description=$13,definition_of_done=$14,origin=$15,notes=$16::jsonb,start_date=$17,start_time=$18,
          due_date=$19,end_time=$20,business_value_score=$21,business_value_rationale=$22,value_source=$23,
          value_updated_at=CASE WHEN $21::integer IS NULL THEN NULL ELSE now() END,
          planning_eligible=$24,schedule_locked=$25,planned_date=$26,planned_start_time=$27,
          planned_end_time=$28,planning_score=$29,planning_rationale=$30,last_planned_by=$31,
          last_planned_at=$32,requires_breakdown=$33,
          completed_at=CASE WHEN $8::varchar='done' THEN coalesce(completed_at,now()) ELSE NULL END,
          cancelled_at=CASE WHEN $8::varchar='cancelled' THEN coalesce(cancelled_at,now()) ELSE NULL END,
          version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$34 AND deleted_at IS NULL
         RETURNING id,project_id AS "projectId",client_name AS "clientName",title,
          priority_level AS "priorityLevel",status,workflow_lane AS "workflowLane",
          allocated_hours::float8 AS "allocatedHours",hours_spent::float8 AS "hoursSpent",
          greatest(coalesce(allocated_hours,0)-coalesce(hours_spent,0),0)::float8 AS "hoursLeft",
          size,size_manual_override AS "sizeManualOverride",origin,
          value_add AS "valueAdd",work_description AS "workDescription",definition_of_done AS "definitionOfDone",
          notes,start_date::text AS "startDate",to_char(start_time,'HH24:MI') AS "startTime",
          due_date::text AS "dueDate",to_char(end_time,'HH24:MI') AS "endTime",
          business_value_score AS "businessValueScore",business_value_rationale AS "businessValueRationale",value_source AS "valueSource",
          manual_lane_position::float8 AS "manualLanePosition",planning_eligible AS "planningEligible",
          schedule_locked AS "scheduleLocked",requires_breakdown AS "requiresBreakdown",
          planned_date::text AS "plannedDate",to_char(planned_start_time,'HH24:MI') AS "plannedStartTime",
          to_char(planned_end_time,'HH24:MI') AS "plannedEndTime",planning_score AS "planningScore",
          planning_rationale AS "planningRationale",last_planned_by AS "lastPlannedBy",
          last_planned_at AS "lastPlannedAt",completed_at AS "completedAt",
          cancelled_at AS "cancelledAt",deleted_at AS "deletedAt",version,created_at AS "createdAt"`,
        [
          taskId,
          workspaceId,
          input.projectId ?? null,
          clientName,
          input.title,
          input.priorityLevel ?? null,
          input.status ?? "not_started",
          lane,
          allocatedHours,
          size,
          sizeManualOverride,
          input.valueAdd ?? null,
          input.workDescription ?? null,
          input.definitionOfDone ?? null,
          input.origin ?? null,
          JSON.stringify(input.notes ?? existing.notes ?? EMPTY_RICH_TEXT_DOCUMENT),
          input.startDate ?? null,
          input.startTime ?? null,
          input.dueDate ?? null,
          input.endTime ?? null,
          input.businessValueScore ?? null,
          input.businessValueRationale ?? null,
          input.valueSource ?? null,
          input.planningEligible ?? existing.planningEligible,
          input.scheduleLocked ?? existing.scheduleLocked,
          plannedDate,
          plannedStartTime,
          plannedEndTime,
          input.planningScore === undefined ? existing.planningScore : input.planningScore,
          input.planningRationale === undefined
            ? existing.planningRationale
            : input.planningRationale,
          scheduleChanged ? "user" : existing.lastPlannedBy,
          scheduleChanged ? new Date() : existing.lastPlannedAt,
          size === "mega" && checklistCount === 0,
          input.version,
        ],
      );
      const task = result.rows[0];
      if (task === undefined) throw new StoreConflictError("Task changed in another request.");
      const existingChecklist = await client.query<{
        completed: boolean;
        description: string | null;
        label: string;
        position: number;
        predictedHours: number | null;
      }>(
        `SELECT label,description,predicted_hours::float8 AS "predictedHours",completed,position FROM opsweave.task_checklist_items
         WHERE task_id=$1 ORDER BY position,id`,
        [taskId],
      );
      if (input.checklist !== undefined) {
        await client.query("DELETE FROM opsweave.task_checklist_items WHERE task_id=$1", [taskId]);
        for (const item of input.checklist)
          await client.query(
            "INSERT INTO opsweave.task_checklist_items (task_id,label,description,predicted_hours,completed,position) VALUES ($1,$2,$3,$4,$5,$6)",
            [
              taskId,
              item.label,
              item.description ?? null,
              item.predictedHours ?? null,
              item.completed,
              item.position,
            ],
          );
      }
      await this.syncTaskAttachmentRetention(client, workspaceId, taskId);
      const changes = auditChanges(
        {
          allocatedHours: existing.allocatedHours,
          businessValueRationale: existing.businessValueRationale,
          businessValueScore: existing.businessValueScore,
          clientName: existing.clientName,
          definitionOfDone: existing.definitionOfDone,
          dueDate: existing.dueDate,
          endTime: existing.endTime,
          hoursSpent: existing.hoursSpent,
          origin: existing.origin,
          projectId: existing.projectId,
          priorityLevel: existing.priorityLevel,
          size: existing.size,
          startDate: existing.startDate,
          startTime: existing.startTime,
          status: existing.status,
          title: existing.title,
          valueAdd: existing.valueAdd,
          workDescription: existing.workDescription,
          workflowLane: existing.workflowLane,
        },
        {
          allocatedHours: task.allocatedHours,
          businessValueRationale: task.businessValueRationale,
          businessValueScore: task.businessValueScore,
          clientName: task.clientName,
          definitionOfDone: task.definitionOfDone,
          dueDate: task.dueDate,
          endTime: task.endTime,
          hoursSpent: task.hoursSpent,
          origin: task.origin,
          projectId: task.projectId,
          priorityLevel: task.priorityLevel,
          size: task.size,
          startDate: task.startDate,
          startTime: task.startTime,
          status: task.status,
          title: task.title,
          valueAdd: task.valueAdd,
          workDescription: task.workDescription,
          workflowLane: task.workflowLane,
        },
      );
      if (JSON.stringify(existing.notes) !== JSON.stringify(task.notes))
        changes.notes = { from: "Previous content", to: "Edited content" };
      if (
        input.checklist !== undefined &&
        JSON.stringify(
          existingChecklist.rows.map(
            ({ completed, description, label, position, predictedHours }) => ({
              completed,
              description,
              label,
              position,
              predictedHours,
            }),
          ),
        ) !==
          JSON.stringify(
            input.checklist.map(({ completed, description, label, position, predictedHours }) => ({
              completed,
              description: description ?? null,
              label,
              position,
              predictedHours: predictedHours ?? null,
            })),
          )
      )
        changes.subtasks = { from: existingChecklist.rows, to: input.checklist };
      await audit(client, {
        action: "task.updated",
        actorOwnerId: ownerId,
        metadata: { changes },
        targetId: task.id,
        targetType: "task",
        workspaceId,
      });
      const corrections = [
        existing.allocatedHours === task.allocatedHours
          ? null
          : `allocated hours ${String(existing.allocatedHours ?? "unset")} → ${String(task.allocatedHours ?? "unset")}`,
        existing.hoursSpent === task.hoursSpent
          ? null
          : `hours spent ${String(existing.hoursSpent ?? "unset")} → ${String(task.hoursSpent ?? "unset")}`,
        existing.size === task.size
          ? null
          : `size ${existing.size ?? "unset"} → ${task.size ?? "unset"}`,
        existing.projectId === task.projectId ? null : "project assignment changed",
      ].filter((value): value is string => value !== null);
      if (corrections.length > 0)
        await this.recordLearningEventWithClient(client, workspaceId, {
          kind: "task_correction",
          sourceEntityId: task.id,
          sourceEntityType: "task",
          summary: `For task "${task.title}": ${corrections.join(", ")}.`,
        });
      if (existing.workflowLane !== "done" && task.workflowLane === "done")
        await this.recordLearningEventWithClient(client, workspaceId, {
          kind: "task_completed",
          sourceEntityId: task.id,
          sourceEntityType: "task",
          summary: `Completed task "${task.title}" with ${String(task.allocatedHours ?? "unknown")} allocated hours, ${String(task.hoursSpent ?? "unknown")} hours spent, and ${task.size ?? "unset"} size.`,
        });
      return {
        ...task,
        checklist: (input.checklist ?? []).map((item, index) => ({
          completed: item.completed,
          description: item.description ?? null,
          id: `updated-${String(index)}`,
          label: item.label,
          position: item.position,
          predictedHours: item.predictedHours ?? null,
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
      const currentResult = await client.query<{ workflowLane: TaskLane }>(
        `SELECT workflow_lane AS "workflowLane" FROM opsweave.tasks
         WHERE id=$1 AND workspace_id=$2 AND version=$3 AND deleted_at IS NULL FOR UPDATE`,
        [taskId, workspaceId, version],
      );
      const current = currentResult.rows[0];
      if (current === undefined) throw new StoreConflictError("Task changed in another request.");
      const position = await client.query<{ position: number }>(
        `SELECT coalesce(max(manual_lane_position),0)::float8+1 AS position FROM opsweave.tasks WHERE workspace_id=$1 AND workflow_lane=$2`,
        [workspaceId, lane],
      );
      const result = await client.query<Omit<TaskRecord, "checklist">>(
        `UPDATE opsweave.tasks SET workflow_lane=$3,manual_lane_position=$4,
          completed_at=CASE WHEN $3::varchar='done' THEN coalesce(completed_at,now()) ELSE NULL END,
          cancelled_at=CASE WHEN $3::varchar='cancelled' THEN coalesce(cancelled_at,now()) ELSE NULL END,
          version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$5 AND deleted_at IS NULL
         RETURNING id,project_id AS "projectId",client_name AS "clientName",title,
          priority_level AS "priorityLevel",status,workflow_lane AS "workflowLane",
          allocated_hours::float8 AS "allocatedHours",hours_spent::float8 AS "hoursSpent",
          greatest(coalesce(allocated_hours,0)-coalesce(hours_spent,0),0)::float8 AS "hoursLeft",
          size,size_manual_override AS "sizeManualOverride",origin,
          value_add AS "valueAdd",work_description AS "workDescription",definition_of_done AS "definitionOfDone",
          notes,start_date::text AS "startDate",to_char(start_time,'HH24:MI') AS "startTime",
          due_date::text AS "dueDate",to_char(end_time,'HH24:MI') AS "endTime",
          business_value_score AS "businessValueScore",business_value_rationale AS "businessValueRationale",
          value_source AS "valueSource",manual_lane_position::float8 AS "manualLanePosition",
          planning_eligible AS "planningEligible",schedule_locked AS "scheduleLocked",
          requires_breakdown AS "requiresBreakdown",planned_date::text AS "plannedDate",
          to_char(planned_start_time,'HH24:MI') AS "plannedStartTime",
          to_char(planned_end_time,'HH24:MI') AS "plannedEndTime",planning_score AS "planningScore",
          planning_rationale AS "planningRationale",last_planned_by AS "lastPlannedBy",
          last_planned_at AS "lastPlannedAt",
          completed_at AS "completedAt",cancelled_at AS "cancelledAt",deleted_at AS "deletedAt",
          version,created_at AS "createdAt"`,
        [taskId, workspaceId, lane, position.rows[0]?.position ?? 1, version],
      );
      const task = result.rows[0];
      if (task === undefined) throw new StoreConflictError("Task changed in another request.");
      await this.syncTaskAttachmentRetention(client, workspaceId, taskId);
      await audit(client, {
        action: "task.moved",
        actorOwnerId: ownerId,
        metadata: {
          changes: { workflowLane: { from: current.workflowLane, to: lane } },
        },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
      if (lane === "done")
        await this.recordLearningEventWithClient(client, workspaceId, {
          kind: "task_completed",
          sourceEntityId: task.id,
          sourceEntityType: "task",
          summary: `Completed task "${task.title}" with ${String(task.allocatedHours ?? "unknown")} allocated hours, ${String(task.hoursSpent ?? "unknown")} hours spent, and ${task.size ?? "unset"} size.`,
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
        'SELECT workflow_lane AS "workflowLane" FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2 AND version=$3 AND deleted_at IS NULL FOR UPDATE',
        [taskId, workspaceId, version],
      );
      const current = currentResult.rows[0];
      if (current === undefined) throw new StoreConflictError("Task changed in another request.");
      const rows = await client.query<{ id: string }>(
        "SELECT id FROM opsweave.tasks WHERE workspace_id=$1 AND workflow_lane=$2 AND deleted_at IS NULL ORDER BY manual_lane_position,created_at,id FOR UPDATE",
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
    return (await this.listEntityDependencies(workspaceId)).flatMap((dependency) =>
      dependency.dependentType === "task" && dependency.blockerType === "task"
        ? [{ dependsOnTaskId: dependency.blockerId, taskId: dependency.dependentId }]
        : [],
    );
  }

  public async listProjectDependencies(workspaceId: string): Promise<ProjectDependencyRecord[]> {
    return (await this.listEntityDependencies(workspaceId)).flatMap((dependency) =>
      dependency.dependentType === "project" && dependency.blockerType === "project"
        ? [{ dependsOnProjectId: dependency.blockerId, projectId: dependency.dependentId }]
        : [],
    );
  }

  public async listEntityDependencies(workspaceId: string): Promise<EntityDependencyRecord[]> {
    const result = await this.pool.query<EntityDependencyRecord>(
      `SELECT dependent_type AS "dependentType",dependent_id AS "dependentId",
        blocker_type AS "blockerType",blocker_id AS "blockerId"
       FROM opsweave.entity_dependencies dependency
       WHERE workspace_id=$1
         AND (
           (dependent_type='task' AND EXISTS (
             SELECT 1 FROM opsweave.tasks task
             WHERE task.id=dependent_id AND task.workspace_id=$1 AND task.deleted_at IS NULL
           )) OR
           (dependent_type='project' AND EXISTS (
             SELECT 1 FROM opsweave.projects project
             WHERE project.id=dependent_id AND project.workspace_id=$1 AND project.archived_at IS NULL
           ))
         )
         AND (
           (blocker_type='task' AND EXISTS (
             SELECT 1 FROM opsweave.tasks task
             WHERE task.id=blocker_id AND task.workspace_id=$1 AND task.deleted_at IS NULL
           )) OR
           (blocker_type='project' AND EXISTS (
             SELECT 1 FROM opsweave.projects project
             WHERE project.id=blocker_id AND project.workspace_id=$1 AND project.archived_at IS NULL
           ))
         )
       ORDER BY dependent_type,dependent_id,blocker_type,blocker_id`,
      [workspaceId],
    );
    return result.rows;
  }

  private async lockWorkEntity(
    client: PoolClient,
    workspaceId: string,
    type: WorkEntityType,
    id: string,
  ): Promise<void> {
    const result =
      type === "task"
        ? await client.query(
            `SELECT 1 FROM opsweave.tasks
             WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE`,
            [id, workspaceId],
          )
        : await client.query(
            `SELECT 1 FROM opsweave.projects
             WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL FOR UPDATE`,
            [id, workspaceId],
          );
    if (result.rowCount !== 1) throw new StoreConflictError(`The selected ${type} is unavailable.`);
  }

  public async createEntityDependency(
    workspaceId: string,
    ownerId: string,
    dependentType: WorkEntityType,
    dependentId: string,
    blockerType: WorkEntityType,
    blockerId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const entities = [
        { id: dependentId, type: dependentType },
        { id: blockerId, type: blockerType },
      ].sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));
      for (const entity of entities)
        await this.lockWorkEntity(client, workspaceId, entity.type, entity.id);
      const existing = await client.query<EntityDependencyRecord>(
        `SELECT dependent_type AS "dependentType",dependent_id AS "dependentId",
          blocker_type AS "blockerType",blocker_id AS "blockerId"
         FROM opsweave.entity_dependencies WHERE workspace_id=$1 FOR UPDATE`,
        [workspaceId],
      );
      const dependentKey = `${dependentType}:${dependentId}`;
      const blockerKey = `${blockerType}:${blockerId}`;
      const blockersByEntity = new Map<string, string[]>();
      for (const dependency of existing.rows) {
        const key = `${dependency.dependentType}:${dependency.dependentId}`;
        blockersByEntity.set(key, [
          ...(blockersByEntity.get(key) ?? []),
          `${dependency.blockerType}:${dependency.blockerId}`,
        ]);
      }
      const visited = new Set<string>();
      const reachesDependent = (key: string): boolean => {
        if (key === dependentKey) return true;
        if (visited.has(key)) return false;
        visited.add(key);
        return (blockersByEntity.get(key) ?? []).some(reachesDependent);
      };
      if (reachesDependent(blockerKey))
        throw new StoreConflictError("This dependency would create a cycle.");
      try {
        await client.query(
          `INSERT INTO opsweave.entity_dependencies
            (workspace_id,dependent_type,dependent_id,blocker_type,blocker_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [workspaceId, dependentType, dependentId, blockerType, blockerId],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505")
          throw new StoreConflictError("This dependency already exists.");
        throw error;
      }
      await audit(client, {
        action: `${dependentType}.dependency.created`,
        actorOwnerId: ownerId,
        metadata: { blockerId, blockerType },
        targetId: dependentId,
        targetType: dependentType,
        workspaceId,
      });
    });
  }

  public async removeEntityDependency(
    workspaceId: string,
    ownerId: string,
    dependentType: WorkEntityType,
    dependentId: string,
    blockerType: WorkEntityType,
    blockerId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        `DELETE FROM opsweave.entity_dependencies
         WHERE workspace_id=$1 AND dependent_type=$2 AND dependent_id=$3
           AND blocker_type=$4 AND blocker_id=$5`,
        [workspaceId, dependentType, dependentId, blockerType, blockerId],
      );
      if (result.rowCount !== 1) throw new StoreConflictError("Dependency is unavailable.");
      await audit(client, {
        action: `${dependentType}.dependency.removed`,
        actorOwnerId: ownerId,
        metadata: { blockerId, blockerType },
        targetId: dependentId,
        targetType: dependentType,
        workspaceId,
      });
    });
  }

  public async createProjectDependency(
    workspaceId: string,
    ownerId: string,
    projectId: string,
    dependsOnProjectId: string,
  ): Promise<void> {
    await this.createEntityDependency(
      workspaceId,
      ownerId,
      "project",
      projectId,
      "project",
      dependsOnProjectId,
    );
  }

  public async removeProjectDependency(
    workspaceId: string,
    ownerId: string,
    projectId: string,
    dependsOnProjectId: string,
  ): Promise<void> {
    await this.removeEntityDependency(
      workspaceId,
      ownerId,
      "project",
      projectId,
      "project",
      dependsOnProjectId,
    );
  }

  public async createTaskDependency(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    dependsOnTaskId: string,
  ): Promise<void> {
    await this.createEntityDependency(
      workspaceId,
      ownerId,
      "task",
      taskId,
      "task",
      dependsOnTaskId,
    );
  }

  public async removeTaskDependency(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    dependsOnTaskId: string,
  ): Promise<void> {
    await this.removeEntityDependency(
      workspaceId,
      ownerId,
      "task",
      taskId,
      "task",
      dependsOnTaskId,
    );
  }

  public async listTaskTimeEntries(
    workspaceId: string,
    taskId: string,
  ): Promise<TaskTimeEntryRecord[]> {
    const result = await this.pool.query<TaskTimeEntryRecord>(
      `SELECT entry.id,entry.task_id AS "taskId",entry.entry_date::text AS "entryDate",
        entry.description,entry.hours::float8 AS hours,entry.created_at AS "createdAt"
       FROM opsweave.task_time_entries entry
       JOIN opsweave.tasks task ON task.id=entry.task_id
       WHERE task.workspace_id=$1 AND task.id=$2 AND task.deleted_at IS NULL
       ORDER BY entry.entry_date DESC,entry.created_at DESC,entry.id DESC`,
      [workspaceId, taskId],
    );
    return result.rows;
  }

  public async replaceTaskChecklist(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    version: number,
    items: readonly { description: string; predictedHours: number; title: string }[],
    provider: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const task = await client.query(
        `UPDATE opsweave.tasks SET version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$3
           AND deleted_at IS NULL RETURNING id`,
        [taskId, workspaceId, version],
      );
      if (task.rowCount !== 1) throw new StoreConflictError("Task changed in another request.");
      await client.query("DELETE FROM opsweave.task_checklist_items WHERE task_id=$1", [taskId]);
      for (const [position, item] of items.entries())
        await client.query(
          `INSERT INTO opsweave.task_checklist_items
            (task_id,label,description,predicted_hours,completed,position)
           VALUES ($1,$2,$3,$4,false,$5)`,
          [taskId, item.title, item.description, item.predictedHours, position],
        );
      await client.query(
        `UPDATE opsweave.tasks SET requires_breakdown=(size='mega' AND $2::integer=0),updated_at=now()
         WHERE id=$1`,
        [taskId, items.length],
      );
      await audit(client, {
        action: "task.subtasks.generated",
        actorOwnerId: ownerId,
        metadata: { count: items.length, provider },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
    });
  }

  public async splitMegaTaskIntoTasks(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    version: number,
    items: readonly { description: string; hours: number; title: string }[],
    provider: string,
  ): Promise<string[]> {
    return transaction(this.pool, async (client) => {
      if (items.length === 0 || items.some((item) => item.hours <= 0 || item.hours > 2))
        throw new StoreConflictError("The generated split is invalid.");
      const sourceResult = await client.query<{
        manualLanePosition: number;
        title: string;
      }>(
        `SELECT title,manual_lane_position::float8 AS "manualLanePosition"
         FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2 AND version=$3
           AND greatest(coalesce(allocated_hours,0)-coalesce(hours_spent,0),0)>2
           AND deleted_at IS NULL FOR UPDATE`,
        [taskId, workspaceId, version],
      );
      const source = sourceResult.rows[0];
      if (source === undefined)
        throw new StoreConflictError("Mega task changed in another request.");
      const createdIds: string[] = [];
      for (const [index, item] of items.entries()) {
        const result = await client.query<{ id: string }>(
          `INSERT INTO opsweave.tasks
            (workspace_id,project_id,client_name,title,priority_level,status,workflow_lane,
             allocated_hours,hours_spent,size,value_add,work_description,definition_of_done,origin,
             notes,start_date,start_time,due_date,end_time,business_value_score,
             business_value_rationale,value_source,value_updated_at,manual_lane_position)
           SELECT workspace_id,project_id,client_name,$4,priority_level,status,workflow_lane,
             $5,NULL,$6,value_add,$7,definition_of_done,$8,notes,start_date,start_time,due_date,end_time,
             business_value_score,business_value_rationale,value_source,value_updated_at,$9
           FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2 AND version=$3
           RETURNING id`,
          [
            taskId,
            workspaceId,
            version,
            item.title,
            item.hours,
            taskSizeForHours(item.hours),
            item.description,
            `Originated from mega task “${source.title}”.`,
            source.manualLanePosition + index * 0.001,
          ],
        );
        const id = result.rows[0]?.id;
        if (id === undefined) throw new Error("A generated task could not be created.");
        createdIds.push(id);
      }
      const originalEdges = await client.query<EntityDependencyRecord>(
        `SELECT dependent_type AS "dependentType",dependent_id AS "dependentId",
          blocker_type AS "blockerType",blocker_id AS "blockerId"
         FROM opsweave.entity_dependencies
         WHERE workspace_id=$1 AND ((dependent_type='task' AND dependent_id=$2)
           OR (blocker_type='task' AND blocker_id=$2))`,
        [workspaceId, taskId],
      );
      await client.query(
        `DELETE FROM opsweave.entity_dependencies WHERE workspace_id=$1
         AND ((dependent_type='task' AND dependent_id=$2) OR (blocker_type='task' AND blocker_id=$2))`,
        [workspaceId, taskId],
      );
      const firstId = createdIds[0];
      const lastId = createdIds.at(-1);
      if (firstId === undefined || lastId === undefined)
        throw new Error("No generated tasks were created.");
      for (const edge of originalEdges.rows) {
        const dependentId =
          edge.dependentType === "task" && edge.dependentId === taskId ? firstId : edge.dependentId;
        const blockerId =
          edge.blockerType === "task" && edge.blockerId === taskId ? lastId : edge.blockerId;
        await client.query(
          `INSERT INTO opsweave.entity_dependencies
            (workspace_id,dependent_type,dependent_id,blocker_type,blocker_id)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [workspaceId, edge.dependentType, dependentId, edge.blockerType, blockerId],
        );
      }
      for (let index = 1; index < createdIds.length; index += 1) {
        const dependentTaskId = createdIds.at(index);
        const blockerTaskId = createdIds.at(index - 1);
        if (dependentTaskId === undefined || blockerTaskId === undefined)
          throw new Error("Generated task sequence is incomplete.");
        await client.query(
          `INSERT INTO opsweave.entity_dependencies
            (workspace_id,dependent_type,dependent_id,blocker_type,blocker_id)
           VALUES ($1,'task',$2,'task',$3) ON CONFLICT DO NOTHING`,
          [workspaceId, dependentTaskId, blockerTaskId],
        );
      }
      await client.query(
        "UPDATE opsweave.attachments SET entity_id=$3 WHERE workspace_id=$1 AND entity_type='task' AND entity_id=$2",
        [workspaceId, taskId, firstId],
      );
      await client.query("UPDATE opsweave.task_time_entries SET task_id=$2 WHERE task_id=$1", [
        taskId,
        firstId,
      ]);
      await client.query(
        `UPDATE opsweave.tasks SET hours_spent=(SELECT coalesce(sum(hours),0)
          FROM opsweave.task_time_entries WHERE task_id=$1) WHERE id=$1`,
        [firstId],
      );
      const removed = await client.query(
        `UPDATE opsweave.tasks SET deleted_at=now(),version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$3 AND deleted_at IS NULL`,
        [taskId, workspaceId, version],
      );
      if (removed.rowCount !== 1) throw new Error("The original Mega task could not be retired.");
      await audit(client, {
        action: "task.mega_split.completed",
        actorOwnerId: ownerId,
        metadata: { createdTaskIds: createdIds, provider, sourceTitle: source.title },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
      return createdIds;
    });
  }

  public async addTaskTimeEntry(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    input: { description: string; entryDate: string; hours: number },
  ): Promise<{ entries: TaskTimeEntryRecord[]; hoursSpent: number; version: number }> {
    await transaction(this.pool, async (client) => {
      const task = await client.query(
        "SELECT 1 FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE",
        [taskId, workspaceId],
      );
      if (task.rowCount !== 1) throw new StoreConflictError("Task is unavailable.");
      await client.query(
        `INSERT INTO opsweave.task_time_entries (task_id,entry_date,description,hours)
         VALUES ($1,$2,$3,$4)`,
        [taskId, input.entryDate, input.description, input.hours],
      );
      await client.query(
        `UPDATE opsweave.tasks task SET hours_spent=totals.spent,
           size=CASE WHEN task.size_manual_override THEN task.size
             WHEN greatest(coalesce(task.allocated_hours,0)-totals.spent,0)<=0.5 THEN 'small'
             WHEN greatest(coalesce(task.allocated_hours,0)-totals.spent,0)<=1 THEN 'medium'
             WHEN greatest(coalesce(task.allocated_hours,0)-totals.spent,0)<=2 THEN 'large'
             ELSE 'mega' END,
           requires_breakdown=CASE WHEN task.size_manual_override THEN
             task.size='mega' AND NOT EXISTS (SELECT 1 FROM opsweave.task_checklist_items WHERE task_id=$1)
             ELSE greatest(coalesce(task.allocated_hours,0)-totals.spent,0)>2
               AND NOT EXISTS (SELECT 1 FROM opsweave.task_checklist_items WHERE task_id=$1) END,
           version=version+1,updated_at=now()
         FROM (SELECT coalesce(sum(hours),0) AS spent FROM opsweave.task_time_entries WHERE task_id=$1) totals
         WHERE task.id=$1`,
        [taskId],
      );
      await audit(client, {
        action: "task.time_entry.created",
        actorOwnerId: ownerId,
        metadata: { date: input.entryDate, hours: input.hours },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
    });
    const summary = await this.pool.query<{ hoursSpent: number; version: number }>(
      `SELECT coalesce(hours_spent,0)::float8 AS "hoursSpent",version
       FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2`,
      [taskId, workspaceId],
    );
    return {
      entries: await this.listTaskTimeEntries(workspaceId, taskId),
      hoursSpent: summary.rows[0]?.hoursSpent ?? 0,
      version: summary.rows[0]?.version ?? 1,
    };
  }

  public async deleteTaskTimeEntry(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    entryId: string,
  ): Promise<{ entries: TaskTimeEntryRecord[]; hoursSpent: number; version: number }> {
    await transaction(this.pool, async (client) => {
      const removed = await client.query(
        `DELETE FROM opsweave.task_time_entries entry USING opsweave.tasks task
         WHERE entry.id=$1 AND entry.task_id=$2 AND task.id=entry.task_id
           AND task.workspace_id=$3 AND task.deleted_at IS NULL`,
        [entryId, taskId, workspaceId],
      );
      if (removed.rowCount !== 1) throw new StoreConflictError("Time entry is unavailable.");
      await client.query(
        `UPDATE opsweave.tasks task SET hours_spent=totals.spent,
           size=CASE WHEN task.size_manual_override THEN task.size
             WHEN greatest(coalesce(task.allocated_hours,0)-totals.spent,0)<=0.5 THEN 'small'
             WHEN greatest(coalesce(task.allocated_hours,0)-totals.spent,0)<=1 THEN 'medium'
             WHEN greatest(coalesce(task.allocated_hours,0)-totals.spent,0)<=2 THEN 'large'
             ELSE 'mega' END,
           requires_breakdown=CASE WHEN task.size_manual_override THEN
             task.size='mega' AND NOT EXISTS (SELECT 1 FROM opsweave.task_checklist_items WHERE task_id=$1)
             ELSE greatest(coalesce(task.allocated_hours,0)-totals.spent,0)>2
               AND NOT EXISTS (SELECT 1 FROM opsweave.task_checklist_items WHERE task_id=$1) END,
           version=version+1,updated_at=now()
         FROM (SELECT coalesce(sum(hours),0) AS spent FROM opsweave.task_time_entries WHERE task_id=$1) totals
         WHERE task.id=$1`,
        [taskId],
      );
      await audit(client, {
        action: "task.time_entry.deleted",
        actorOwnerId: ownerId,
        metadata: {},
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
    });
    const summary = await this.pool.query<{ hoursSpent: number; version: number }>(
      `SELECT coalesce(hours_spent,0)::float8 AS "hoursSpent",version
       FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2`,
      [taskId, workspaceId],
    );
    return {
      entries: await this.listTaskTimeEntries(workspaceId, taskId),
      hoursSpent: summary.rows[0]?.hoursSpent ?? 0,
      version: summary.rows[0]?.version ?? 1,
    };
  }

  public async listAttachments(
    workspaceId: string,
    entityType: WorkEntityType,
    entityId: string,
  ): Promise<AttachmentRecord[]> {
    const result = await this.pool.query<AttachmentRecord>(
      `SELECT id,workspace_id AS "workspaceId",entity_type AS "entityType",entity_id AS "entityId",
        original_name AS "originalName",storage_key AS "storageKey",content_type AS "contentType",
        byte_size::float8 AS "byteSize",purge_after AS "purgeAfter",created_at AS "createdAt"
       FROM opsweave.attachments WHERE workspace_id=$1 AND entity_type=$2 AND entity_id=$3
       ORDER BY created_at DESC,id DESC`,
      [workspaceId, entityType, entityId],
    );
    return result.rows;
  }

  public async addAttachment(
    workspaceId: string,
    ownerId: string,
    input: {
      byteSize: number;
      contentType: string;
      entityId: string;
      entityType: WorkEntityType;
      originalName: string;
      storageKey: string;
    },
  ): Promise<AttachmentRecord> {
    return transaction(this.pool, async (client) => {
      const entity =
        input.entityType === "task"
          ? await client.query(
              "SELECT 1 FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL",
              [input.entityId, workspaceId],
            )
          : await client.query(
              "SELECT 1 FROM opsweave.projects WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL",
              [input.entityId, workspaceId],
            );
      if (entity.rowCount !== 1)
        throw new StoreConflictError("The attachment target is unavailable.");
      const result = await client.query<AttachmentRecord>(
        `INSERT INTO opsweave.attachments
          (workspace_id,entity_type,entity_id,original_name,storage_key,content_type,byte_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,workspace_id AS "workspaceId",entity_type AS "entityType",entity_id AS "entityId",
          original_name AS "originalName",storage_key AS "storageKey",content_type AS "contentType",
          byte_size::float8 AS "byteSize",purge_after AS "purgeAfter",created_at AS "createdAt"`,
        [
          workspaceId,
          input.entityType,
          input.entityId,
          input.originalName,
          input.storageKey,
          input.contentType,
          input.byteSize,
        ],
      );
      if (input.entityType === "task")
        await this.syncTaskAttachmentRetention(client, workspaceId, input.entityId);
      else await this.syncProjectAttachmentRetention(client, workspaceId, input.entityId);
      await audit(client, {
        action: "attachment.created",
        actorOwnerId: ownerId,
        metadata: { byteSize: input.byteSize, name: input.originalName },
        targetId: input.entityId,
        targetType: input.entityType,
        workspaceId,
      });
      const attachment = result.rows[0];
      if (attachment === undefined) throw new Error("Attachment creation failed.");
      const refreshed = await client.query<AttachmentRecord>(
        `SELECT id,workspace_id AS "workspaceId",entity_type AS "entityType",entity_id AS "entityId",
          original_name AS "originalName",storage_key AS "storageKey",content_type AS "contentType",
          byte_size::float8 AS "byteSize",purge_after AS "purgeAfter",created_at AS "createdAt"
         FROM opsweave.attachments WHERE id=$1`,
        [attachment.id],
      );
      return refreshed.rows[0] ?? attachment;
    });
  }

  public async getAttachment(
    workspaceId: string,
    attachmentId: string,
  ): Promise<AttachmentRecord | null> {
    const result = await this.pool.query<AttachmentRecord>(
      `SELECT id,workspace_id AS "workspaceId",entity_type AS "entityType",entity_id AS "entityId",
        original_name AS "originalName",storage_key AS "storageKey",content_type AS "contentType",
        byte_size::float8 AS "byteSize",purge_after AS "purgeAfter",created_at AS "createdAt"
       FROM opsweave.attachments WHERE id=$1 AND workspace_id=$2`,
      [attachmentId, workspaceId],
    );
    return result.rows[0] ?? null;
  }

  public async deleteAttachment(
    workspaceId: string,
    ownerId: string,
    attachmentId: string,
  ): Promise<AttachmentRecord> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<AttachmentRecord>(
        `DELETE FROM opsweave.attachments WHERE id=$1 AND workspace_id=$2
         RETURNING id,workspace_id AS "workspaceId",entity_type AS "entityType",entity_id AS "entityId",
          original_name AS "originalName",storage_key AS "storageKey",content_type AS "contentType",
          byte_size::float8 AS "byteSize",purge_after AS "purgeAfter",created_at AS "createdAt"`,
        [attachmentId, workspaceId],
      );
      const attachment = result.rows[0];
      if (attachment === undefined) throw new StoreConflictError("Attachment is unavailable.");
      await audit(client, {
        action: "attachment.deleted",
        actorOwnerId: ownerId,
        metadata: { name: attachment.originalName },
        targetId: attachment.entityId,
        targetType: attachment.entityType,
        workspaceId,
      });
      return attachment;
    });
  }

  public async listExpiredAttachments(now: Date): Promise<AttachmentRecord[]> {
    const result = await this.pool.query<AttachmentRecord>(
      `SELECT id,workspace_id AS "workspaceId",entity_type AS "entityType",entity_id AS "entityId",
        original_name AS "originalName",storage_key AS "storageKey",content_type AS "contentType",
        byte_size::float8 AS "byteSize",purge_after AS "purgeAfter",created_at AS "createdAt"
       FROM opsweave.attachments WHERE purge_after IS NOT NULL AND purge_after <= $1
       ORDER BY purge_after,id LIMIT 1000`,
      [now],
    );
    return result.rows;
  }

  public async deleteExpiredAttachmentRecord(attachmentId: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM opsweave.attachments WHERE id=$1 AND purge_after IS NOT NULL AND purge_after <= $2",
      [attachmentId, now],
    );
    return result.rowCount === 1;
  }

  public async deleteProject(
    workspaceId: string,
    ownerId: string,
    projectId: string,
    version: number,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query<{ name: string }>(
        `UPDATE opsweave.projects SET archived_at=now(),version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$3 AND archived_at IS NULL RETURNING name`,
        [projectId, workspaceId, version],
      );
      const project = result.rows[0];
      if (project === undefined)
        throw new StoreConflictError("Project changed in another request.");
      await audit(client, {
        action: "project.deleted",
        actorOwnerId: ownerId,
        metadata: { recoverable: true },
        targetId: projectId,
        targetType: "project",
        workspaceId,
      });
    });
  }

  public async deleteTask(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    version: number,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query<{ title: string }>(
        `UPDATE opsweave.tasks SET deleted_at=now(),version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$3 AND deleted_at IS NULL RETURNING title`,
        [taskId, workspaceId, version],
      );
      const task = result.rows[0];
      if (task === undefined) throw new StoreConflictError("Task changed in another request.");
      await audit(client, {
        action: "task.deleted",
        actorOwnerId: ownerId,
        metadata: { recoverable: true },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
      await this.recordLearningEventWithClient(client, workspaceId, {
        kind: "task_deleted",
        sourceEntityId: taskId,
        sourceEntityType: "task",
        summary: `Deleted task "${task.title}".`,
      });
    });
  }

  public async rescheduleTask(
    workspaceId: string,
    ownerId: string,
    taskId: string,
    version: number,
    requestedStart: Date,
  ): Promise<void> {
    const { workingDays } = await this.getWorkspaceConfiguration(workspaceId);
    await transaction(this.pool, async (client) => {
      const current = await client.query<Pick<TaskRecord, "hoursLeft" | "title">>(
        `SELECT greatest(coalesce(allocated_hours,0)-coalesce(hours_spent,0),0)::float8 AS "hoursLeft",title
         FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2 AND version=$3
           AND deleted_at IS NULL FOR UPDATE`,
        [taskId, workspaceId, version],
      );
      const task = current.rows[0];
      if (task === undefined) throw new StoreConflictError("Task changed in another request.");
      const schedule = scheduleWithinWorkingTime(
        requestedStart.getTime(),
        Math.max(0.25, task.hoursLeft),
        workingDays,
      );
      const start = timestampParts(schedule.start);
      const end = timestampParts(schedule.end);
      await client.query(
        `UPDATE opsweave.tasks SET planned_date=$3,planned_start_time=$4,planned_end_time=$5,
          schedule_locked=true,last_planned_by='user',last_planned_at=now(),
          version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2`,
        [taskId, workspaceId, start.date, start.time, end.time],
      );
      await audit(client, {
        action: "task.schedule.moved",
        actorOwnerId: ownerId,
        metadata: { end, start },
        targetId: taskId,
        targetType: "task",
        workspaceId,
      });
    });
  }

  public async shiftProjectSchedule(
    workspaceId: string,
    ownerId: string,
    projectId: string,
    version: number,
    deltaMinutes: number,
  ): Promise<void> {
    const { workingDays } = await this.getWorkspaceConfiguration(workspaceId);
    await transaction(this.pool, async (client) => {
      const project = await client.query<{ name: string }>(
        `SELECT name FROM opsweave.projects WHERE id=$1 AND workspace_id=$2
          AND version=$3 AND archived_at IS NULL FOR UPDATE`,
        [projectId, workspaceId, version],
      );
      if (project.rows[0] === undefined)
        throw new StoreConflictError("Project changed in another request.");
      const tasks = await client.query<
        Pick<TaskRecord, "hoursLeft" | "id" | "plannedDate" | "plannedStartTime" | "title">
      >(
        `SELECT id,title,greatest(coalesce(allocated_hours,0)-coalesce(hours_spent,0),0)::float8 AS "hoursLeft",
          planned_date::text AS "plannedDate",to_char(planned_start_time,'HH24:MI') AS "plannedStartTime"
         FROM opsweave.tasks WHERE workspace_id=$1 AND project_id=$2 AND deleted_at IS NULL
          AND workflow_lane NOT IN ('done','cancelled') FOR UPDATE`,
        [workspaceId, projectId],
      );
      const fallbackStart = Date.now();
      for (const task of tasks.rows) {
        const currentStart =
          task.plannedDate === null
            ? fallbackStart
            : Date.parse(`${task.plannedDate}T${task.plannedStartTime ?? "00:00"}:00.000Z`);
        const schedule = scheduleWithinWorkingTime(
          currentStart + deltaMinutes * 60_000,
          Math.max(0.25, task.hoursLeft),
          workingDays,
        );
        const start = timestampParts(schedule.start);
        const end = timestampParts(schedule.end);
        await client.query(
          `UPDATE opsweave.tasks SET planned_date=$3,planned_start_time=$4,planned_end_time=$5,
            schedule_locked=true,last_planned_by='user',last_planned_at=now(),
            version=version+1,updated_at=now() WHERE id=$1 AND workspace_id=$2`,
          [task.id, workspaceId, start.date, start.time, end.time],
        );
        await audit(client, {
          action: "task.schedule.moved_with_project",
          actorOwnerId: ownerId,
          metadata: { deltaMinutes, end, projectId, start },
          targetId: task.id,
          targetType: "task",
          workspaceId,
        });
      }
      await client.query(
        `UPDATE opsweave.projects SET version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2`,
        [projectId, workspaceId],
      );
      await audit(client, {
        action: "project.schedule.moved",
        actorOwnerId: ownerId,
        metadata: { deltaMinutes, taskCount: tasks.rows.length },
        targetId: projectId,
        targetType: "project",
        workspaceId,
      });
    });
  }

  public async submitIntakeSource(
    workspaceId: string,
    ownerId: string,
    input: {
      content: string;
      createNewProjects?: boolean | undefined;
      selectedProjectIds?: readonly string[] | undefined;
      sourceType: IntakeSourceRecord["sourceType"];
    },
  ): Promise<SubmittedIntakeRunRecord> {
    return transaction(this.pool, async (client) => {
      const selectedProjectIds = input.selectedProjectIds ?? [];
      const createNewProjects = input.createNewProjects ?? false;
      if (selectedProjectIds.length > 0) {
        const projects = await client.query<{ id: string }>(
          `SELECT id FROM opsweave.projects WHERE workspace_id=$1 AND archived_at IS NULL
            AND id=ANY($2::uuid[])`,
          [workspaceId, selectedProjectIds],
        );
        if (projects.rows.length !== selectedProjectIds.length)
          throw new StoreConflictError("One or more selected projects are unavailable.");
      }
      const fingerprint = normalizedIntakeFingerprint(
        `${input.content}\n${[...selectedProjectIds].sort().join(",")}\n${String(createNewProjects)}`,
      );
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${workspaceId}:${fingerprint}`,
      ]);
      const duplicate = await client.query<{ id: string }>(
        `SELECT id FROM opsweave.intake_sources
         WHERE workspace_id=$1 AND content_fingerprint=$2 ORDER BY created_at,id LIMIT 1`,
        [workspaceId, fingerprint],
      );
      const source = await client.query<{ id: string }>(
        `INSERT INTO opsweave.intake_sources
          (workspace_id,source_type,content,content_fingerprint,selected_project_ids,create_new_projects)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          workspaceId,
          input.sourceType,
          input.content,
          fingerprint,
          selectedProjectIds,
          createNewProjects,
        ],
      );
      const sourceId = source.rows[0]?.id;
      if (sourceId === undefined) throw new Error("Intake source creation failed.");
      const run = await client.query<IntakeRunRecord>(
        `INSERT INTO opsweave.intake_runs (source_id,provider,schema_version) VALUES ($1,'openai','2026-08-12.2')
         RETURNING id,source_id AS "sourceId"`,
        [sourceId],
      );
      const record = run.rows[0];
      if (record === undefined) throw new Error("Intake run creation failed.");
      await audit(client, {
        action: "intake.submitted",
        actorOwnerId: ownerId,
        metadata: {
          createNewProjects,
          selectedProjectCount: selectedProjectIds.length,
          sourceType: input.sourceType,
        },
        targetId: sourceId,
        targetType: "intake_source",
        workspaceId,
      });
      return { ...record, duplicateOfSourceId: duplicate.rows[0]?.id ?? null };
    });
  }

  public async nextQueuedIntakeRun(): Promise<
    (IntakeRunRecord & Omit<IntakeSourceRecord, "id">) | null
  > {
    return transaction(this.pool, async (client) => {
      const result = await client.query<IntakeRunRecord & Omit<IntakeSourceRecord, "id">>(
        `WITH next_run AS (SELECT id,source_id FROM opsweave.intake_runs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1),
         claimed AS (UPDATE opsweave.intake_runs run SET status='processing',updated_at=now() FROM next_run
         WHERE run.id=next_run.id RETURNING run.id,run.source_id)
         UPDATE opsweave.intake_sources source SET status='processing',updated_at=now() FROM claimed
         WHERE source.id=claimed.source_id
         RETURNING claimed.id,claimed.source_id AS "sourceId",source.workspace_id AS "workspaceId",
          source.content,source.create_new_projects AS "createNewProjects",
          source.selected_project_ids AS "selectedProjectIds",
          source.source_type AS "sourceType",source.status`,
      );
      return result.rows[0] ?? null;
    });
  }

  public async recoverStaleIntakeRuns(cutoff: Date): Promise<number> {
    const result = await this.pool.query(
      `WITH stale AS (
         UPDATE opsweave.intake_runs SET status='queued',safe_error=NULL,updated_at=now()
         WHERE status='processing' AND updated_at<=$1 RETURNING source_id
       )
       UPDATE opsweave.intake_sources source SET status='queued',updated_at=now()
       FROM stale WHERE source.id=stale.source_id RETURNING source.id`,
      [cutoff],
    );
    return result.rowCount ?? 0;
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
      `SELECT draft.id,draft.proposal,draft.approval_result AS "approvalResult",draft.status,
        source.content AS "sourceContent",source.create_new_projects AS "createNewProjects",
        source.selected_project_ids AS "selectedProjectIds",source.source_type AS "sourceType",
        trash.purge_after AS "purgeAfter",
        (SELECT duplicate.id FROM opsweave.intake_sources duplicate
         WHERE duplicate.workspace_id=source.workspace_id
           AND duplicate.content_fingerprint=source.content_fingerprint
           AND (duplicate.created_at,duplicate.id)<(source.created_at,source.id)
         ORDER BY duplicate.created_at,duplicate.id LIMIT 1) AS "duplicateOfSourceId"
       FROM opsweave.intake_drafts draft
       JOIN opsweave.intake_runs run ON run.id=draft.run_id
       JOIN opsweave.intake_sources source ON source.id=run.source_id
       LEFT JOIN opsweave.trash_records trash ON trash.workspace_id=source.workspace_id
         AND trash.entity_type='intake_draft' AND trash.entity_id=draft.id
       WHERE source.workspace_id=$1 ORDER BY draft.created_at DESC`,
      [workspaceId],
    );
    return result.rows;
  }

  public async updateIntakeDraftProposal(
    workspaceId: string,
    ownerId: string,
    draftId: string,
    proposal: unknown,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE opsweave.intake_drafts draft SET proposal=$3::jsonb,updated_at=now()
         FROM opsweave.intake_runs run JOIN opsweave.intake_sources source ON source.id=run.source_id
         WHERE draft.id=$1 AND draft.run_id=run.id AND source.workspace_id=$2
           AND draft.status='review_required'`,
        [draftId, workspaceId, JSON.stringify(proposal)],
      );
      if (result.rowCount !== 1) throw new StoreConflictError("Intake draft is unavailable.");
      await audit(client, {
        action: "intake.draft.edited",
        actorOwnerId: ownerId,
        metadata: {},
        targetId: draftId,
        targetType: "intake_draft",
        workspaceId,
      });
    });
  }

  public async listFailedIntakeRuns(workspaceId: string): Promise<FailedIntakeRunRecord[]> {
    const result = await this.pool.query<FailedIntakeRunRecord>(
      `SELECT run.id,run.safe_error AS "safeError",source.source_type AS "sourceType",
        (SELECT duplicate.id FROM opsweave.intake_sources duplicate
         WHERE duplicate.workspace_id=source.workspace_id
           AND duplicate.content_fingerprint=source.content_fingerprint
           AND (duplicate.created_at,duplicate.id)<(source.created_at,source.id)
         ORDER BY duplicate.created_at,duplicate.id LIMIT 1) AS "duplicateOfSourceId"
       FROM opsweave.intake_runs run
       JOIN opsweave.intake_sources source ON source.id=run.source_id
       WHERE source.workspace_id=$1 AND run.status='failed'
       ORDER BY run.updated_at DESC,run.id`,
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
      const draft = await client.query<{
        proposal: {
          projects?: {
            clientRef: string;
            description: string;
            name: string;
            priorityLevel: number;
          }[];
          tasks?: (Omit<TaskInput, "checklist"> & {
            assigneeName?: string | null;
            blockers?: {
              id: string;
              type: "existing_project" | "existing_task" | "proposed_project" | "proposed_task";
            }[];
            checklist?: (
              | string
              | {
                  completed: boolean;
                  description: string | null;
                  label: string;
                  predictedHours: number | null;
                }
            )[];
            clientRef?: string | null;
            confidence?: number;
            ownerTask?: boolean;
            proposedProjectRef?: string | null;
            sourceSpan?: string | null;
          })[];
        };
      }>(
        `SELECT draft.proposal FROM opsweave.intake_drafts draft
         JOIN opsweave.intake_runs run ON run.id=draft.run_id
         JOIN opsweave.intake_sources source ON source.id=run.source_id
         WHERE draft.id=$1 AND source.workspace_id=$2 AND draft.status='review_required' FOR UPDATE`,
        [draftId, workspaceId],
      );
      const proposal = draft.rows[0]?.proposal;
      if (proposal === undefined) throw new StoreConflictError("Intake draft is unavailable.");
      const proposedProjects = new Map<string, string>();
      const approvedProjects: { created: boolean; id: string; name: string }[] = [];
      for (const project of proposal.projects ?? []) {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM opsweave.projects
           WHERE workspace_id=$1 AND archived_at IS NULL AND lower(name)=lower($2)
           ORDER BY created_at,id LIMIT 1`,
          [workspaceId, project.name],
        );
        let projectId = existing.rows[0]?.id;
        let wasCreated = false;
        if (projectId === undefined) {
          const createdProject = await client.query<{ id: string }>(
            `INSERT INTO opsweave.projects
              (workspace_id,name,description,priority_level,stage_id)
             VALUES ($1,$2,$3,$4,(SELECT id FROM opsweave.project_stages
               WHERE workspace_id=$1 AND archived_at IS NULL ORDER BY sequence,id LIMIT 1))
             RETURNING id`,
            [workspaceId, project.name, project.description, project.priorityLevel],
          );
          projectId = createdProject.rows[0]?.id;
          if (projectId === undefined) throw new Error("Intake project creation failed.");
          wasCreated = true;
          await audit(client, {
            action: "project.created_from_intake",
            actorOwnerId: ownerId,
            metadata: { clientRef: project.clientRef, priorityLevel: project.priorityLevel },
            targetId: projectId,
            targetType: "project",
            workspaceId,
          });
        }
        proposedProjects.set(project.clientRef, projectId);
        approvedProjects.push({ created: wasCreated, id: projectId, name: project.name });
      }
      const proposedTasks = new Map<string, string>();
      const approvedTasks: { id: string; projectId: string | null; title: string }[] = [];
      const createdTaskRows: {
        blockers: NonNullable<NonNullable<typeof proposal.tasks>[number]["blockers"]>;
        id: string;
      }[] = [];
      for (const [taskIndex, task] of (proposal.tasks ?? []).entries()) {
        if (task.ownerTask === false) continue;
        let projectId =
          task.projectId ??
          (task.proposedProjectRef === undefined || task.proposedProjectRef === null
            ? null
            : (proposedProjects.get(task.proposedProjectRef) ?? null));
        if (projectId !== null) {
          const project = await client.query(
            "SELECT 1 FROM opsweave.projects WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL",
            [projectId, workspaceId],
          );
          if (project.rowCount !== 1) projectId = null;
        }
        const created = await client.query<{ id: string }>(
          `INSERT INTO opsweave.tasks
            (workspace_id,project_id,title,workflow_lane,allocated_hours,hours_spent,size,value_add,
             work_description,definition_of_done,start_date,start_time,due_date,end_time,business_value_score,
             business_value_rationale,client_name,priority_level,status,origin,notes,value_source,value_updated_at,
             manual_lane_position,planning_eligible,schedule_locked,planning_rationale,requires_breakdown)
           VALUES ($1,$2,$3,$4::varchar,$5,0,CASE WHEN $5::numeric IS NULL THEN NULL WHEN $5<=0.5 THEN 'small' WHEN $5<=1 THEN 'medium' WHEN $5<=2 THEN 'large' ELSE 'mega' END,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,'ai_proposed',
             CASE WHEN $13::integer IS NULL THEN NULL ELSE now() END,
             (SELECT coalesce(max(manual_lane_position),0)+1 FROM opsweave.tasks
              WHERE workspace_id=$1 AND workflow_lane=$4::varchar),$20,$21,$22,
              (coalesce($5::numeric,0)>2 AND $23::integer=0))
           RETURNING id`,
          [
            workspaceId,
            projectId,
            task.title,
            task.workflowLane ?? "inbox",
            task.allocatedHours ?? null,
            task.valueAdd ?? null,
            task.workDescription ?? null,
            task.definitionOfDone ?? null,
            task.startDate ?? null,
            task.startTime ?? null,
            task.dueDate ?? null,
            task.endTime ?? null,
            task.businessValueScore ?? null,
            task.businessValueRationale ?? null,
            task.clientName ?? null,
            task.priorityLevel ?? null,
            task.status ?? "not_started",
            task.origin ?? null,
            JSON.stringify(task.notes ?? EMPTY_RICH_TEXT_DOCUMENT),
            task.planningEligible ?? true,
            task.scheduleLocked ?? false,
            task.planningRationale ?? "Pending initial planning run.",
            task.checklist?.length ?? 0,
          ],
        );
        const taskId = created.rows[0]?.id;
        if (taskId === undefined) throw new Error("Intake task creation failed.");
        proposedTasks.set(task.clientRef ?? `task-${String(taskIndex + 1)}`, taskId);
        approvedTasks.push({ id: taskId, projectId, title: task.title });
        createdTaskRows.push({ blockers: task.blockers ?? [], id: taskId });
        for (const [position, item] of (task.checklist ?? []).entries())
          await client.query(
            `INSERT INTO opsweave.task_checklist_items
              (task_id,label,description,predicted_hours,completed,position)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              taskId,
              typeof item === "string" ? item : item.label,
              typeof item === "string" ? null : (item.description ?? null),
              typeof item === "string" ? null : (item.predictedHours ?? null),
              typeof item === "string" ? false : item.completed,
              position,
            ],
          );
        await client.query(
          `INSERT INTO opsweave.task_intake_origins
            (task_id,draft_id,confidence,source_span) VALUES ($1,$2,$3,$4)`,
          [taskId, draftId, task.confidence ?? 0, task.sourceSpan ?? null],
        );
        await audit(client, {
          action: "task.created_from_intake",
          actorOwnerId: ownerId,
          metadata: {
            confidence: task.confidence ?? 0,
            draftId,
            sourceSpanPresent: task.sourceSpan !== null && task.sourceSpan !== undefined,
          },
          targetId: taskId,
          targetType: "task",
          workspaceId,
        });
      }
      const existingEdges = await client.query<EntityDependencyRecord>(
        `SELECT dependent_type AS "dependentType",dependent_id AS "dependentId",
          blocker_type AS "blockerType",blocker_id AS "blockerId"
         FROM opsweave.entity_dependencies WHERE workspace_id=$1 FOR UPDATE`,
        [workspaceId],
      );
      const blockersByEntity = new Map<string, string[]>();
      for (const edge of existingEdges.rows) {
        const key = `${edge.dependentType}:${edge.dependentId}`;
        blockersByEntity.set(key, [
          ...(blockersByEntity.get(key) ?? []),
          `${edge.blockerType}:${edge.blockerId}`,
        ]);
      }
      for (const task of createdTaskRows) {
        for (const blocker of task.blockers) {
          const blockerType: WorkEntityType = blocker.type.endsWith("project") ? "project" : "task";
          const blockerId =
            blocker.type === "proposed_project"
              ? proposedProjects.get(blocker.id)
              : blocker.type === "proposed_task"
                ? proposedTasks.get(blocker.id)
                : blocker.id;
          if (blockerId === undefined || (blockerType === "task" && blockerId === task.id))
            throw new StoreConflictError("A proposed blocker is unavailable or self-referential.");
          const dependentKey = `task:${task.id}`;
          const blockerKey = `${blockerType}:${blockerId}`;
          const reaches = (key: string, visited = new Set<string>()): boolean => {
            if (key === dependentKey) return true;
            if (visited.has(key)) return false;
            visited.add(key);
            return (blockersByEntity.get(key) ?? []).some((next) => reaches(next, visited));
          };
          if (reaches(blockerKey))
            throw new StoreConflictError("The proposed blockers contain a dependency cycle.");
          await this.lockWorkEntity(client, workspaceId, blockerType, blockerId);
          await client.query(
            `INSERT INTO opsweave.entity_dependencies
              (workspace_id,dependent_type,dependent_id,blocker_type,blocker_id)
             VALUES ($1,'task',$2,$3,$4) ON CONFLICT DO NOTHING`,
            [workspaceId, task.id, blockerType, blockerId],
          );
          blockersByEntity.set(dependentKey, [
            ...(blockersByEntity.get(dependentKey) ?? []),
            blockerKey,
          ]);
        }
      }
      await client.query(
        `UPDATE opsweave.intake_drafts SET status='approved',approval_result=$2::jsonb,
          updated_at=now() WHERE id=$1`,
        [draftId, JSON.stringify({ projects: approvedProjects, tasks: approvedTasks })],
      );
      await audit(client, {
        action: "intake.draft.approved",
        actorOwnerId: ownerId,
        metadata: {
          taskCount: (proposal.tasks ?? []).filter((task) => task.ownerTask !== false).length,
          thirdPartyTaskCount: (proposal.tasks ?? []).filter((task) => task.ownerTask === false)
            .length,
        },
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
        `UPDATE opsweave.intake_drafts draft SET status='trashed',updated_at=now()
         FROM opsweave.intake_runs run JOIN opsweave.intake_sources source ON source.id=run.source_id
         WHERE draft.id=$1 AND draft.run_id=run.id AND source.workspace_id=$2 AND draft.status='review_required'`,
        [draftId, workspaceId],
      );
      if (result.rowCount !== 1) throw new StoreConflictError("Intake draft is unavailable.");
      await client.query(
        `INSERT INTO opsweave.trash_records (workspace_id,entity_type,entity_id,purge_after)
         VALUES ($1,'intake_draft',$2,now()+interval '30 days')
         ON CONFLICT (workspace_id,entity_type,entity_id)
         DO UPDATE SET deleted_at=now(),purge_after=excluded.purge_after`,
        [workspaceId, draftId],
      );
      await audit(client, {
        action: "intake.draft.declined",
        actorOwnerId: ownerId,
        metadata: { retentionDays: 30 },
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
      await client.query(
        `UPDATE opsweave.intake_sources source SET status='queued',updated_at=now()
         FROM opsweave.intake_runs run WHERE run.id=$1 AND source.id=run.source_id`,
        [runId],
      );
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

  public async retryFallbackIntakeDraft(
    workspaceId: string,
    ownerId: string,
    draftId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const draft = await client.query<{ runId: string; sourceId: string }>(
        `SELECT run.id AS "runId",source.id AS "sourceId"
         FROM opsweave.intake_drafts draft
         JOIN opsweave.intake_runs run ON run.id=draft.run_id
         JOIN opsweave.intake_sources source ON source.id=run.source_id
         WHERE draft.id=$1 AND source.workspace_id=$2 AND draft.status='review_required'
           AND draft.proposal @> '{"tasks":[{"clientRef":"fallback-review-1"}]}'::jsonb
         FOR UPDATE OF draft,run,source`,
        [draftId, workspaceId],
      );
      const record = draft.rows[0];
      if (record === undefined)
        throw new StoreConflictError("Only an unavailable-extraction draft can be retried.");
      await client.query("DELETE FROM opsweave.intake_drafts WHERE id=$1", [draftId]);
      await client.query(
        `UPDATE opsweave.intake_runs SET status='queued',safe_error=NULL,updated_at=now()
         WHERE id=$1`,
        [record.runId],
      );
      await client.query(
        "UPDATE opsweave.intake_sources SET status='queued',updated_at=now() WHERE id=$1",
        [record.sourceId],
      );
      await audit(client, {
        action: "intake.fallback_retry_queued",
        actorOwnerId: ownerId,
        metadata: { removedFallbackDraftId: draftId },
        targetId: record.runId,
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
         WHERE draft.id=$1 AND draft.run_id=run.id AND source.workspace_id=$2 AND draft.status='declined'`,
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
         WHERE draft.id=$1 AND draft.run_id=run.id AND source.workspace_id=$2 AND draft.status='trashed'
           AND EXISTS (SELECT 1 FROM opsweave.trash_records trash
             WHERE trash.workspace_id=$2 AND trash.entity_type='intake_draft'
               AND trash.entity_id=draft.id AND trash.purge_after>now())`,
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

  public async purgeExpiredIntakeDrafts(now = new Date()): Promise<number> {
    return transaction(this.pool, async (client) => {
      const expired = await client.query<{ draftId: string; workspaceId: string }>(
        `SELECT trash.entity_id AS "draftId",trash.workspace_id AS "workspaceId"
         FROM opsweave.trash_records trash
         WHERE trash.entity_type='intake_draft' AND trash.purge_after<=$1
         ORDER BY trash.purge_after,trash.entity_id FOR UPDATE`,
        [now],
      );
      if (expired.rows.length === 0) return 0;
      const draftIds = expired.rows.map((row) => row.draftId);
      await client.query(
        `DELETE FROM opsweave.intake_sources source USING opsweave.intake_runs run,opsweave.intake_drafts draft
         WHERE draft.id=ANY($1::uuid[]) AND draft.run_id=run.id AND run.source_id=source.id`,
        [draftIds],
      );
      await client.query(
        `DELETE FROM opsweave.trash_records
         WHERE entity_type='intake_draft' AND entity_id=ANY($1::uuid[]) AND purge_after<=$2`,
        [draftIds, now],
      );
      const counts = new Map<string, number>();
      for (const row of expired.rows)
        counts.set(row.workspaceId, (counts.get(row.workspaceId) ?? 0) + 1);
      for (const [workspaceId, count] of counts)
        await audit(client, {
          action: "intake.trash.purged",
          metadata: { count },
          targetType: "intake_trash",
          workspaceId,
        });
      return expired.rows.length;
    });
  }

  public async listAuditMetadata(workspaceId: string): Promise<unknown[]> {
    const result = await this.pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM opsweave.audit_events WHERE workspace_id=$1 ORDER BY created_at",
      [workspaceId],
    );
    return result.rows.map((row) => row.metadata);
  }

  public async recordPlanningPreview(
    workspaceId: string,
    settingsVersion: number,
    settingsSnapshot: unknown,
    status: PlanningRunRecord["status"],
  ): Promise<PlanningRunRecord> {
    const result = await this.pool.query<PlanningRunRecord>(
      `INSERT INTO opsweave.planning_runs (workspace_id,kind,status,settings_version,settings_snapshot)
       VALUES ($1,'preview',$2,$3,$4::jsonb) RETURNING id,status`,
      [workspaceId, status, settingsVersion, JSON.stringify(settingsSnapshot)],
    );
    const record = result.rows[0];
    if (record === undefined) throw new Error("Planning preview record creation failed.");
    return record;
  }

  public async applyAutomationRun(input: AutomationRunInput): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const run = await client.query<{ id: string }>(
        `INSERT INTO opsweave.planning_runs
          (workspace_id,kind,status,settings_version,settings_snapshot,scheduled_for)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::date)
         ON CONFLICT (workspace_id,kind,scheduled_for) DO NOTHING
         RETURNING id`,
        [
          input.workspaceId,
          input.kind,
          input.selectedIds.length === 0 && input.kind !== "daily_rollover"
            ? "no_capacity"
            : "completed",
          input.settingsVersion,
          JSON.stringify({
            configuration: input.settingsSnapshot,
            decisions: input.assessments ?? [],
            selectedIds: input.selectedIds,
          }),
          input.kind === "daily" || input.kind === "weekly" ? null : input.localDate,
        ],
      );
      const runId = run.rows[0]?.id;
      if (runId === undefined) return false;

      const assessmentById = new Map(
        (input.assessments ?? []).map((assessment) => [assessment.taskId, assessment]),
      );
      const rankedAssessments = [...(input.assessments ?? [])].sort(
        (left, right) =>
          right.planningScore - left.planningScore || left.taskId.localeCompare(right.taskId),
      );
      for (const [rank, assessment] of rankedAssessments.entries()) {
        const decisionRationale = `${assessment.planningRationale} Decision: ${assessment.selected ? "Selected" : "Deferred"} (${assessment.reason}).`;
        await client.query(
          `UPDATE opsweave.tasks SET planning_score=$3,planning_rationale=$4,
             manual_lane_position=CASE WHEN workflow_lane='inbox' THEN $5 ELSE manual_lane_position END,
             last_planned_by='automation',last_planned_at=now(),version=version+1,updated_at=now()
           WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL AND NOT schedule_locked`,
          [
            assessment.taskId,
            input.workspaceId,
            assessment.planningScore,
            decisionRationale,
            rank + 1,
          ],
        );
      }

      if (input.resetFromLanes.length > 0) {
        const reset = await client.query<{ fromLane: TaskLane; id: string }>(
          `UPDATE opsweave.tasks SET workflow_lane=$3,
             planned_date=CASE WHEN last_planned_by='automation' THEN NULL ELSE planned_date END,
             planned_start_time=CASE WHEN last_planned_by='automation' THEN NULL ELSE planned_start_time END,
             planned_end_time=CASE WHEN last_planned_by='automation' THEN NULL ELSE planned_end_time END,
             version=version+1,updated_at=now()
           WHERE workspace_id=$1 AND workflow_lane=ANY($2::varchar[]) AND deleted_at IS NULL
             AND NOT schedule_locked
           RETURNING id,workflow_lane AS "fromLane"`,
          [input.workspaceId, input.resetFromLanes, input.resetToLane],
        );
        for (const task of reset.rows)
          await audit(client, {
            action: "task.moved_by_automation",
            actorOwnerId: input.ownerId,
            metadata: { automation: input.kind, to: input.resetToLane },
            targetId: task.id,
            targetType: "task",
            workspaceId: input.workspaceId,
          });
      }

      const selected =
        input.selectedIds.length === 0
          ? { rows: [] as { hoursLeft: number; id: string }[] }
          : await client.query<{ hoursLeft: number; id: string }>(
              `SELECT id,greatest(coalesce(allocated_hours,0)-coalesce(hours_spent,0),0)::float8 AS "hoursLeft"
               FROM opsweave.tasks WHERE workspace_id=$1 AND id=ANY($2::uuid[])
                 AND deleted_at IS NULL AND workflow_lane NOT IN ('done','cancelled')
                 AND NOT schedule_locked
               FOR UPDATE`,
              [input.workspaceId, input.selectedIds],
            );
      const byId = new Map(selected.rows.map((task) => [task.id, task]));
      let cursor =
        input.scheduleFromDate === undefined
          ? null
          : Date.parse(`${input.scheduleFromDate}T00:00:00.000Z`);
      const workingDays =
        cursor === null
          ? []
          : (
              await client.query<WorkingDayInput>(
                `SELECT weekday,enabled,available_hours::float8 AS "availableHours",
                  to_char(start_time,'HH24:MI') AS "startTime",to_char(end_time,'HH24:MI') AS "endTime"
                 FROM opsweave.workspace_working_hours WHERE workspace_id=$1`,
                [input.workspaceId],
              )
            ).rows;
      const busyIntervals =
        cursor === null
          ? []
          : (
              await client.query<{
                plannedDate: string;
                plannedEndTime: string;
                plannedStartTime: string;
              }>(
                `SELECT planned_date::text AS "plannedDate",
                  to_char(planned_start_time,'HH24:MI') AS "plannedStartTime",
                  to_char(planned_end_time,'HH24:MI') AS "plannedEndTime"
                 FROM opsweave.tasks
                 WHERE workspace_id=$1 AND deleted_at IS NULL AND schedule_locked
                   AND workflow_lane NOT IN ('done','cancelled') AND planned_date IS NOT NULL
                   AND planned_start_time IS NOT NULL AND planned_end_time IS NOT NULL
                   AND planned_date >= $2::date`,
                [input.workspaceId, input.scheduleFromDate],
              )
            ).rows.map((task) => {
              const gapMilliseconds = (input.gapMinutes ?? 0) * 60_000;
              return {
                end:
                  Date.parse(`${task.plannedDate}T${task.plannedEndTime}:00.000Z`) +
                  gapMilliseconds,
                start:
                  Date.parse(`${task.plannedDate}T${task.plannedStartTime}:00.000Z`) -
                  gapMilliseconds,
              };
            });
      let position = 1;
      for (const id of input.selectedIds) {
        const task = byId.get(id);
        if (task === undefined) continue;
        const schedule =
          cursor === null
            ? null
            : scheduleWithinWorkingTime(cursor, task.hoursLeft, workingDays, busyIntervals);
        const start = schedule === null ? null : timestampParts(schedule.start);
        const end = schedule === null ? null : timestampParts(schedule.end);
        if (schedule !== null) cursor = schedule.end + (input.gapMinutes ?? 0) * 60_000;
        const assessment = assessmentById.get(id);
        const planningRationale = `${assessment?.planningRationale ?? "Selected by the planning automation."} Assigned to ${start?.date ?? input.localDate}${start?.time === undefined ? "" : ` from ${start.time} to ${end?.time ?? "the calculated end"}`}.`;
        await client.query(
          `UPDATE opsweave.tasks SET workflow_lane=$3,manual_lane_position=$4,
            planned_date=$5::date,planned_start_time=$6::time,planned_end_time=$7::time,
            planning_score=coalesce($8::integer,planning_score),planning_rationale=$9,
            last_planned_by='automation',last_planned_at=now(),
            version=version+1,updated_at=now()
           WHERE id=$1 AND workspace_id=$2 AND NOT schedule_locked`,
          [
            id,
            input.workspaceId,
            input.destinationLane,
            position,
            start?.date ?? null,
            start?.time ?? null,
            end?.time ?? null,
            assessment?.planningScore ?? null,
            planningRationale,
          ],
        );
        position += 1;
        await audit(client, {
          action: "task.selected_by_automation",
          actorOwnerId: input.ownerId,
          metadata: { automation: input.kind, end, runId, start, to: input.destinationLane },
          targetId: id,
          targetType: "task",
          workspaceId: input.workspaceId,
        });
      }
      await audit(client, {
        action: "planning.automation.completed",
        actorOwnerId: input.ownerId,
        metadata: {
          assessments: input.assessments ?? [],
          kind: input.kind,
          localDate: input.localDate,
          selectedIds: input.selectedIds,
        },
        targetId: runId,
        targetType: "planning_run",
        workspaceId: input.workspaceId,
      });
      return true;
    });
  }
}
