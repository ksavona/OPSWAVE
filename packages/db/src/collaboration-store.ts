import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { StoreConflictError, type AccountStatus, type WorkspaceRole } from "./store.ts";

export type AccessSubjectType = "project" | "task";
export type AccessRole = "contributor" | "project_collaborator" | "reviewer";
export type AccessGrantStatus = "active" | "declined" | "expired" | "invite_pending" | "revoked";

export interface AccessGrantRecord {
  readonly accessRole: AccessRole;
  readonly activatedAt: Date | null;
  readonly alias: string | null;
  readonly createdAt: Date;
  readonly delegateEmail: string;
  readonly delegateFullName: string | null;
  readonly delegateUserId: string | null;
  readonly delegationNote: string | null;
  readonly privacyKeywords: readonly string[];
  readonly profileDescription: string | null;
  readonly expiresAt: Date | null;
  readonly id: string;
  readonly invitedAt: Date;
  readonly projectName: string | null;
  readonly scope: AccessSubjectType;
  readonly status: AccessGrantStatus;
  readonly subjectId: string;
  readonly subjectTitle: string;
  readonly subjectType: AccessSubjectType;
  readonly taskTitle: string | null;
  readonly version: number;
  readonly workspaceId: string;
}

export interface DelegationBadgeRecord {
  readonly delegates: readonly {
    readonly alias: string | null;
    readonly displayName: string;
    readonly profileDescription: string | null;
    readonly status: "active" | "invite_pending";
  }[];
  readonly subjectId: string;
  readonly subjectType: AccessSubjectType;
}

export interface EmailDeliveryConfigurationRecord {
  readonly configured: boolean;
  readonly endpoint: string | null;
  readonly tokenConfigured: boolean;
  readonly updatedAt: Date | null;
}

export interface InvitationRecord {
  readonly accessGrantId: string;
  readonly accessRole: AccessRole;
  readonly delegateEmail: string;
  readonly delegateUserId: string | null;
  readonly expiresAt: Date | null;
  readonly grantStatus: AccessGrantStatus;
  readonly invitationExpiresAt: Date;
  readonly projectName: string | null;
  readonly subjectId: string;
  readonly subjectTitle: string;
  readonly subjectType: AccessSubjectType;
  readonly tokenId: string;
  readonly workspaceDisplayName: string;
  readonly workspaceId: string;
}

export interface CollaborationUserRecord {
  readonly activeGrantCount: number;
  readonly createdAt: Date;
  readonly email: string | null;
  readonly fullName: string | null;
  readonly membershipId: string;
  readonly membershipStatus: AccountStatus;
  readonly role: WorkspaceRole;
  readonly userId: string;
  readonly userStatus: AccountStatus;
  readonly username: string | null;
}

export interface DelegateStageRecord {
  readonly archivedAt: Date | null;
  readonly color: string;
  readonly id: string;
  readonly name: string;
  readonly semanticKind:
    "assigned" | "complete" | "custom" | "in_progress" | "ready_for_review" | "waiting_for_input";
  readonly sequence: number;
  readonly version: number;
}

export interface DelegateTaskRecord {
  readonly accessRole: AccessRole;
  readonly alias: string | null;
  readonly allocatedHours: number | null;
  readonly definitionOfDone: string | null;
  readonly delegationNote: string | null;
  readonly dueDate: string | null;
  readonly hoursSpent: number;
  readonly id: string;
  readonly latestUpdate: string | null;
  readonly notes: unknown;
  readonly projectLabel: string | null;
  readonly stageId: string;
  readonly stateVersion: number;
  readonly title: string;
  readonly workDescription: string | null;
}

export interface DelegateSubtaskRecord {
  readonly canEdit: boolean;
  readonly completed: boolean;
  readonly description: string | null;
  readonly id: string;
  readonly label: string;
  readonly position: number;
  readonly predictedHours: number | null;
  readonly version: number;
}

export interface DelegateProjectRecord {
  readonly accessRole: AccessRole;
  readonly alias: string | null;
  readonly delegationNote: string | null;
  readonly description: string | null;
  readonly id: string;
  readonly name: string;
  readonly notes: unknown;
}

export interface DelegateWorkspaceRecord {
  readonly projects: readonly DelegateProjectRecord[];
  readonly stages: readonly DelegateStageRecord[];
  readonly tasks: readonly DelegateTaskRecord[];
}

export interface NotificationRecord {
  readonly body: string | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly routeId: string | null;
  readonly routeType: string | null;
  readonly state: "cancelled" | "dismissed" | "read" | "unread";
  readonly title: string;
  readonly type: string;
}

export interface AccessDecisionRecord {
  readonly accessRole: AccessRole;
  readonly alias: string | null;
  readonly anonymised: boolean;
  readonly grantId: string;
  readonly inherited: boolean;
}

export interface CollaborationFlagsRecord {
  readonly complianceMonitorEnabled: boolean;
  readonly delegateUploadsEnabled: boolean;
  readonly invitationEmailEnabled: boolean;
  readonly multiUserEnabled: boolean;
}

export interface TaskDelegateSharingRecord {
  readonly selectedUserIds: readonly string[];
  readonly visibility: "internal" | "project_delegates" | "selected_delegates";
}

export interface DelegatePresentationRecord {
  readonly neutralClientLabel: string | null;
  readonly neutralProjectLabel: string | null;
  readonly safeDefinitionOfDone: string | null;
  readonly safeDescription: string | null;
  readonly safeNotes: unknown;
  readonly safeTitle: string;
  readonly safeWorkDescription: string | null;
  readonly sourceVersion: number;
  readonly status: "approved" | "blocked" | "draft" | "stale";
  readonly subjectId: string;
  readonly subjectType: AccessSubjectType;
  readonly version: number;
}

export interface ActivityRecord {
  readonly action: string;
  readonly actorDisplay: string | null;
  readonly body: string | null;
  readonly category: string;
  readonly contentStatus: "approved" | "quarantined" | "rejected" | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly kind: "log_note" | "message" | null;
  readonly metadata: unknown;
  readonly userGenerated: boolean;
}

export interface SubjectParticipantRecord {
  readonly alias: string | null;
  readonly displayName: string;
  readonly profileDescription: string | null;
  readonly userId: string;
}

export interface CollaborationTimeEntryRecord {
  readonly actorDisplay: string;
  readonly createdAt: Date;
  readonly description: string;
  readonly entryDate: string;
  readonly hours: number;
  readonly id: string;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly userId: string;
  readonly version: number;
}

export interface DelegationProgressRecord {
  readonly accessRole: AccessRole;
  readonly accessStatus: AccessGrantStatus;
  readonly alias: string | null;
  readonly delegateDisplay: string;
  readonly delegateUserId: string | null;
  readonly expiresAt: Date | null;
  readonly grantId: string;
  readonly lastActivityAt: Date | null;
  readonly latestUpdate: string | null;
  readonly riskFlagCount: number;
  readonly stageName: string | null;
  readonly totalTimeLogged: number;
}

export interface CollaborationAttachmentRecord {
  readonly approvalStatus: "approved" | "draft" | "rejected";
  readonly byteSize: number;
  readonly contentType: string;
  readonly createdAt: Date;
  readonly delegateSafeName: string | null;
  readonly displayName: string;
  readonly entityId: string;
  readonly entityType: AccessSubjectType;
  readonly id: string;
  readonly originalAttachmentId: string | null;
  readonly purgeAfter: Date | null;
  readonly scanStatus: "clean" | "pending" | "rejected" | "unavailable";
  readonly selectedUserIds: readonly string[];
  readonly storageKey: string;
  readonly uploadedByUserId: string;
  readonly visibility:
    | "internal_only"
    | "redacted_delegate_copy"
    | "shared_all_delegates"
    | "shared_selected_delegates";
}

export interface ComplianceJobRecord {
  readonly actorAlias: string | null;
  readonly actorUserId: string;
  readonly auditEventId: string;
  readonly content: string;
  readonly contentKind: "document_metadata" | "log_note" | "message";
  readonly id: string;
  readonly neutralSubjectLabel: string;
  readonly subjectId: string;
  readonly subjectType: AccessSubjectType;
  readonly workspaceId: string;
}

export interface ComplianceFlagRecord {
  readonly categories: readonly string[];
  readonly createdAt: Date;
  readonly delegateAlias: string | null;
  readonly id: string;
  readonly reason: string;
  readonly riskLevel: "high" | "low" | "medium";
  readonly status: "dismissed" | "open" | "restricted" | "revoked" | "warned";
  readonly subjectId: string | null;
  readonly subjectTitle: string;
  readonly subjectType: AccessSubjectType | null;
}

export interface EmailOutboxRecord {
  readonly encryptedPayload: string;
  readonly id: string;
  readonly recipientEmail: string;
  readonly templateKey: string;
  readonly workspaceId: string;
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

const insertAudit = async (
  client: PoolClient,
  input: {
    action: string;
    actorUserId: string | null;
    category: string;
    metadata?: unknown;
    occurredForUserId?: string | null;
    subjectId: string;
    subjectType: AccessSubjectType | "workspace";
    userGenerated?: boolean;
    visibility?: "actor_and_owner" | "authorised_participants" | "owner_admin";
    workspaceId: string;
  },
): Promise<string> => {
  const result = await client.query<{ id: string }>(
    `INSERT INTO opsweave.audit_events
      (workspace_id,actor_user_id,actor_owner_id,action,category,target_type,target_id,
       subject_project_id,subject_task_id,occurred_for_user_id,correlation_id,metadata,
       user_generated,visibility)
     VALUES ($1,$2,(SELECT id FROM opsweave.owners WHERE user_id=$2 AND workspace_id=$1),
       $3,$4,$5::varchar(64),$6::varchar(100),
       CASE WHEN $5::text='project' THEN $6::uuid END,
       CASE WHEN $5::text='task' THEN $6::uuid END,$7,$8,$9::jsonb,$10,$11)
     RETURNING id`,
    [
      input.workspaceId,
      input.actorUserId,
      input.action,
      input.category,
      input.subjectType,
      input.subjectId,
      input.occurredForUserId ?? null,
      randomUUID(),
      JSON.stringify(input.metadata ?? {}),
      input.userGenerated ?? false,
      input.visibility ?? "owner_admin",
    ],
  );
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error("Audit event creation failed.");
  return id;
};

const seedDelegateStages = async (client: PoolClient, membershipId: string): Promise<void> => {
  const exists = await client.query(
    "SELECT 1 FROM opsweave.delegate_kanban_stages WHERE membership_id=$1 LIMIT 1",
    [membershipId],
  );
  if (exists.rowCount !== 0) return;
  const defaults = [
    ["Assigned", "assigned", "#7dd3fc"],
    ["In progress", "in_progress", "#5ee5b5"],
    ["Waiting for input", "waiting_for_input", "#facc15"],
    ["Ready for review", "ready_for_review", "#c084fc"],
    ["Complete", "complete", "#94a3b8"],
  ] as const;
  for (const [sequence, [name, semanticKind, color]] of defaults.entries()) {
    await client.query(
      `INSERT INTO opsweave.delegate_kanban_stages
        (membership_id,name,semantic_kind,color,sequence) VALUES ($1,$2,$3,$4,$5)`,
      [membershipId, name, semanticKind, color, sequence],
    );
  }
};

const recalculateTaskHours = async (client: PoolClient, taskId: string): Promise<void> => {
  await client.query(
    `UPDATE opsweave.tasks task SET hours_spent=totals.spent,
       size=CASE WHEN task.size_manual_override THEN task.size
         WHEN greatest(coalesce(task.allocated_hours,0)-totals.spent,0)<=0.5 THEN 'small'
         WHEN greatest(coalesce(task.allocated_hours,0)-totals.spent,0)<=1 THEN 'medium'
         WHEN greatest(coalesce(task.allocated_hours,0)-totals.spent,0)<=2 THEN 'large'
         ELSE 'mega' END,
       requires_breakdown=CASE WHEN task.size_manual_override THEN task.size='mega'
         AND NOT EXISTS (SELECT 1 FROM opsweave.task_checklist_items WHERE task_id=$1)
         ELSE greatest(coalesce(task.allocated_hours,0)-totals.spent,0)>2
           AND NOT EXISTS (SELECT 1 FROM opsweave.task_checklist_items WHERE task_id=$1) END,
       version=task.version+1,updated_at=now()
     FROM (SELECT coalesce(sum(hours),0) AS spent FROM opsweave.task_time_entries
       WHERE task_id=$1) totals WHERE task.id=$1`,
    [taskId],
  );
};

const mapGrant = (row: Record<string, unknown>): AccessGrantRecord => ({
  accessRole: row.accessRole as AccessRole,
  activatedAt: (row.activatedAt as Date | null) ?? null,
  alias: (row.alias as string | null) ?? null,
  createdAt: row.createdAt as Date,
  delegateEmail: row.delegateEmail as string,
  delegateFullName: (row.delegateFullName as string | null) ?? null,
  delegateUserId: (row.delegateUserId as string | null) ?? null,
  delegationNote: (row.delegationNote as string | null) ?? null,
  privacyKeywords: (row.privacyKeywords as string[] | null) ?? [],
  profileDescription: (row.profileDescription as string | null) ?? null,
  expiresAt: (row.expiresAt as Date | null) ?? null,
  id: row.id as string,
  invitedAt: row.invitedAt as Date,
  projectName: (row.projectName as string | null) ?? null,
  scope: row.scope as AccessSubjectType,
  status: row.status as AccessGrantStatus,
  subjectId: row.subjectId as string,
  subjectTitle: row.subjectTitle as string,
  subjectType: row.subjectType as AccessSubjectType,
  taskTitle: (row.taskTitle as string | null) ?? null,
  version: row.version as number,
  workspaceId: row.workspaceId as string,
});

const grantSelect = `SELECT access.id,access.workspace_id AS "workspaceId",
  access.subject_type AS "subjectType",coalesce(access.subject_project_id,access.subject_task_id) AS "subjectId",
  access.scope,access.access_role AS "accessRole",access.status,access.delegate_user_id AS "delegateUserId",
  access.delegate_email AS "delegateEmail",access.delegation_note AS "delegationNote",
  access.profile_description AS "profileDescription",access.privacy_keywords AS "privacyKeywords",
  access.invited_at AS "invitedAt",access.activated_at AS "activatedAt",access.expires_at AS "expiresAt",
  access.created_at AS "createdAt",access.version,"user".full_name AS "delegateFullName",
  project.name AS "projectName",task.title AS "taskTitle",
  coalesce(project.name,task.title) AS "subjectTitle",
  alias.alias
 FROM opsweave.access_grants access
 LEFT JOIN opsweave.users "user" ON "user".id=access.delegate_user_id
 LEFT JOIN opsweave.projects project ON project.id=access.subject_project_id
 LEFT JOIN opsweave.tasks task ON task.id=access.subject_task_id
 LEFT JOIN opsweave.delegation_aliases alias ON alias.user_id=access.delegate_user_id
   AND ((alias.context_type='project' AND alias.context_project_id=coalesce(project.id,task.project_id))
     OR (alias.context_type='task' AND alias.context_task_id=task.id))
   AND alias.retired_at IS NULL`;

export class CollaborationStore {
  public constructor(public readonly pool: Pool) {}

  public async isMultiUserEnabled(workspaceId: string): Promise<boolean> {
    const result = await this.pool.query<{ enabled: boolean }>(
      "SELECT multi_user_enabled AS enabled FROM opsweave.workspace_settings WHERE workspace_id=$1",
      [workspaceId],
    );
    return result.rows[0]?.enabled ?? false;
  }

  public async getCollaborationFlags(workspaceId: string): Promise<CollaborationFlagsRecord> {
    const result = await this.pool.query<CollaborationFlagsRecord>(
      `SELECT multi_user_enabled AS "multiUserEnabled",
        invitation_email_enabled AS "invitationEmailEnabled",
        delegate_uploads_enabled AS "delegateUploadsEnabled",
        compliance_monitor_enabled AS "complianceMonitorEnabled"
       FROM opsweave.workspace_settings WHERE workspace_id=$1`,
      [workspaceId],
    );
    return (
      result.rows[0] ?? {
        complianceMonitorEnabled: false,
        delegateUploadsEnabled: false,
        invitationEmailEnabled: false,
        multiUserEnabled: false,
      }
    );
  }

  public async updateCollaborationFlags(
    workspaceId: string,
    actorUserId: string,
    flags: {
      complianceMonitorEnabled: boolean;
      delegateUploadsEnabled: boolean;
      invitationEmailEnabled: boolean;
      multiUserEnabled: boolean;
    },
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `UPDATE opsweave.workspace_settings SET multi_user_enabled=$2,
          invitation_email_enabled=$3,delegate_uploads_enabled=$4,
          compliance_monitor_enabled=$5,version=version+1,updated_at=now()
         WHERE workspace_id=$1`,
        [
          workspaceId,
          flags.multiUserEnabled,
          flags.invitationEmailEnabled,
          flags.delegateUploadsEnabled,
          flags.complianceMonitorEnabled,
        ],
      );
      await insertAudit(client, {
        action: "collaboration.settings.updated",
        actorUserId,
        category: "access",
        metadata: flags,
        subjectId: workspaceId,
        subjectType: "workspace",
        workspaceId,
      });
    });
  }

  public async listAccessGrants(
    workspaceId: string,
    subject?: { id: string; type: AccessSubjectType },
  ): Promise<AccessGrantRecord[]> {
    const parameters: unknown[] = [workspaceId];
    const subjectCondition =
      subject === undefined
        ? ""
        : subject.type === "project"
          ? " AND access.subject_project_id=$2"
          : ` AND (access.subject_task_id=$2 OR access.subject_project_id=(
              SELECT task.project_id FROM opsweave.tasks task WHERE task.id=$2))`;
    if (subject !== undefined) parameters.push(subject.id);
    const result = await this.pool.query<Record<string, unknown>>(
      `${grantSelect} WHERE access.workspace_id=$1${subjectCondition}
       ORDER BY access.created_at DESC,access.id DESC`,
      parameters,
    );
    return result.rows.map(mapGrant);
  }

  public async getTaskDelegateSharing(
    workspaceId: string,
    taskId: string,
  ): Promise<TaskDelegateSharingRecord> {
    const result = await this.pool.query<{
      selectedUserIds: string[];
      visibility: TaskDelegateSharingRecord["visibility"];
    }>(
      `SELECT task.delegate_visibility AS visibility,
        coalesce(array_agg(audience.user_id ORDER BY audience.user_id)
          FILTER (WHERE audience.user_id IS NOT NULL),'{}'::uuid[]) AS "selectedUserIds"
       FROM opsweave.tasks task
       LEFT JOIN opsweave.task_delegate_audience audience ON audience.task_id=task.id
       WHERE task.id=$2 AND task.workspace_id=$1 AND task.deleted_at IS NULL
       GROUP BY task.id,task.delegate_visibility`,
      [workspaceId, taskId],
    );
    const sharing = result.rows[0];
    if (sharing === undefined) throw new StoreConflictError("The task is unavailable.");
    return sharing;
  }

  public async updateTaskDelegateSharing(input: {
    actorUserId: string;
    selectedUserIds: readonly string[];
    taskId: string;
    visibility: TaskDelegateSharingRecord["visibility"];
    workspaceId: string;
  }): Promise<TaskDelegateSharingRecord> {
    return transaction(this.pool, async (client) => {
      const task = await client.query<{ projectId: string | null }>(
        `UPDATE opsweave.tasks SET delegate_visibility=$3,version=version+1,updated_at=now()
         WHERE id=$2 AND workspace_id=$1 AND deleted_at IS NULL
         RETURNING project_id AS "projectId"`,
        [input.workspaceId, input.taskId, input.visibility],
      );
      const projectId = task.rows[0]?.projectId;
      if (projectId === undefined) throw new StoreConflictError("The task is unavailable.");
      await client.query("DELETE FROM opsweave.task_delegate_audience WHERE task_id=$1", [
        input.taskId,
      ]);
      const uniqueUserIds = [...new Set(input.selectedUserIds)];
      if (input.visibility === "selected_delegates") {
        if (projectId === null || uniqueUserIds.length === 0) {
          throw new StoreConflictError("Select at least one active project delegate.");
        }
        const inserted = await client.query(
          `INSERT INTO opsweave.task_delegate_audience (task_id,user_id,created_by_user_id)
           SELECT $2,access.delegate_user_id,$5
           FROM opsweave.access_grants access
           WHERE access.workspace_id=$1 AND access.subject_project_id=$3
             AND access.delegate_user_id=ANY($4::uuid[]) AND access.status='active'
             AND (access.expires_at IS NULL OR access.expires_at>now())
           ON CONFLICT (task_id,user_id) DO NOTHING`,
          [input.workspaceId, input.taskId, projectId, uniqueUserIds, input.actorUserId],
        );
        if (inserted.rowCount !== uniqueUserIds.length) {
          throw new StoreConflictError("One or more selected project delegates are unavailable.");
        }
      }
      await insertAudit(client, {
        action: "task.delegate_sharing.updated",
        actorUserId: input.actorUserId,
        category: "delegation",
        metadata: {
          selectedDelegateCount:
            input.visibility === "selected_delegates" ? uniqueUserIds.length : 0,
          visibility: input.visibility,
        },
        subjectId: input.taskId,
        subjectType: "task",
        workspaceId: input.workspaceId,
      });
      return {
        selectedUserIds: input.visibility === "selected_delegates" ? uniqueUserIds : [],
        visibility: input.visibility,
      };
    });
  }

  public async listTaskDelegationProgress(
    workspaceId: string,
    taskId: string,
  ): Promise<DelegationProgressRecord[]> {
    const result = await this.pool.query<DelegationProgressRecord>(
      `SELECT access.id AS "grantId",access.delegate_user_id AS "delegateUserId",
        access.access_role AS "accessRole",access.status AS "accessStatus",access.expires_at AS "expiresAt",
        coalesce("user".full_name,access.delegate_email) AS "delegateDisplay",alias.alias,
        stage.name AS "stageName",state.latest_update AS "latestUpdate",
        greatest(coalesce(state.last_activity_at,access.activated_at),access.updated_at) AS "lastActivityAt",
        coalesce((SELECT sum(entry.hours)::float8 FROM opsweave.task_time_entries entry
          WHERE entry.task_id=$2 AND entry.user_id=access.delegate_user_id),0)::float8 AS "totalTimeLogged",
        (SELECT count(*)::int FROM opsweave.compliance_flags flag
          WHERE flag.workspace_id=$1 AND flag.subject_task_id=$2
            AND flag.delegate_user_id=access.delegate_user_id AND flag.status='open') AS "riskFlagCount"
       FROM opsweave.access_grants access
       LEFT JOIN opsweave.users "user" ON "user".id=access.delegate_user_id
       LEFT JOIN opsweave.tasks task ON task.id=$2 AND task.workspace_id=$1
       LEFT JOIN opsweave.delegate_task_states state ON state.task_id=$2
         AND state.user_id=access.delegate_user_id
       LEFT JOIN opsweave.delegate_kanban_stages stage ON stage.id=state.stage_id
       LEFT JOIN opsweave.delegation_aliases alias ON alias.user_id=access.delegate_user_id
         AND alias.retired_at IS NULL AND ((alias.context_type='project'
           AND alias.context_project_id=task.project_id) OR (alias.context_type='task'
           AND alias.context_task_id=task.id))
       WHERE access.workspace_id=$1 AND (access.subject_task_id=$2
         OR access.subject_project_id=task.project_id)
       ORDER BY access.created_at DESC,access.id DESC`,
      [workspaceId, taskId],
    );
    return result.rows;
  }

  public async setSubjectAnonymisation(input: {
    actorUserId: string;
    enabled: boolean;
    subjectId: string;
    subjectType: AccessSubjectType;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const current = await client.query<{
        enabled: boolean;
        sourceVersion: number;
      }>(
        input.subjectType === "project"
          ? `SELECT anonymise_delegation AS enabled,version AS "sourceVersion"
             FROM opsweave.projects
             WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL
             FOR UPDATE`
          : `SELECT anonymise_delegation AS enabled,version AS "sourceVersion"
             FROM opsweave.tasks
             WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL
             FOR UPDATE`,
        [input.subjectId, input.workspaceId],
      );
      const currentSubject = current.rows[0];
      if (!currentSubject) throw new StoreConflictError("The shared item is unavailable.");
      if (currentSubject.enabled === input.enabled) return;

      const updated = await client.query<{ sourceVersion: number }>(
        input.subjectType === "project"
          ? `UPDATE opsweave.projects SET anonymise_delegation=$3,version=version+1,updated_at=now()
             WHERE id=$1 AND workspace_id=$2 AND archived_at IS NULL RETURNING version AS "sourceVersion"`
          : `UPDATE opsweave.tasks SET anonymise_delegation=$3,version=version+1,updated_at=now()
             WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL RETURNING version AS "sourceVersion"`,
        [input.subjectId, input.workspaceId, input.enabled],
      );
      const sourceVersion = updated.rows[0]?.sourceVersion;
      if (sourceVersion === undefined)
        throw new StoreConflictError("The shared item is unavailable.");
      if (input.enabled) {
        await client.query(
          input.subjectType === "project"
            ? `INSERT INTO opsweave.delegate_entity_presentations
                (workspace_id,subject_project_id,source_version,safe_title,neutral_project_label,status)
               VALUES ($1,$2,$3,'Shared project','Project Atlas','draft')
               ON CONFLICT (subject_project_id) WHERE subject_project_id IS NOT NULL DO UPDATE SET
                 source_version=EXCLUDED.source_version,status='stale',approved_by_user_id=NULL,
                 approved_at=NULL,version=opsweave.delegate_entity_presentations.version+1,updated_at=now()`
            : `INSERT INTO opsweave.delegate_entity_presentations
                (workspace_id,subject_task_id,source_version,safe_title,status)
               VALUES ($1,$2,$3,'Shared task','draft')
               ON CONFLICT (subject_task_id) WHERE subject_task_id IS NOT NULL DO UPDATE SET
                 source_version=EXCLUDED.source_version,status='stale',approved_by_user_id=NULL,
                 approved_at=NULL,version=opsweave.delegate_entity_presentations.version+1,updated_at=now()`,
          [input.workspaceId, input.subjectId, sourceVersion],
        );
        await client.query(
          input.subjectType === "project"
            ? `INSERT INTO opsweave.protected_terms
                (workspace_id,context_project_id,term_type,value,normalized_value,created_by_user_id)
               SELECT $1,$2,candidate.term_type,candidate.value,
                 lower(trim(candidate.value)),$3
               FROM opsweave.projects project
               LEFT JOIN opsweave.tasks task ON task.project_id=project.id AND task.deleted_at IS NULL
               CROSS JOIN LATERAL (VALUES
                 ('company'::varchar,project.name),('client'::varchar,project.client_name),
                 ('other'::varchar,task.title)) candidate(term_type,value)
               WHERE project.id=$2 AND project.workspace_id=$1
                 AND candidate.value IS NOT NULL AND length(trim(candidate.value))>=2
               ON CONFLICT DO NOTHING`
            : `INSERT INTO opsweave.protected_terms
                (workspace_id,context_task_id,term_type,value,normalized_value,created_by_user_id)
               SELECT $1,$2,candidate.term_type,candidate.value,
                 lower(trim(candidate.value)),$3
               FROM opsweave.tasks task
               LEFT JOIN opsweave.projects project ON project.id=task.project_id
               CROSS JOIN LATERAL (VALUES
                 ('other'::varchar,task.title),('client'::varchar,task.client_name),
                 ('company'::varchar,project.name),('client'::varchar,project.client_name))
                 candidate(term_type,value)
               WHERE task.id=$2 AND task.workspace_id=$1
                 AND candidate.value IS NOT NULL AND length(trim(candidate.value))>=2
               ON CONFLICT DO NOTHING`,
          [input.workspaceId, input.subjectId, input.actorUserId],
        );
      }
      await insertAudit(client, {
        action: "delegation.anonymisation.changed",
        actorUserId: input.actorUserId,
        category: "delegation",
        metadata: { enabled: input.enabled },
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        workspaceId: input.workspaceId,
      });
    });
  }

  public async getDelegatePresentation(
    workspaceId: string,
    subjectType: AccessSubjectType,
    subjectId: string,
  ): Promise<DelegatePresentationRecord | null> {
    const result = await this.pool.query<DelegatePresentationRecord>(
      `SELECT CASE WHEN subject_project_id IS NULL THEN 'task' ELSE 'project' END AS "subjectType",
        coalesce(subject_project_id,subject_task_id) AS "subjectId",source_version AS "sourceVersion",
        safe_title AS "safeTitle",safe_description AS "safeDescription",
        safe_work_description AS "safeWorkDescription",safe_definition_of_done AS "safeDefinitionOfDone",
        safe_notes AS "safeNotes",neutral_client_label AS "neutralClientLabel",
        neutral_project_label AS "neutralProjectLabel",status,version
       FROM opsweave.delegate_entity_presentations WHERE workspace_id=$1
         AND (($2='project' AND subject_project_id=$3) OR ($2='task' AND subject_task_id=$3))`,
      [workspaceId, subjectType, subjectId],
    );
    return result.rows[0] ?? null;
  }

  public async saveDelegatePresentation(input: {
    actorUserId: string;
    neutralClientLabel: string | null;
    neutralProjectLabel: string | null;
    safeDefinitionOfDone: string | null;
    safeDescription: string | null;
    safeNotes: unknown;
    safeTitle: string;
    safeWorkDescription: string | null;
    status: "approved" | "blocked" | "draft";
    subjectId: string;
    subjectType: AccessSubjectType;
    version: number | null;
    workspaceId: string;
  }): Promise<DelegatePresentationRecord> {
    return transaction(this.pool, async (client) => {
      const source = await client.query<{ sourceVersion: number }>(
        input.subjectType === "project"
          ? 'SELECT version AS "sourceVersion" FROM opsweave.projects WHERE id=$1 AND workspace_id=$2'
          : 'SELECT version AS "sourceVersion" FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL',
        [input.subjectId, input.workspaceId],
      );
      const sourceVersion = source.rows[0]?.sourceVersion;
      if (sourceVersion === undefined)
        throw new StoreConflictError("The shared item is unavailable.");
      const returning = `RETURNING CASE WHEN subject_project_id IS NULL THEN 'task' ELSE 'project' END AS "subjectType",
        coalesce(subject_project_id,subject_task_id) AS "subjectId",source_version AS "sourceVersion",
        safe_title AS "safeTitle",safe_description AS "safeDescription",
        safe_work_description AS "safeWorkDescription",safe_definition_of_done AS "safeDefinitionOfDone",
        safe_notes AS "safeNotes",neutral_client_label AS "neutralClientLabel",
        neutral_project_label AS "neutralProjectLabel",status,version`;
      const parameters = [
        input.workspaceId,
        input.subjectId,
        sourceVersion,
        input.safeTitle,
        input.safeDescription,
        input.safeWorkDescription,
        input.safeDefinitionOfDone,
        JSON.stringify(input.safeNotes),
        input.neutralClientLabel,
        input.neutralProjectLabel,
        input.status,
        input.actorUserId,
      ];
      const result =
        input.version === null
          ? await client.query<DelegatePresentationRecord>(
              `INSERT INTO opsweave.delegate_entity_presentations
                (workspace_id,subject_project_id,subject_task_id,source_version,safe_title,
                 safe_description,safe_work_description,safe_definition_of_done,safe_notes,
                 neutral_client_label,neutral_project_label,status,approved_by_user_id,approved_at)
               VALUES ($1,CASE WHEN $13::text='project' THEN $2::uuid END,
                 CASE WHEN $13::text='task' THEN $2::uuid END,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,
                 $11::varchar(16),CASE WHEN $11::text='approved' THEN $12::uuid END,
                 CASE WHEN $11::text='approved' THEN now() END)
               ON CONFLICT DO NOTHING ${returning}`,
              [...parameters, input.subjectType],
            )
          : await client.query<DelegatePresentationRecord>(
              `UPDATE opsweave.delegate_entity_presentations SET source_version=$3,safe_title=$4,
                safe_description=$5,safe_work_description=$6,safe_definition_of_done=$7,
                safe_notes=$8::jsonb,neutral_client_label=$9,neutral_project_label=$10,
                status=$11::varchar(16),
                approved_by_user_id=CASE WHEN $11::text='approved' THEN $12::uuid END,
                approved_at=CASE WHEN $11::text='approved' THEN now() END,
                version=version+1,updated_at=now()
               WHERE workspace_id=$1 AND (($13::text='project' AND subject_project_id=$2::uuid)
                 OR ($13::text='task' AND subject_task_id=$2::uuid)) AND version=$14
               ${returning}`,
              [...parameters, input.subjectType, input.version],
            );
      const presentation = result.rows[0];
      if (presentation === undefined)
        throw new StoreConflictError("The safe presentation changed.");
      await insertAudit(client, {
        action: `delegation.presentation.${input.status}`,
        actorUserId: input.actorUserId,
        category: "delegation",
        metadata: { presentationVersion: presentation.version },
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        workspaceId: input.workspaceId,
      });
      return presentation;
    });
  }

  public async listProtectedTermValues(
    workspaceId: string,
    subjectType: AccessSubjectType,
    subjectId: string,
    includeIdentityTerms = true,
  ): Promise<string[]> {
    const result = await this.pool.query<{ value: string }>(
      `SELECT value FROM opsweave.protected_terms WHERE $4::boolean AND workspace_id=$1
       AND (($2='project' AND context_project_id=$3) OR ($2='task' AND context_task_id=$3)
         OR ($2='task' AND context_project_id=(SELECT project_id FROM opsweave.tasks WHERE id=$3)))
       UNION
       SELECT keyword.value FROM opsweave.access_grants access
       CROSS JOIN LATERAL unnest(access.privacy_keywords) keyword(value)
       WHERE access.workspace_id=$1 AND access.status IN ('active','invite_pending')
         AND (access.expires_at IS NULL OR access.expires_at>now())
         AND (($2='project' AND access.subject_project_id=$3)
           OR ($2='task' AND (access.subject_task_id=$3 OR access.subject_project_id=(
             SELECT project_id FROM opsweave.tasks WHERE id=$3))))`,
      [workspaceId, subjectType, subjectId, includeIdentityTerms],
    );
    return result.rows.map((row) => row.value);
  }

  public async isSubjectAnonymised(
    workspaceId: string,
    subjectType: AccessSubjectType,
    subjectId: string,
  ): Promise<boolean> {
    const result = await this.pool.query<{ anonymised: boolean }>(
      `SELECT CASE WHEN $2::text='project' THEN project.anonymise_delegation
        ELSE coalesce(project.anonymise_delegation,false) OR task.anonymise_delegation END AS anonymised
       FROM (SELECT 1) seed
       LEFT JOIN opsweave.tasks task ON $2::text='task' AND task.id=$3::uuid
         AND task.workspace_id=$1 AND task.deleted_at IS NULL
       LEFT JOIN opsweave.projects project ON project.id=CASE WHEN $2::text='project'
         THEN $3::uuid ELSE task.project_id END AND project.workspace_id=$1
       WHERE CASE WHEN $2::text='project' THEN project.id ELSE task.id END IS NOT NULL`,
      [workspaceId, subjectType, subjectId],
    );
    return result.rows[0]?.anonymised ?? false;
  }

  public async getSubjectAnonymisation(
    workspaceId: string,
    subjectType: AccessSubjectType,
    subjectId: string,
  ): Promise<{ effective: boolean; inherited: boolean; own: boolean }> {
    const result = await this.pool.query<{ effective: boolean; inherited: boolean; own: boolean }>(
      `SELECT CASE WHEN $2::text='project' THEN project.anonymise_delegation
          ELSE coalesce(project.anonymise_delegation,false) OR task.anonymise_delegation END AS effective,
        CASE WHEN $2::text='task' THEN coalesce(project.anonymise_delegation,false) ELSE false END AS inherited,
        CASE WHEN $2::text='project' THEN project.anonymise_delegation
          ELSE task.anonymise_delegation END AS own
       FROM (SELECT 1) seed
       LEFT JOIN opsweave.tasks task ON $2::text='task' AND task.id=$3::uuid
         AND task.workspace_id=$1 AND task.deleted_at IS NULL
       LEFT JOIN opsweave.projects project ON project.id=CASE WHEN $2::text='project'
         THEN $3::uuid ELSE task.project_id END AND project.workspace_id=$1
       WHERE CASE WHEN $2::text='project' THEN project.id ELSE task.id END IS NOT NULL`,
      [workspaceId, subjectType, subjectId],
    );
    const value = result.rows[0];
    if (value === undefined) throw new StoreConflictError("The shared item is unavailable.");
    return value;
  }

  public async listSubjectParticipants(
    workspaceId: string,
    viewerRole: WorkspaceRole,
    subjectType: AccessSubjectType,
    subjectId: string,
    viewerUserId: string | null = null,
  ): Promise<SubjectParticipantRecord[]> {
    const result = await this.pool.query<SubjectParticipantRecord>(
      `WITH subject AS (
        SELECT $3::varchar AS subject_type,$4::uuid AS subject_id,
          CASE WHEN $3='project' THEN $4::uuid ELSE task.project_id END AS project_id,
          CASE WHEN $3='task' THEN $4::uuid END AS task_id,
          coalesce(project.anonymise_delegation,false)
            OR coalesce(task.anonymise_delegation,false) AS anonymised
        FROM (SELECT 1) seed
        LEFT JOIN opsweave.tasks task ON $3='task' AND task.id=$4
        LEFT JOIN opsweave.projects project ON project.id=CASE WHEN $3='project' THEN $4::uuid ELSE task.project_id END
      ), participants AS (
        SELECT membership.user_id,'owner'::text AS source
        FROM opsweave.workspace_memberships membership
        WHERE membership.workspace_id=$1 AND membership.role IN ('owner','admin') AND membership.status='active'
        UNION
        SELECT access.delegate_user_id,'grant' FROM opsweave.access_grants access CROSS JOIN subject
        LEFT JOIN opsweave.task_delegate_audience audience
          ON audience.task_id=subject.task_id AND audience.user_id=access.delegate_user_id
        WHERE access.workspace_id=$1 AND access.status='active' AND access.delegate_user_id IS NOT NULL
          AND (access.expires_at IS NULL OR access.expires_at>now())
          AND ((subject.subject_type='project' AND access.subject_project_id=subject.subject_id)
            OR (subject.subject_type='task' AND (access.subject_task_id=subject.task_id OR
              (access.subject_project_id=subject.project_id AND EXISTS (SELECT 1 FROM opsweave.tasks visible
                WHERE visible.id=subject.task_id AND (visible.delegate_visibility='project_delegates'
                  OR (visible.delegate_visibility='selected_delegates' AND audience.user_id IS NOT NULL)
                  OR visible.created_by_user_id=access.delegate_user_id))))))
      )
      SELECT DISTINCT participant.user_id AS "userId",
        CASE WHEN $2 IN ('owner','admin') THEN
          coalesce("user".full_name,"user".email,"user".username,'User')
        WHEN "user".id=$5::uuid THEN 'You'
        WHEN membership.role IN ('owner','admin') THEN 'Workspace owner'
        WHEN subject.anonymised THEN coalesce(alias.alias,
          CASE WHEN membership.role IN ('owner','admin') THEN 'Workspace owner' ELSE 'Participant' END)
        ELSE 'Participant '||upper(substr(md5(subject.subject_id::text||"user".id::text),1,6)) END AS "displayName",
        CASE WHEN subject.anonymised THEN alias.alias END AS alias,
        (SELECT access.profile_description FROM opsweave.access_grants access
          WHERE access.workspace_id=$1 AND access.delegate_user_id=participant.user_id
            AND access.status IN ('active','invite_pending')
            AND (access.expires_at IS NULL OR access.expires_at>now())
            AND (access.subject_task_id=subject.task_id OR access.subject_project_id=subject.project_id)
            AND access.profile_description IS NOT NULL
          ORDER BY (access.subject_task_id=subject.task_id) DESC,access.created_at DESC LIMIT 1)
          AS "profileDescription"
      FROM participants participant
      JOIN opsweave.users "user" ON "user".id=participant.user_id
      JOIN opsweave.workspace_memberships membership ON membership.user_id="user".id
        AND membership.workspace_id=$1 AND membership.status='active'
      CROSS JOIN subject
      LEFT JOIN opsweave.delegation_aliases alias ON alias.user_id="user".id AND alias.retired_at IS NULL
        AND ((alias.context_type='project' AND alias.context_project_id=subject.project_id)
          OR (alias.context_type='task' AND alias.context_task_id=subject.task_id))
      ORDER BY "displayName","userId"`,
      [workspaceId, viewerRole, subjectType, subjectId, viewerUserId],
    );
    return result.rows;
  }

  public async createActivity(input: {
    actorAlias: string | null;
    actorUserId: string;
    body: string;
    contentStatus: "approved" | "quarantined";
    kind: "log_note" | "message";
    mentionedUserIds: readonly string[];
    notificationUserIds: readonly string[];
    policyFlagged?: boolean;
    quarantineReason: string | null;
    subjectId: string;
    subjectType: AccessSubjectType;
    workspaceId: string;
  }): Promise<string> {
    return transaction(this.pool, async (client) => {
      const eventId = await insertAudit(client, {
        action: `activity.${input.kind}.created`,
        actorUserId: input.actorUserId,
        category: input.kind === "message" ? "message" : "log_note",
        metadata: { quarantined: input.contentStatus === "quarantined" },
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        userGenerated: true,
        visibility:
          input.contentStatus === "quarantined" ? "actor_and_owner" : "authorised_participants",
        workspaceId: input.workspaceId,
      });
      await client.query(`UPDATE opsweave.audit_events SET actor_alias_snapshot=$2 WHERE id=$1`, [
        eventId,
        input.actorAlias,
      ]);
      await client.query(
        `INSERT INTO opsweave.activity_payloads
          (audit_event_id,kind,body,delegate_safe_body,content_status,search_text)
         VALUES ($1,$2,$3,CASE WHEN $4='approved' THEN $3::text END,$4,$3)`,
        [eventId, input.kind, input.body, input.contentStatus],
      );
      for (const userId of input.mentionedUserIds) {
        const alias = await client.query<{ alias: string | null }>(
          `SELECT alias FROM opsweave.delegation_aliases WHERE user_id=$1 AND retired_at IS NULL
           AND (context_project_id=CASE WHEN $2='project' THEN $3::uuid ELSE
             (SELECT project_id FROM opsweave.tasks WHERE id=$3) END
             OR context_task_id=CASE WHEN $2='task' THEN $3::uuid END) LIMIT 1`,
          [userId, input.subjectType, input.subjectId],
        );
        await client.query(
          `INSERT INTO opsweave.activity_mentions
            (audit_event_id,mentioned_user_id,display_alias_snapshot) VALUES ($1,$2,$3)`,
          [eventId, userId, alias.rows[0]?.alias ?? null],
        );
      }
      if (input.contentStatus === "approved") {
        for (const recipientUserId of input.notificationUserIds) {
          if (recipientUserId === input.actorUserId) continue;
          await client.query(
            `INSERT INTO opsweave.notifications
              (workspace_id,recipient_user_id,source_audit_event_id,type,title,body,
               route_type,route_id,idempotency_key)
             VALUES ($1,$2,$3,'mention_or_message','New shared message',
               'New activity is available in shared work.',$4,$5,$6)
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [
              input.workspaceId,
              recipientUserId,
              eventId,
              input.subjectType,
              input.subjectId,
              `activity:${eventId}:${recipientUserId}`,
            ],
          );
        }
        if (input.policyFlagged !== true) {
          await client.query(
            `INSERT INTO opsweave.compliance_jobs (workspace_id,audit_event_id)
             SELECT $1,$2 FROM opsweave.workspace_settings settings
             JOIN opsweave.workspace_memberships membership ON membership.workspace_id=settings.workspace_id
             WHERE settings.workspace_id=$1 AND settings.compliance_monitor_enabled
               AND membership.user_id=$3 AND membership.role='delegate' AND membership.status='active'
             ON CONFLICT (audit_event_id) DO NOTHING`,
            [input.workspaceId, eventId, input.actorUserId],
          );
        }
      } else {
        await client.query(
          `INSERT INTO opsweave.compliance_flags
            (workspace_id,source_audit_event_id,subject_project_id,subject_task_id,
             delegate_user_id,delegate_alias_snapshot,risk_level,categories,reason,evidence_reference)
           VALUES ($1,$2,CASE WHEN $3='project' THEN $4::uuid END,
             CASE WHEN $3='task' THEN $4::uuid END,$5,$6,'high',ARRAY['identity_or_contact_leak'],$7,$2::text)`,
          [
            input.workspaceId,
            eventId,
            input.subjectType,
            input.subjectId,
            input.actorUserId,
            input.actorAlias,
            input.quarantineReason ?? "Protected information requires owner review.",
          ],
        );
        await client.query(
          `INSERT INTO opsweave.notifications
            (workspace_id,recipient_user_id,source_audit_event_id,type,title,body,
             route_type,route_id,idempotency_key)
           SELECT $1,recipient.user_id,$2,'compliance_flag','Collaboration content needs review',
             'A private compliance flag requires an owner decision.','notifications',NULL,
             $3||':'||recipient.user_id::text
           FROM opsweave.workspace_memberships recipient WHERE recipient.workspace_id=$1
             AND recipient.role IN ('owner','admin') AND recipient.status='active'
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [input.workspaceId, eventId, `compliance:${eventId}`],
        );
      }
      if (input.contentStatus === "approved" && input.policyFlagged === true) {
        await client.query(
          `INSERT INTO opsweave.compliance_flags
            (workspace_id,source_audit_event_id,subject_project_id,subject_task_id,
             delegate_user_id,delegate_alias_snapshot,risk_level,categories,reason,evidence_reference)
           VALUES ($1,$2,CASE WHEN $3='project' THEN $4::uuid END,
             CASE WHEN $3='task' THEN $4::uuid END,$5,$6,'high',ARRAY['possible_solicitation'],
             $7,$2::text)`,
          [
            input.workspaceId,
            eventId,
            input.subjectType,
            input.subjectId,
            input.actorUserId,
            input.actorAlias,
            input.quarantineReason ?? "Contact or private identity details were redacted.",
          ],
        );
        await client.query(
          `INSERT INTO opsweave.notifications
            (workspace_id,recipient_user_id,source_audit_event_id,type,title,body,
             route_type,route_id,idempotency_key)
           SELECT $1,recipient.user_id,$2,'compliance_flag','Possible solicitation was redacted',
             'Contact or private identity details were removed from shared chatter.','notifications',NULL,
             $3||':'||recipient.user_id::text
           FROM opsweave.workspace_memberships recipient WHERE recipient.workspace_id=$1
             AND recipient.role IN ('owner','admin') AND recipient.status='active'
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [input.workspaceId, eventId, `compliance-redaction:${eventId}`],
        );
      }
      return eventId;
    });
  }

  public async listActivity(input: {
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    query?: string;
    subjectId: string;
    subjectType: AccessSubjectType;
    viewerUserId: string;
    viewerRole: WorkspaceRole;
    workspaceId: string;
    userGenerated?: boolean;
    userId?: string;
  }): Promise<ActivityRecord[]> {
    const result = await this.pool.query<ActivityRecord>(
      `SELECT event.id,event.action,event.category,event.metadata,
        event.user_generated AS "userGenerated",event.created_at AS "createdAt",
        payload.kind,payload.content_status AS "contentStatus",
        CASE WHEN $4 IN ('owner','admin') OR event.actor_user_id=$5::uuid
          THEN payload.body ELSE payload.delegate_safe_body END AS body,
        CASE WHEN $4 IN ('owner','admin') THEN coalesce("user".full_name,"user".email,"user".username)
          ELSE coalesce(event.actor_alias_snapshot,
            CASE WHEN membership.role IN ('owner','admin') THEN 'Workspace owner' ELSE 'Participant' END)
        END AS "actorDisplay"
       FROM opsweave.audit_events event
       LEFT JOIN opsweave.activity_payloads payload ON payload.audit_event_id=event.id
       LEFT JOIN opsweave.users "user" ON "user".id=event.actor_user_id
       LEFT JOIN opsweave.workspace_memberships membership ON membership.user_id=event.actor_user_id
         AND membership.workspace_id=event.workspace_id
       WHERE event.workspace_id=$1
         AND (($2='project' AND (event.subject_project_id=$3 OR
           (event.subject_project_id IS NULL AND event.target_type='project' AND event.target_id=$3::text)))
          OR ($2='task' AND (event.subject_task_id=$3 OR
           (event.subject_task_id IS NULL AND event.target_type='task' AND event.target_id=$3::text))))
         AND ($4 IN ('owner','admin') OR event.visibility='authorised_participants'
           OR (event.visibility='selected_participants' AND EXISTS (
             SELECT 1 FROM opsweave.activity_mentions mention
             WHERE mention.audit_event_id=event.id AND mention.mentioned_user_id=$5::uuid))
           OR (event.visibility='actor_and_owner' AND event.actor_user_id=$5::uuid))
         AND ($4 IN ('owner','admin') OR payload.content_status IS NULL OR payload.content_status='approved'
           OR event.actor_user_id=$5::uuid)
         AND ($6::text IS NULL OR event.action ILIKE '%'||$6||'%' OR payload.search_text ILIKE '%'||$6||'%')
         AND ($7::text IS NULL OR event.category=$7::text OR ($7::text='status' AND (
           event.action LIKE 'task.moved%' OR event.action='task.schedule.moved'
           OR event.action='task.selected_by_automation'
           OR coalesce(event.metadata->'changes','{}'::jsonb) ?| ARRAY['workflowLane','stageId','status']
         )))
         AND ($8::date IS NULL OR event.created_at >= $8::date)
         AND ($9::date IS NULL OR event.created_at < $9::date + interval '1 day')
         AND ($10::uuid IS NULL OR event.actor_user_id=$10::uuid)
         AND ($11::boolean IS NULL OR event.user_generated=$11::boolean)
       ORDER BY event.created_at DESC,event.id DESC LIMIT $12`,
      [
        input.workspaceId,
        input.subjectType,
        input.subjectId,
        input.viewerRole,
        input.viewerUserId,
        input.query ?? null,
        input.category ?? null,
        input.dateFrom ?? null,
        input.dateTo ?? null,
        input.userId ?? null,
        input.userGenerated ?? null,
        Math.max(1, Math.min(500, input.limit ?? 200)),
      ],
    );
    return result.rows;
  }

  public async listTimeEntries(input: {
    subjectId: string;
    subjectType: AccessSubjectType;
    viewerUserId?: string;
    viewerRole: WorkspaceRole;
    workspaceId: string;
  }): Promise<CollaborationTimeEntryRecord[]> {
    const result = await this.pool.query<CollaborationTimeEntryRecord>(
      `SELECT entry.id,entry.task_id AS "taskId",entry.project_id AS "projectId",
        entry.user_id AS "userId",entry.entry_date::text AS "entryDate",entry.description,
        entry.hours::float8 AS hours,entry.version,entry.created_at AS "createdAt",
        CASE WHEN $4::text IN ('owner','admin') THEN
          coalesce("user".full_name,"user".email,"user".username,'User')
        WHEN entry.user_id=$5::uuid THEN 'You'
        WHEN membership.role IN ('owner','admin') THEN 'Workspace owner'
        ELSE coalesce(entry.actor_alias_snapshot,'Participant') END AS "actorDisplay"
       FROM opsweave.task_time_entries entry
       JOIN opsweave.users "user" ON "user".id=entry.user_id
       JOIN opsweave.workspace_memberships membership ON membership.workspace_id=$1
         AND membership.user_id=entry.user_id
       LEFT JOIN opsweave.tasks task ON task.id=entry.task_id
       LEFT JOIN opsweave.projects project ON project.id=coalesce(entry.project_id,task.project_id)
       WHERE (task.workspace_id=$1 OR project.workspace_id=$1)
         AND (($2::text='task' AND entry.task_id=$3::uuid)
         OR ($2::text='project' AND (entry.project_id=$3::uuid OR task.project_id=$3::uuid)))
       ORDER BY entry.entry_date DESC,entry.created_at DESC,entry.id DESC`,
      [
        input.workspaceId,
        input.subjectType,
        input.subjectId,
        input.viewerRole,
        input.viewerUserId ?? null,
      ],
    );
    return result.rows;
  }

  public async listAccessibleAttachments(input: {
    subjectId: string;
    subjectType: AccessSubjectType;
    userId: string;
    viewerRole: WorkspaceRole;
    workspaceId: string;
  }): Promise<CollaborationAttachmentRecord[]> {
    const result = await this.pool.query<CollaborationAttachmentRecord>(
      `WITH context AS (
        SELECT CASE WHEN $2::text='project' THEN project.anonymise_delegation
          ELSE coalesce(project.anonymise_delegation,false) OR task.anonymise_delegation END AS anonymised
        FROM (SELECT 1) seed
        LEFT JOIN opsweave.tasks task ON $2::text='task' AND task.id=$3::uuid
        LEFT JOIN opsweave.projects project ON project.id=CASE WHEN $2::text='project'
          THEN $3::uuid ELSE task.project_id END
      )
      SELECT attachment.id,attachment.entity_type AS "entityType",attachment.entity_id AS "entityId",
        CASE WHEN $4::text IN ('owner','admin') THEN attachment.original_name
          ELSE coalesce(attachment.delegate_safe_name,attachment.original_name) END AS "displayName",
        attachment.storage_key AS "storageKey",attachment.content_type AS "contentType",
        attachment.byte_size::float8 AS "byteSize",attachment.uploaded_by_user_id AS "uploadedByUserId",
        attachment.visibility,attachment.original_attachment_id AS "originalAttachmentId",
        attachment.delegate_safe_name AS "delegateSafeName",
        attachment.approval_status AS "approvalStatus",attachment.scan_status AS "scanStatus",
        CASE WHEN $4::text IN ('owner','admin') THEN coalesce((SELECT array_agg(selected.user_id
          ORDER BY selected.user_id) FROM opsweave.attachment_delegate_audience selected
          WHERE selected.attachment_id=attachment.id),'{}'::uuid[]) ELSE '{}'::uuid[] END
          AS "selectedUserIds",
        attachment.purge_after AS "purgeAfter",attachment.created_at AS "createdAt"
       FROM opsweave.attachments attachment CROSS JOIN context
       LEFT JOIN opsweave.attachment_delegate_audience audience
         ON audience.attachment_id=attachment.id AND audience.user_id=$5::uuid
       WHERE attachment.workspace_id=$1 AND attachment.entity_type=$2::text
         AND attachment.entity_id=$3::uuid
         AND ($4::text IN ('owner','admin') OR (
           attachment.scan_status='clean' AND attachment.approval_status='approved'
           AND (attachment.visibility='shared_all_delegates'
             OR attachment.visibility='redacted_delegate_copy'
             OR (attachment.visibility='shared_selected_delegates' AND audience.user_id IS NOT NULL))
           AND (NOT context.anonymised OR attachment.visibility='redacted_delegate_copy')))
       ORDER BY attachment.created_at DESC,attachment.id DESC`,
      [input.workspaceId, input.subjectType, input.subjectId, input.viewerRole, input.userId],
    );
    return result.rows;
  }

  public async getAttachmentSubject(
    workspaceId: string,
    attachmentId: string,
  ): Promise<{ subjectId: string; subjectType: AccessSubjectType } | null> {
    const result = await this.pool.query<{ subjectId: string; subjectType: AccessSubjectType }>(
      `SELECT entity_type AS "subjectType",entity_id AS "subjectId"
       FROM opsweave.attachments WHERE workspace_id=$1 AND id=$2`,
      [workspaceId, attachmentId],
    );
    return result.rows[0] ?? null;
  }

  public async createCollaborationAttachment(input: {
    actorAlias: string | null;
    actorUserId: string;
    approvalStatus: "approved" | "draft";
    byteSize: number;
    contentHash: string;
    contentType: string;
    delegateSafeName: string | null;
    filenameRisk: boolean;
    originalAttachmentId: string | null;
    originalName: string;
    selectedUserIds: readonly string[];
    storageKey: string;
    subjectId: string;
    subjectType: AccessSubjectType;
    visibility: CollaborationAttachmentRecord["visibility"];
    workspaceId: string;
  }): Promise<string> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO opsweave.attachments
          (workspace_id,entity_type,entity_id,original_name,storage_key,content_type,byte_size,
           uploaded_by_user_id,visibility,original_attachment_id,delegate_safe_name,
           approval_status,approved_by_user_id,approved_at,scan_status,content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::varchar,
          CASE WHEN $12::text='approved' THEN $8::uuid END,
          CASE WHEN $12::text='approved' THEN now() END,'clean',$13) RETURNING id`,
        [
          input.workspaceId,
          input.subjectType,
          input.subjectId,
          input.originalName,
          input.storageKey,
          input.contentType,
          input.byteSize,
          input.actorUserId,
          input.visibility,
          input.originalAttachmentId,
          input.delegateSafeName,
          input.approvalStatus,
          input.contentHash,
        ],
      );
      const attachmentId = result.rows[0]?.id;
      if (attachmentId === undefined) throw new Error("Document creation failed.");
      for (const userId of input.selectedUserIds) {
        await client.query(
          `INSERT INTO opsweave.attachment_delegate_audience (attachment_id,user_id)
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [attachmentId, userId],
        );
      }
      const eventId = await insertAudit(client, {
        action: `${input.subjectType}.document.uploaded`,
        actorUserId: input.actorUserId,
        category: "document",
        metadata: {
          attachmentId,
          approvalStatus: input.approvalStatus,
          visibility: input.visibility,
        },
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        userGenerated: true,
        visibility: "authorised_participants",
        workspaceId: input.workspaceId,
      });
      await client.query("UPDATE opsweave.audit_events SET actor_alias_snapshot=$2 WHERE id=$1", [
        eventId,
        input.actorAlias,
      ]);
      if (input.filenameRisk) {
        await client.query(
          `INSERT INTO opsweave.compliance_flags
            (workspace_id,source_audit_event_id,attachment_id,subject_project_id,subject_task_id,
             delegate_user_id,delegate_alias_snapshot,risk_level,categories,reason,evidence_reference)
           VALUES ($1,$2,$3,CASE WHEN $4='project' THEN $5::uuid END,
             CASE WHEN $4='task' THEN $5::uuid END,$6,$7,'high',ARRAY['document_metadata'],
             'Document metadata may disclose protected identity or contact information.',$3::text)`,
          [
            input.workspaceId,
            eventId,
            attachmentId,
            input.subjectType,
            input.subjectId,
            input.actorUserId,
            input.actorAlias,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO opsweave.compliance_jobs (workspace_id,audit_event_id)
           SELECT $1,$2 FROM opsweave.workspace_settings settings
           JOIN opsweave.workspace_memberships membership ON membership.workspace_id=settings.workspace_id
           WHERE settings.workspace_id=$1 AND settings.compliance_monitor_enabled
             AND membership.user_id=$3 AND membership.role='delegate' AND membership.status='active'
           ON CONFLICT (audit_event_id) DO NOTHING`,
          [input.workspaceId, eventId, input.actorUserId],
        );
      }
      return attachmentId;
    });
  }

  public async updateAttachmentSharing(input: {
    actorUserId: string;
    approvalStatus: "approved" | "draft" | "rejected";
    attachmentId: string;
    delegateSafeName: string | null;
    selectedUserIds: readonly string[];
    visibility: CollaborationAttachmentRecord["visibility"];
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const updated = await client.query<{ entityId: string; entityType: AccessSubjectType }>(
        `UPDATE opsweave.attachments SET visibility=$3,delegate_safe_name=$4,approval_status=$5,
          approved_by_user_id=CASE WHEN $5='approved' THEN $6::uuid END,
          approved_at=CASE WHEN $5='approved' THEN now() END
         WHERE id=$1 AND workspace_id=$2
         RETURNING entity_type AS "entityType",entity_id AS "entityId"`,
        [
          input.attachmentId,
          input.workspaceId,
          input.visibility,
          input.delegateSafeName,
          input.approvalStatus,
          input.actorUserId,
        ],
      );
      const attachment = updated.rows[0];
      if (attachment === undefined) throw new StoreConflictError("The document is unavailable.");
      await client.query(
        "DELETE FROM opsweave.attachment_delegate_audience WHERE attachment_id=$1",
        [input.attachmentId],
      );
      for (const userId of input.selectedUserIds) {
        await client.query(
          `INSERT INTO opsweave.attachment_delegate_audience (attachment_id,user_id)
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [input.attachmentId, userId],
        );
      }
      await insertAudit(client, {
        action: `${attachment.entityType}.document.sharing_updated`,
        actorUserId: input.actorUserId,
        category: "document",
        metadata: {
          attachmentId: input.attachmentId,
          approvalStatus: input.approvalStatus,
          visibility: input.visibility,
        },
        subjectId: attachment.entityId,
        subjectType: attachment.entityType,
        workspaceId: input.workspaceId,
      });
    });
  }

  public async claimComplianceJob(): Promise<ComplianceJobRecord | null> {
    return transaction(this.pool, async (client) => {
      await client.query(
        `UPDATE opsweave.compliance_jobs SET state='pending',claimed_at=NULL,updated_at=now()
         WHERE state='processing' AND claimed_at<now()-interval '10 minutes'`,
      );
      const result = await client.query<ComplianceJobRecord>(
        `WITH claimed AS (
          SELECT job.id FROM opsweave.compliance_jobs job
          JOIN opsweave.workspace_settings settings ON settings.workspace_id=job.workspace_id
          WHERE job.state='pending' AND job.next_attempt_at<=now()
            AND settings.compliance_monitor_enabled
          ORDER BY job.next_attempt_at,job.created_at,job.id FOR UPDATE OF job SKIP LOCKED LIMIT 1
        ), updated AS (
          UPDATE opsweave.compliance_jobs job SET state='processing',claimed_at=now(),
            attempt_count=job.attempt_count+1,updated_at=now()
          FROM claimed WHERE job.id=claimed.id RETURNING job.*
        )
        SELECT updated.id,updated.workspace_id AS "workspaceId",event.id AS "auditEventId",
          event.actor_user_id AS "actorUserId",event.actor_alias_snapshot AS "actorAlias",
          CASE WHEN event.subject_project_id IS NOT NULL THEN 'project' ELSE 'task' END AS "subjectType",
          coalesce(event.subject_project_id,event.subject_task_id) AS "subjectId",
          CASE WHEN payload.kind IS NOT NULL THEN payload.kind ELSE 'document_metadata' END AS "contentKind",
          coalesce(payload.body,attachment.original_name,'') AS content,
          coalesce(project_presentation.safe_title,task_presentation.safe_title,
            CASE WHEN event.subject_project_id IS NOT NULL THEN 'Shared project' ELSE 'Shared task' END)
            AS "neutralSubjectLabel"
         FROM updated JOIN opsweave.audit_events event ON event.id=updated.audit_event_id
         LEFT JOIN opsweave.activity_payloads payload ON payload.audit_event_id=event.id
         LEFT JOIN opsweave.attachments attachment
           ON attachment.id=CASE WHEN event.metadata->>'attachmentId' ~* '^[0-9a-f-]{36}$'
             THEN (event.metadata->>'attachmentId')::uuid END
         LEFT JOIN opsweave.delegate_entity_presentations project_presentation
           ON project_presentation.subject_project_id=event.subject_project_id
             AND project_presentation.status='approved'
         LEFT JOIN opsweave.delegate_entity_presentations task_presentation
           ON task_presentation.subject_task_id=event.subject_task_id
             AND task_presentation.status='approved'`,
      );
      return result.rows[0] ?? null;
    });
  }

  public async completeComplianceJob(input: {
    categories: readonly string[];
    flagged: boolean;
    job: ComplianceJobRecord;
    model: string;
    provider: string;
    reason: string;
    riskLevel: "high" | "low" | "medium";
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const completed = await client.query(
        `UPDATE opsweave.compliance_jobs SET state='completed',completed_at=now(),safe_error=NULL,
          updated_at=now() WHERE id=$1 AND state='processing'`,
        [input.job.id],
      );
      if (completed.rowCount !== 1) throw new StoreConflictError("The compliance job changed.");
      if (!input.flagged) return;
      const flag = await client.query<{ id: string }>(
        `INSERT INTO opsweave.compliance_flags
          (workspace_id,source_audit_event_id,subject_project_id,subject_task_id,delegate_user_id,
           delegate_alias_snapshot,risk_level,categories,reason,evidence_reference,model,provider,prompt_version)
         VALUES ($1,$2::uuid,CASE WHEN $3='project' THEN $4::uuid END,
           CASE WHEN $3='task' THEN $4::uuid END,$5,$6,$7,$8::text[],$9,$2::text,$10,$11,'collaboration-v1')
         ON CONFLICT DO NOTHING RETURNING id`,
        [
          input.job.workspaceId,
          input.job.auditEventId,
          input.job.subjectType,
          input.job.subjectId,
          input.job.actorUserId,
          input.job.actorAlias,
          input.riskLevel,
          input.categories,
          input.reason,
          input.model,
          input.provider,
        ],
      );
      const flagId = flag.rows[0]?.id;
      if (flagId === undefined) return;
      await client.query(
        `INSERT INTO opsweave.notifications
          (workspace_id,recipient_user_id,source_audit_event_id,type,title,body,
           route_type,route_id,idempotency_key)
         SELECT $1,recipient.user_id,$2,'compliance_flag','Collaboration content needs review',
           'A private compliance flag requires an owner decision.','notifications',NULL,
           $3||':'||recipient.user_id::text
         FROM opsweave.workspace_memberships recipient WHERE recipient.workspace_id=$1
           AND recipient.role IN ('owner','admin') AND recipient.status='active'
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [input.job.workspaceId, input.job.auditEventId, `compliance-ai:${flagId}`],
      );
    });
  }

  public async failComplianceJob(jobId: string, safeError: string): Promise<void> {
    await this.pool.query(
      `UPDATE opsweave.compliance_jobs SET
        state=CASE WHEN attempt_count>=5 THEN 'failed' ELSE 'pending' END,
        next_attempt_at=now()+make_interval(secs=>least(3600,power(2,attempt_count)::int*30)),
        claimed_at=NULL,safe_error=$2,updated_at=now() WHERE id=$1 AND state='processing'`,
      [jobId, safeError.slice(0, 500)],
    );
  }

  public async listComplianceFlags(workspaceId: string): Promise<ComplianceFlagRecord[]> {
    const result = await this.pool.query<ComplianceFlagRecord>(
      `SELECT flag.id,flag.risk_level AS "riskLevel",flag.categories,flag.reason,flag.status,
        flag.delegate_alias_snapshot AS "delegateAlias",flag.created_at AS "createdAt",
        CASE WHEN flag.subject_project_id IS NOT NULL THEN 'project'
          WHEN flag.subject_task_id IS NOT NULL THEN 'task' END AS "subjectType",
        coalesce(flag.subject_project_id,flag.subject_task_id) AS "subjectId",
        coalesce(project.name,task.title,'Unavailable work') AS "subjectTitle"
       FROM opsweave.compliance_flags flag
       LEFT JOIN opsweave.projects project ON project.id=flag.subject_project_id
       LEFT JOIN opsweave.tasks task ON task.id=flag.subject_task_id
       WHERE flag.workspace_id=$1 ORDER BY CASE flag.status WHEN 'open' THEN 0 ELSE 1 END,
         flag.created_at DESC,flag.id DESC`,
      [workspaceId],
    );
    return result.rows;
  }

  public async reviewComplianceFlag(input: {
    action: "dismiss" | "restrict" | "revoke" | "warn";
    actorUserId: string;
    flagId: string;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const flag = await client.query<{
        delegateUserId: string | null;
        subjectId: string | null;
        subjectType: AccessSubjectType | null;
      }>(
        `UPDATE opsweave.compliance_flags SET status=$3::varchar,reviewed_by_user_id=$4,reviewed_at=now(),
          actioned_at=CASE WHEN $3::varchar='dismissed' THEN NULL ELSE now() END,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND status='open'
         RETURNING delegate_user_id AS "delegateUserId",
          CASE WHEN subject_project_id IS NOT NULL THEN 'project'
            WHEN subject_task_id IS NOT NULL THEN 'task' END AS "subjectType",
          coalesce(subject_project_id,subject_task_id) AS "subjectId"`,
        [
          input.flagId,
          input.workspaceId,
          input.action === "dismiss"
            ? "dismissed"
            : input.action === "restrict"
              ? "restricted"
              : input.action === "revoke"
                ? "revoked"
                : "warned",
          input.actorUserId,
        ],
      );
      const record = flag.rows[0];
      if (record === undefined) throw new StoreConflictError("The compliance flag is unavailable.");
      if (record.delegateUserId !== null && input.action === "warn") {
        await client.query(
          `INSERT INTO opsweave.notifications
            (workspace_id,recipient_user_id,type,title,body,route_type,route_id,idempotency_key)
           VALUES ($1,$2,'compliance_warning','Collaboration policy reminder',
             'The owner asked you to keep work and communication within approved collaboration channels.',
             $3,$4,$5) ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            input.workspaceId,
            record.delegateUserId,
            record.subjectType,
            record.subjectId,
            `compliance-warning:${input.flagId}`,
          ],
        );
      }
      if (
        record.delegateUserId !== null &&
        record.subjectType !== null &&
        record.subjectId !== null &&
        (input.action === "restrict" || input.action === "revoke")
      ) {
        const taskProjectCondition =
          record.subjectType === "task"
            ? `OR subject_project_id=(SELECT project_id FROM opsweave.tasks WHERE id=$4)`
            : "";
        const affected = await client.query<{ id: string }>(
          input.action === "restrict"
            ? `UPDATE opsweave.access_grants SET access_role='reviewer',version=version+1,updated_at=now()
               WHERE workspace_id=$1 AND delegate_user_id=$2 AND status='active'
                 AND ((subject_type=$3 AND coalesce(subject_project_id,subject_task_id)=$4) ${taskProjectCondition})
               RETURNING id`
            : `UPDATE opsweave.access_grants SET status='revoked',revoked_by_user_id=$5,
                 revoked_at=now(),version=version+1,updated_at=now()
               WHERE workspace_id=$1 AND delegate_user_id=$2 AND status IN ('active','invite_pending')
                 AND ((subject_type=$3 AND coalesce(subject_project_id,subject_task_id)=$4) ${taskProjectCondition})
               RETURNING id`,
          input.action === "restrict"
            ? [input.workspaceId, record.delegateUserId, record.subjectType, record.subjectId]
            : [
                input.workspaceId,
                record.delegateUserId,
                record.subjectType,
                record.subjectId,
                input.actorUserId,
              ],
        );
        for (const access of affected.rows) {
          if (input.action === "restrict") {
            await client.query(
              `UPDATE opsweave.task_assignments SET assignment_role='review',updated_at=now()
               WHERE access_grant_id=$1 AND active`,
              [access.id],
            );
          } else {
            await client.query(
              `UPDATE opsweave.invitation_tokens SET invalidated_at=now()
               WHERE access_grant_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
              [access.id],
            );
            await client.query(
              `UPDATE opsweave.notification_outbox outbox SET state='cancelled',cancelled_at=now(),
                encrypted_payload=NULL,updated_at=now()
               FROM opsweave.invitation_tokens token WHERE token.access_grant_id=$1
                 AND outbox.invitation_token_id=token.id AND outbox.state IN ('pending','processing')`,
              [access.id],
            );
            await client.query(
              `UPDATE opsweave.task_assignments SET active=false,ended_at=now(),updated_at=now()
               WHERE access_grant_id=$1 AND active`,
              [access.id],
            );
          }
        }
        await client.query(
          "UPDATE opsweave.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
          [record.delegateUserId],
        );
        if (input.action === "revoke") {
          await client.query(
            `UPDATE opsweave.notifications SET state='cancelled',cancelled_at=now(),updated_at=now()
             WHERE recipient_user_id=$1 AND state IN ('unread','read') AND
               (route_id=$2 OR ($3='project' AND route_type='task' AND route_id IN
                 (SELECT id FROM opsweave.tasks WHERE project_id=$2)))`,
            [record.delegateUserId, record.subjectId, record.subjectType],
          );
        }
      }
      if (record.subjectType !== null && record.subjectId !== null) {
        await insertAudit(client, {
          action: `compliance.${input.action}`,
          actorUserId: input.actorUserId,
          category: "compliance",
          metadata: { flagId: input.flagId },
          subjectId: record.subjectId,
          subjectType: record.subjectType,
          workspaceId: input.workspaceId,
        });
      }
    });
  }

  public async createTimeEntry(input: {
    accessGrantId: string | null;
    actorAlias: string | null;
    actorUserId: string;
    description: string;
    entryDate: string;
    hours: number;
    subjectId: string;
    subjectType: AccessSubjectType;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const subject = await client.query(
        input.subjectType === "task"
          ? `SELECT 1 FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2
             AND deleted_at IS NULL FOR UPDATE`
          : `SELECT 1 FROM opsweave.projects WHERE id=$1 AND workspace_id=$2
             AND archived_at IS NULL FOR UPDATE`,
        [input.subjectId, input.workspaceId],
      );
      if (subject.rowCount !== 1)
        throw new StoreConflictError("The timesheet subject is unavailable.");
      await client.query(
        `INSERT INTO opsweave.task_time_entries
          (task_id,project_id,user_id,access_grant_id,actor_alias_snapshot,entry_date,description,hours)
         VALUES (CASE WHEN $1::text='task' THEN $2::uuid END,
          CASE WHEN $1::text='project' THEN $2::uuid END,$3,$4,$5,$6,$7,$8)`,
        [
          input.subjectType,
          input.subjectId,
          input.actorUserId,
          input.accessGrantId,
          input.actorAlias,
          input.entryDate,
          input.description,
          input.hours,
        ],
      );
      if (input.subjectType === "task") await recalculateTaskHours(client, input.subjectId);
      await insertAudit(client, {
        action: `${input.subjectType}.time_entry.created`,
        actorUserId: input.actorUserId,
        category: "timesheet",
        metadata: { date: input.entryDate, hours: input.hours },
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        userGenerated: true,
        visibility: "authorised_participants",
        workspaceId: input.workspaceId,
      });
    });
  }

  public async updateTimeEntry(input: {
    actorUserId: string;
    canManageAll: boolean;
    description: string;
    entryDate: string;
    entryId: string;
    hours: number;
    subjectId: string;
    subjectType: AccessSubjectType;
    version: number;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const updated = await client.query<{ taskId: string | null }>(
        `UPDATE opsweave.task_time_entries entry SET entry_date=$7,description=$8,hours=$9,
          version=entry.version+1,updated_at=now()
         WHERE entry.id=$1 AND entry.version=$2 AND ($3::boolean OR entry.user_id=$4::uuid)
           AND (($6::text='task' AND entry.task_id=$10::uuid AND EXISTS (
             SELECT 1 FROM opsweave.tasks task WHERE task.id=entry.task_id
               AND task.workspace_id=$5 AND task.deleted_at IS NULL))
            OR ($6::text='project' AND EXISTS (SELECT 1 FROM opsweave.projects project
              WHERE project.id=$10::uuid AND project.workspace_id=$5 AND project.archived_at IS NULL)
              AND (entry.project_id=$10::uuid OR EXISTS (SELECT 1 FROM opsweave.tasks task
                WHERE task.id=entry.task_id AND task.project_id=$10::uuid))))
         RETURNING entry.task_id AS "taskId"`,
        [
          input.entryId,
          input.version,
          input.canManageAll,
          input.actorUserId,
          input.workspaceId,
          input.subjectType,
          input.entryDate,
          input.description,
          input.hours,
          input.subjectId,
        ],
      );
      if (updated.rowCount !== 1)
        throw new StoreConflictError("The time entry changed or is unavailable.");
      const taskId = updated.rows[0]?.taskId ?? null;
      if (taskId !== null) await recalculateTaskHours(client, taskId);
      await insertAudit(client, {
        action: `${input.subjectType}.time_entry.updated`,
        actorUserId: input.actorUserId,
        category: "timesheet",
        metadata: { date: input.entryDate, hours: input.hours },
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        userGenerated: true,
        visibility: "authorised_participants",
        workspaceId: input.workspaceId,
      });
    });
  }

  public async deleteTimeEntry(input: {
    actorUserId: string;
    canManageAll: boolean;
    entryId: string;
    subjectId: string;
    subjectType: AccessSubjectType;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const removed = await client.query<{ hours: number; taskId: string | null }>(
        `DELETE FROM opsweave.task_time_entries entry
         WHERE entry.id=$1 AND ($2::boolean OR entry.user_id=$3::uuid)
           AND (($5::text='task' AND entry.task_id=$6::uuid AND EXISTS (
             SELECT 1 FROM opsweave.tasks task WHERE task.id=entry.task_id
               AND task.workspace_id=$4 AND task.deleted_at IS NULL))
            OR ($5::text='project' AND EXISTS (SELECT 1 FROM opsweave.projects project
              WHERE project.id=$6::uuid AND project.workspace_id=$4 AND project.archived_at IS NULL)
              AND (entry.project_id=$6::uuid OR EXISTS (SELECT 1 FROM opsweave.tasks task
                WHERE task.id=entry.task_id AND task.project_id=$6::uuid))))
         RETURNING entry.task_id AS "taskId",entry.hours::float8 AS hours`,
        [
          input.entryId,
          input.canManageAll,
          input.actorUserId,
          input.workspaceId,
          input.subjectType,
          input.subjectId,
        ],
      );
      const entry = removed.rows[0];
      if (entry === undefined) throw new StoreConflictError("The time entry is unavailable.");
      if (entry.taskId !== null) await recalculateTaskHours(client, entry.taskId);
      await insertAudit(client, {
        action: `${input.subjectType}.time_entry.deleted`,
        actorUserId: input.actorUserId,
        category: "timesheet",
        metadata: { hours: entry.hours },
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        userGenerated: true,
        visibility: "authorised_participants",
        workspaceId: input.workspaceId,
      });
    });
  }

  public async listUsers(workspaceId: string): Promise<CollaborationUserRecord[]> {
    const result = await this.pool.query<CollaborationUserRecord>(
      `SELECT "user".id AS "userId","user".email,"user".username,"user".full_name AS "fullName",
        "user".status AS "userStatus",membership.id AS "membershipId",membership.role,
        membership.status AS "membershipStatus",membership.created_at AS "createdAt",
        count(access.id) FILTER (WHERE access.status='active' AND
          (access.expires_at IS NULL OR access.expires_at>now()))::int AS "activeGrantCount"
       FROM opsweave.workspace_memberships membership
       JOIN opsweave.users "user" ON "user".id=membership.user_id
       LEFT JOIN opsweave.access_grants access ON access.workspace_id=membership.workspace_id
         AND access.delegate_user_id="user".id
       WHERE membership.workspace_id=$1
       GROUP BY "user".id,membership.id
       ORDER BY CASE membership.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
         coalesce("user".full_name,"user".email,"user".username),"user".id`,
      [workspaceId],
    );
    return result.rows;
  }

  public async listDelegationBadges(workspaceId: string): Promise<DelegationBadgeRecord[]> {
    const result = await this.pool.query<{
      alias: string | null;
      displayName: string;
      profileDescription: string | null;
      status: "active" | "invite_pending";
      subjectId: string;
      subjectType: AccessSubjectType;
    }>(
      `SELECT access.subject_type AS "subjectType",
        coalesce(access.subject_project_id,access.subject_task_id) AS "subjectId",
        coalesce("user".full_name,access.delegate_email) AS "displayName",alias.alias,
        access.profile_description AS "profileDescription",access.status,
        access.created_at AS "grantCreatedAt",access.id AS "grantId"
       FROM opsweave.access_grants access
       LEFT JOIN opsweave.users "user" ON "user".id=access.delegate_user_id
       LEFT JOIN opsweave.tasks task ON task.id=access.subject_task_id
       LEFT JOIN opsweave.delegation_aliases alias ON alias.user_id=access.delegate_user_id
         AND alias.retired_at IS NULL AND ((alias.context_type='project'
           AND alias.context_project_id=coalesce(access.subject_project_id,task.project_id))
           OR (alias.context_type='task' AND alias.context_task_id=access.subject_task_id))
       WHERE access.workspace_id=$1 AND access.status IN ('active','invite_pending')
         AND (access.expires_at IS NULL OR access.expires_at>now())
       UNION ALL
       SELECT 'task'::varchar AS "subjectType",shared_task.id AS "subjectId",
        coalesce("user".full_name,access.delegate_email) AS "displayName",alias.alias,
        access.profile_description AS "profileDescription",access.status,
        access.created_at AS "grantCreatedAt",access.id AS "grantId"
       FROM opsweave.access_grants access
       JOIN opsweave.tasks shared_task ON shared_task.project_id=access.subject_project_id
         AND shared_task.workspace_id=access.workspace_id AND shared_task.deleted_at IS NULL
       LEFT JOIN opsweave.users "user" ON "user".id=access.delegate_user_id
       LEFT JOIN opsweave.task_delegate_audience audience ON audience.task_id=shared_task.id
         AND audience.user_id=access.delegate_user_id
       LEFT JOIN opsweave.delegation_aliases alias ON alias.user_id=access.delegate_user_id
         AND alias.context_type='project' AND alias.context_project_id=access.subject_project_id
         AND alias.retired_at IS NULL
       WHERE access.workspace_id=$1 AND access.subject_type='project'
         AND access.status IN ('active','invite_pending')
         AND (access.expires_at IS NULL OR access.expires_at>now())
         AND (shared_task.delegate_visibility='project_delegates'
           OR (shared_task.delegate_visibility='selected_delegates' AND audience.user_id IS NOT NULL)
           OR shared_task.created_by_user_id=access.delegate_user_id)
       ORDER BY "subjectType","subjectId","grantCreatedAt","grantId"`,
      [workspaceId],
    );
    const grouped = new Map<string, DelegationBadgeRecord>();
    for (const row of result.rows) {
      const key = `${row.subjectType}:${row.subjectId}`;
      const current = grouped.get(key);
      const delegate = {
        alias: row.alias,
        displayName: row.displayName,
        profileDescription: row.profileDescription,
        status: row.status,
      };
      if (
        current?.delegates.some(
          (candidate) =>
            candidate.displayName === delegate.displayName && candidate.alias === delegate.alias,
        )
      )
        continue;
      grouped.set(
        key,
        current === undefined
          ? { delegates: [delegate], subjectId: row.subjectId, subjectType: row.subjectType }
          : { ...current, delegates: [...current.delegates, delegate] },
      );
    }
    return [...grouped.values()];
  }

  public async getEmailDeliveryConfiguration(
    workspaceId: string,
  ): Promise<EmailDeliveryConfigurationRecord> {
    const result = await this.pool.query<{
      endpoint: string;
      tokenConfigured: boolean;
      updatedAt: Date;
    }>(
      `SELECT endpoint,encrypted_token IS NOT NULL AS "tokenConfigured",updated_at AS "updatedAt"
       FROM opsweave.email_delivery_settings WHERE workspace_id=$1`,
      [workspaceId],
    );
    const configuration = result.rows[0];
    return configuration === undefined
      ? { configured: false, endpoint: null, tokenConfigured: false, updatedAt: null }
      : { configured: true, ...configuration };
  }

  public async getEmailDeliveryRuntimeConfiguration(workspaceId: string): Promise<{
    encryptedToken: string | null;
    endpoint: string;
  } | null> {
    const result = await this.pool.query<{ encryptedToken: string | null; endpoint: string }>(
      `SELECT endpoint,encrypted_token AS "encryptedToken"
       FROM opsweave.email_delivery_settings WHERE workspace_id=$1`,
      [workspaceId],
    );
    return result.rows[0] ?? null;
  }

  public async saveEmailDeliveryConfiguration(input: {
    actorUserId: string;
    encryptedToken?: string;
    endpoint: string;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO opsweave.email_delivery_settings
          (workspace_id,endpoint,encrypted_token,configured_by_user_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (workspace_id) DO UPDATE SET endpoint=EXCLUDED.endpoint,
           encrypted_token=CASE WHEN $5::boolean THEN EXCLUDED.encrypted_token
             ELSE opsweave.email_delivery_settings.encrypted_token END,
           configured_by_user_id=EXCLUDED.configured_by_user_id,updated_at=now()`,
        [
          input.workspaceId,
          input.endpoint,
          input.encryptedToken ?? null,
          input.actorUserId,
          input.encryptedToken !== undefined,
        ],
      );
      await insertAudit(client, {
        action: "settings.email_delivery.updated",
        actorUserId: input.actorUserId,
        category: "access",
        metadata: {
          endpointHost: new URL(input.endpoint).host,
          tokenChanged: input.encryptedToken !== undefined,
        },
        subjectId: input.workspaceId,
        subjectType: "workspace",
        workspaceId: input.workspaceId,
      });
    });
  }

  public async deleteEmailDeliveryConfiguration(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query("DELETE FROM opsweave.email_delivery_settings WHERE workspace_id=$1", [
        input.workspaceId,
      ]);
      await insertAudit(client, {
        action: "settings.email_delivery.removed",
        actorUserId: input.actorUserId,
        category: "access",
        subjectId: input.workspaceId,
        subjectType: "workspace",
        workspaceId: input.workspaceId,
      });
    });
  }

  public async createAccessGrant(input: {
    accessRole: AccessRole;
    actorUserId: string;
    anonymise?: boolean;
    delegateEmail: string;
    delegationNote: string | null;
    privacyKeywords?: readonly string[];
    profileDescription?: string | null;
    encryptedInvitationPayload: string | null;
    expiresAt: Date | null;
    invitationExpiresAt: Date;
    invitationTokenDigest: string;
    subjectId: string;
    subjectType: AccessSubjectType;
    workspaceId: string;
  }): Promise<{ grant: AccessGrantRecord; tokenId: string }> {
    return transaction(this.pool, async (client) => {
      const subject = await client.query<{ anonymised: boolean; sourceVersion: number }>(
        input.subjectType === "project"
          ? `SELECT anonymise_delegation AS anonymised,version AS "sourceVersion"
             FROM opsweave.projects WHERE id=$1 AND workspace_id=$2
               AND archived_at IS NULL FOR UPDATE`
          : `SELECT anonymise_delegation AS anonymised,version AS "sourceVersion"
             FROM opsweave.tasks WHERE id=$1 AND workspace_id=$2
               AND deleted_at IS NULL FOR UPDATE`,
        [input.subjectId, input.workspaceId],
      );
      if (subject.rowCount !== 1) throw new StoreConflictError("The shared item is unavailable.");
      if (input.anonymise === true && subject.rows[0]?.anonymised === false) {
        const changed = await client.query<{ sourceVersion: number }>(
          input.subjectType === "project"
            ? `UPDATE opsweave.projects SET anonymise_delegation=true,version=version+1,
                updated_at=now() WHERE id=$1 RETURNING version AS "sourceVersion"`
            : `UPDATE opsweave.tasks SET anonymise_delegation=true,version=version+1,
                updated_at=now() WHERE id=$1 RETURNING version AS "sourceVersion"`,
          [input.subjectId],
        );
        const sourceVersion = changed.rows[0]?.sourceVersion;
        if (sourceVersion === undefined) throw new Error("Anonymisation update failed.");
        await client.query(
          input.subjectType === "project"
            ? `INSERT INTO opsweave.delegate_entity_presentations
                (workspace_id,subject_project_id,source_version,safe_title,neutral_project_label,status)
               VALUES ($1,$2,$3,'Shared project','Project Atlas','draft')
               ON CONFLICT (subject_project_id) WHERE subject_project_id IS NOT NULL DO UPDATE SET
                 source_version=EXCLUDED.source_version,status='stale',approved_by_user_id=NULL,
                 approved_at=NULL,version=opsweave.delegate_entity_presentations.version+1,updated_at=now()`
            : `INSERT INTO opsweave.delegate_entity_presentations
                (workspace_id,subject_task_id,source_version,safe_title,status)
               VALUES ($1,$2,$3,'Shared task','draft')
               ON CONFLICT (subject_task_id) WHERE subject_task_id IS NOT NULL DO UPDATE SET
                 source_version=EXCLUDED.source_version,status='stale',approved_by_user_id=NULL,
                 approved_at=NULL,version=opsweave.delegate_entity_presentations.version+1,updated_at=now()`,
          [input.workspaceId, input.subjectId, sourceVersion],
        );
        await client.query(
          input.subjectType === "project"
            ? `INSERT INTO opsweave.protected_terms
                (workspace_id,context_project_id,term_type,value,normalized_value,created_by_user_id)
               SELECT $1,$2,candidate.term_type,candidate.value,lower(trim(candidate.value)),$3
               FROM opsweave.projects project
               LEFT JOIN opsweave.tasks task ON task.project_id=project.id AND task.deleted_at IS NULL
               CROSS JOIN LATERAL (VALUES ('company'::varchar,project.name),
                 ('client'::varchar,project.client_name),('other'::varchar,task.title))
                 candidate(term_type,value)
               WHERE project.id=$2 AND project.workspace_id=$1
                 AND candidate.value IS NOT NULL AND length(trim(candidate.value))>=2
               ON CONFLICT DO NOTHING`
            : `INSERT INTO opsweave.protected_terms
                (workspace_id,context_task_id,term_type,value,normalized_value,created_by_user_id)
               SELECT $1,$2,candidate.term_type,candidate.value,lower(trim(candidate.value)),$3
               FROM opsweave.tasks task LEFT JOIN opsweave.projects project ON project.id=task.project_id
               CROSS JOIN LATERAL (VALUES ('other'::varchar,task.title),
                 ('client'::varchar,task.client_name),('company'::varchar,project.name),
                 ('client'::varchar,project.client_name)) candidate(term_type,value)
               WHERE task.id=$2 AND task.workspace_id=$1
                 AND candidate.value IS NOT NULL AND length(trim(candidate.value))>=2
               ON CONFLICT DO NOTHING`,
          [input.workspaceId, input.subjectId, input.actorUserId],
        );
        await insertAudit(client, {
          action: "delegation.anonymisation.changed",
          actorUserId: input.actorUserId,
          category: "delegation",
          metadata: { enabled: true },
          subjectId: input.subjectId,
          subjectType: input.subjectType,
          workspaceId: input.workspaceId,
        });
      }
      const flags = await client.query<{ invitationEmailEnabled: boolean }>(
        `UPDATE opsweave.workspace_settings SET multi_user_enabled=true,version=version+1,
          updated_at=now() WHERE workspace_id=$1
         RETURNING invitation_email_enabled AS "invitationEmailEnabled"`,
        [input.workspaceId],
      );
      const user = await client.query<{ id: string }>(
        "SELECT id FROM opsweave.users WHERE normalized_email=$1",
        [input.delegateEmail],
      );
      const grantResult = await client.query<{ id: string }>(
        `INSERT INTO opsweave.access_grants
          (workspace_id,subject_type,subject_project_id,subject_task_id,delegate_user_id,
           delegate_email,normalized_delegate_email,scope,access_role,status,expires_at,
           granted_by_user_id,delegation_note,profile_description,privacy_keywords)
         VALUES ($1,$2::varchar(16),CASE WHEN $2::text='project' THEN $3::uuid END,
          CASE WHEN $2::text='task' THEN $3::uuid END,$4,$5,$5,$2::varchar(16),$6,
          'invite_pending',$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          input.workspaceId,
          input.subjectType,
          input.subjectId,
          user.rows[0]?.id ?? null,
          input.delegateEmail,
          input.accessRole,
          input.expiresAt,
          input.actorUserId,
          input.delegationNote,
          input.profileDescription ?? null,
          input.privacyKeywords ?? [],
        ],
      );
      const grantId = grantResult.rows[0]?.id;
      if (grantId === undefined) throw new Error("Access Grant creation failed.");
      const tokenResult = await client.query<{ id: string }>(
        `INSERT INTO opsweave.invitation_tokens
          (access_grant_id,token_digest,expires_at,created_by_user_id)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [grantId, input.invitationTokenDigest, input.invitationExpiresAt, input.actorUserId],
      );
      const tokenId = tokenResult.rows[0]?.id;
      if (tokenId === undefined) throw new Error("Invitation token creation failed.");
      if (
        input.encryptedInvitationPayload !== null &&
        (flags.rows[0]?.invitationEmailEnabled ?? false)
      ) {
        await client.query(
          `INSERT INTO opsweave.notification_outbox
            (workspace_id,invitation_token_id,recipient_user_id,recipient_email,template_key,
             encrypted_payload,idempotency_key)
           VALUES ($1,$2,$3,$4,'access_invitation',$5,$6)`,
          [
            input.workspaceId,
            tokenId,
            user.rows[0]?.id ?? null,
            input.delegateEmail,
            input.encryptedInvitationPayload,
            `invite:${tokenId}`,
          ],
        );
      }
      await insertAudit(client, {
        action: "access.invitation.created",
        actorUserId: input.actorUserId,
        category: "delegation",
        metadata: { accessRole: input.accessRole, grantId, scope: input.subjectType },
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        workspaceId: input.workspaceId,
      });
      const rows = await client.query<Record<string, unknown>>(
        `${grantSelect} WHERE access.id=$1 AND access.workspace_id=$2`,
        [grantId, input.workspaceId],
      );
      const row = rows.rows[0];
      if (row === undefined) throw new Error("Access Grant reload failed.");
      return { grant: mapGrant(row), tokenId };
    });
  }

  public async replaceAccessGrant(input: {
    accessRole?: AccessRole;
    actorUserId: string;
    delegateEmail: string;
    delegationNote?: string | null;
    privacyKeywords?: readonly string[];
    profileDescription?: string | null;
    encryptedInvitationPayload: string | null;
    expiresAt?: Date | null;
    grantId: string;
    invitationExpiresAt: Date;
    invitationTokenDigest: string;
    version: number;
    workspaceId: string;
  }): Promise<{ grant: AccessGrantRecord; tokenId: string }> {
    return transaction(this.pool, async (client) => {
      const current = await client.query<{
        accessRole: AccessRole;
        delegateUserId: string | null;
        delegationNote: string | null;
        privacyKeywords: string[];
        profileDescription: string | null;
        expiresAt: Date | null;
        normalizedDelegateEmail: string;
        subjectId: string;
        subjectType: AccessSubjectType;
      }>(
        `SELECT access_role AS "accessRole",delegate_user_id AS "delegateUserId",
          delegation_note AS "delegationNote",profile_description AS "profileDescription",
          privacy_keywords AS "privacyKeywords",expires_at AS "expiresAt",
          normalized_delegate_email AS "normalizedDelegateEmail",subject_type AS "subjectType",
          coalesce(subject_project_id,subject_task_id) AS "subjectId"
         FROM opsweave.access_grants
         WHERE id=$1 AND workspace_id=$2 AND version=$3
           AND status IN ('invite_pending','active') FOR UPDATE`,
        [input.grantId, input.workspaceId, input.version],
      );
      const previous = current.rows[0];
      if (previous === undefined) throw new StoreConflictError("The Access Grant changed.");
      if (previous.normalizedDelegateEmail === input.delegateEmail) {
        throw new StoreConflictError("Choose a different delegate email address.");
      }
      const accessRole = input.accessRole ?? previous.accessRole;
      if (accessRole === "project_collaborator" && previous.subjectType !== "project") {
        throw new StoreConflictError("Project collaborator access requires project scope.");
      }
      const user = await client.query<{ id: string }>(
        "SELECT id FROM opsweave.users WHERE normalized_email=$1",
        [input.delegateEmail],
      );
      const replacementUserId = user.rows[0]?.id ?? null;
      await client.query(
        `UPDATE opsweave.access_grants SET status='revoked',revoked_by_user_id=$2,
          revoked_at=now(),version=version+1,updated_at=now() WHERE id=$1`,
        [input.grantId, input.actorUserId],
      );
      await client.query(
        `UPDATE opsweave.invitation_tokens SET invalidated_at=now()
         WHERE access_grant_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
        [input.grantId],
      );
      await client.query(
        `UPDATE opsweave.notification_outbox outbox SET state='cancelled',cancelled_at=now(),
          encrypted_payload=NULL,updated_at=now()
         FROM opsweave.invitation_tokens token WHERE token.access_grant_id=$1
           AND outbox.invitation_token_id=token.id AND outbox.state IN ('pending','processing')`,
        [input.grantId],
      );
      await client.query(
        `UPDATE opsweave.task_assignments SET active=false,ended_at=now(),updated_at=now()
         WHERE access_grant_id=$1 AND active`,
        [input.grantId],
      );
      if (previous.delegateUserId !== null) {
        await client.query(
          "UPDATE opsweave.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
          [previous.delegateUserId],
        );
        await client.query(
          `UPDATE opsweave.notifications SET state='cancelled',cancelled_at=now(),updated_at=now()
           WHERE recipient_user_id=$1 AND state IN ('unread','read') AND
             (route_id=$2 OR ($3='project' AND route_type='task' AND route_id IN
               (SELECT id FROM opsweave.tasks WHERE project_id=$2)))`,
          [previous.delegateUserId, previous.subjectId, previous.subjectType],
        );
      }
      const replacement = await client.query<{ id: string }>(
        `INSERT INTO opsweave.access_grants
          (workspace_id,subject_type,subject_project_id,subject_task_id,delegate_user_id,
           delegate_email,normalized_delegate_email,scope,access_role,status,expires_at,
           granted_by_user_id,delegation_note,profile_description,privacy_keywords)
         VALUES ($1,$2::varchar(16),CASE WHEN $2::text='project' THEN $3::uuid END,
          CASE WHEN $2::text='task' THEN $3::uuid END,$4,$5,$5,$2::varchar(16),$6,
          'invite_pending',$7,$8,$9,$10,$11) RETURNING id`,
        [
          input.workspaceId,
          previous.subjectType,
          previous.subjectId,
          replacementUserId,
          input.delegateEmail,
          accessRole,
          input.expiresAt === undefined ? previous.expiresAt : input.expiresAt,
          input.actorUserId,
          input.delegationNote === undefined ? previous.delegationNote : input.delegationNote,
          input.profileDescription === undefined
            ? previous.profileDescription
            : input.profileDescription,
          input.privacyKeywords ?? previous.privacyKeywords,
        ],
      );
      const replacementGrantId = replacement.rows[0]?.id;
      if (replacementGrantId === undefined) throw new Error("Access Grant replacement failed.");
      const token = await client.query<{ id: string }>(
        `INSERT INTO opsweave.invitation_tokens
          (access_grant_id,token_digest,expires_at,created_by_user_id)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [
          replacementGrantId,
          input.invitationTokenDigest,
          input.invitationExpiresAt,
          input.actorUserId,
        ],
      );
      const tokenId = token.rows[0]?.id;
      if (tokenId === undefined) throw new Error("Invitation token creation failed.");
      const settings = await client.query<{ invitationEmailEnabled: boolean }>(
        `SELECT invitation_email_enabled AS "invitationEmailEnabled"
         FROM opsweave.workspace_settings WHERE workspace_id=$1`,
        [input.workspaceId],
      );
      if (
        input.encryptedInvitationPayload !== null &&
        (settings.rows[0]?.invitationEmailEnabled ?? false)
      ) {
        await client.query(
          `INSERT INTO opsweave.notification_outbox
            (workspace_id,invitation_token_id,recipient_user_id,recipient_email,template_key,
             encrypted_payload,idempotency_key)
           VALUES ($1,$2,$3,$4,'access_invitation',$5,$6)`,
          [
            input.workspaceId,
            tokenId,
            replacementUserId,
            input.delegateEmail,
            input.encryptedInvitationPayload,
            `invite:${tokenId}`,
          ],
        );
      }
      await insertAudit(client, {
        action: "access.delegate.changed",
        actorUserId: input.actorUserId,
        category: "delegation",
        metadata: { previousGrantId: input.grantId, replacementGrantId },
        occurredForUserId: previous.delegateUserId,
        subjectId: previous.subjectId,
        subjectType: previous.subjectType,
        workspaceId: input.workspaceId,
      });
      const rows = await client.query<Record<string, unknown>>(
        `${grantSelect} WHERE access.id=$1 AND access.workspace_id=$2`,
        [replacementGrantId, input.workspaceId],
      );
      const row = rows.rows[0];
      if (row === undefined) throw new Error("Access Grant reload failed.");
      return { grant: mapGrant(row), tokenId };
    });
  }

  public async inspectInvitation(
    tokenDigest: string,
    now = new Date(),
  ): Promise<InvitationRecord | null> {
    const result = await this.pool.query<InvitationRecord>(
      `SELECT token.id AS "tokenId",access.id AS "accessGrantId",access.workspace_id AS "workspaceId",
        CASE WHEN coalesce(project.anonymise_delegation,false) OR coalesce(task.anonymise_delegation,false)
          THEN 'OpsWeave workspace' ELSE workspace.display_name END AS "workspaceDisplayName",
        access.subject_type AS "subjectType",
        coalesce(access.subject_project_id,access.subject_task_id) AS "subjectId",
        CASE WHEN coalesce(project.anonymise_delegation,false) OR coalesce(task.anonymise_delegation,false)
          THEN coalesce(task_presentation.safe_title,project_presentation.safe_title,'Shared work')
          ELSE coalesce(project.name,task.title) END AS "subjectTitle",
        CASE WHEN project.anonymise_delegation THEN
          coalesce(project_presentation.safe_title,'Shared project') ELSE project.name END AS "projectName",
        access.delegate_email AS "delegateEmail",access.delegate_user_id AS "delegateUserId",
        access.access_role AS "accessRole",access.status AS "grantStatus",access.expires_at AS "expiresAt",
        token.expires_at AS "invitationExpiresAt"
       FROM opsweave.invitation_tokens token
       JOIN opsweave.access_grants access ON access.id=token.access_grant_id
       JOIN opsweave.workspaces workspace ON workspace.id=access.workspace_id
       LEFT JOIN opsweave.tasks task ON task.id=access.subject_task_id
       LEFT JOIN opsweave.projects project ON project.id=coalesce(access.subject_project_id,task.project_id)
       LEFT JOIN opsweave.delegate_entity_presentations project_presentation
         ON project_presentation.subject_project_id=project.id AND project_presentation.status='approved'
       LEFT JOIN opsweave.delegate_entity_presentations task_presentation
         ON task_presentation.subject_task_id=task.id AND task_presentation.status='approved'
       WHERE token.token_digest=$1 AND token.consumed_at IS NULL AND token.invalidated_at IS NULL
         AND token.expires_at>$2 AND access.status='invite_pending'
         AND (access.expires_at IS NULL OR access.expires_at>$2)`,
      [tokenDigest, now],
    );
    return result.rows[0] ?? null;
  }

  public async declineInvitation(tokenDigest: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      const declined = await client.query<{
        delegateUserId: string | null;
        grantId: string;
        subjectId: string;
        subjectType: AccessSubjectType;
        tokenId: string;
        workspaceId: string;
      }>(
        `WITH selected AS (
           SELECT token.id AS token_id,access.id AS grant_id,access.workspace_id,
             access.delegate_user_id,access.subject_type,
             coalesce(access.subject_project_id,access.subject_task_id) AS subject_id
           FROM opsweave.invitation_tokens token
           JOIN opsweave.access_grants access ON access.id=token.access_grant_id
           WHERE token.token_digest=$1 AND token.consumed_at IS NULL
             AND token.invalidated_at IS NULL AND token.expires_at>now()
             AND access.status='invite_pending'
             AND (access.expires_at IS NULL OR access.expires_at>now())
           FOR UPDATE OF token,access
         ), changed AS (
           UPDATE opsweave.access_grants access SET status='declined',version=version+1,
             updated_at=now() FROM selected WHERE access.id=selected.grant_id
           RETURNING access.id
         )
         SELECT selected.token_id AS "tokenId",selected.grant_id AS "grantId",
           selected.workspace_id AS "workspaceId",selected.delegate_user_id AS "delegateUserId",
           selected.subject_type AS "subjectType",selected.subject_id AS "subjectId"
         FROM selected JOIN changed ON changed.id=selected.grant_id`,
        [tokenDigest],
      );
      const invitation = declined.rows[0];
      if (invitation === undefined) {
        throw new StoreConflictError("The invitation is unavailable or has expired.");
      }
      await client.query(
        `UPDATE opsweave.invitation_tokens SET invalidated_at=now()
         WHERE access_grant_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
        [invitation.grantId],
      );
      await client.query(
        `UPDATE opsweave.notification_outbox outbox SET state='cancelled',cancelled_at=now(),
          encrypted_payload=NULL,updated_at=now()
         FROM opsweave.invitation_tokens token WHERE token.access_grant_id=$1
           AND outbox.invitation_token_id=token.id AND outbox.state IN ('pending','processing')`,
        [invitation.grantId],
      );
      await insertAudit(client, {
        action: "access.invitation.declined",
        actorUserId: null,
        category: "delegation",
        metadata: { grantId: invitation.grantId },
        occurredForUserId: invitation.delegateUserId,
        subjectId: invitation.subjectId,
        subjectType: invitation.subjectType,
        workspaceId: invitation.workspaceId,
      });
    });
  }

  public async acceptInvitation(input: {
    fullName?: string;
    passwordHash?: string;
    tokenDigest: string;
    userId?: string;
  }): Promise<{
    grantId: string;
    subjectId: string;
    subjectType: AccessSubjectType;
    userId: string;
  }> {
    return transaction(this.pool, async (client) => {
      const tokenResult = await client.query<
        InvitationRecord & { normalizedDelegateEmail: string }
      >(
        `SELECT token.id AS "tokenId",access.id AS "accessGrantId",access.workspace_id AS "workspaceId",
          access.subject_type AS "subjectType",coalesce(access.subject_project_id,access.subject_task_id) AS "subjectId",
          access.delegate_email AS "delegateEmail",access.normalized_delegate_email AS "normalizedDelegateEmail",
          access.delegate_user_id AS "delegateUserId",access.access_role AS "accessRole",
          access.status AS "grantStatus",access.expires_at AS "expiresAt",token.expires_at AS "invitationExpiresAt",
          ''::text AS "workspaceDisplayName",''::text AS "subjectTitle",NULL::text AS "projectName"
         FROM opsweave.invitation_tokens token
         JOIN opsweave.access_grants access ON access.id=token.access_grant_id
         WHERE token.token_digest=$1 FOR UPDATE OF token,access`,
        [input.tokenDigest],
      );
      const invitation = tokenResult.rows[0];
      const now = new Date();
      if (
        invitation?.grantStatus !== "invite_pending" ||
        invitation.invitationExpiresAt.getTime() <= now.getTime() ||
        (invitation.expiresAt !== null && invitation.expiresAt.getTime() <= now.getTime())
      ) {
        throw new StoreConflictError("The invitation is unavailable or has expired.");
      }
      const tokenState = await client.query<{
        consumedAt: Date | null;
        invalidatedAt: Date | null;
      }>(
        'SELECT consumed_at AS "consumedAt",invalidated_at AS "invalidatedAt" FROM opsweave.invitation_tokens WHERE id=$1',
        [invitation.tokenId],
      );
      const currentTokenState = tokenState.rows[0];
      if (currentTokenState?.consumedAt !== null || currentTokenState.invalidatedAt !== null) {
        throw new StoreConflictError("The invitation is unavailable or has expired.");
      }
      let userId = input.userId;
      if (userId !== undefined) {
        const user = await client.query<{ normalizedEmail: string | null }>(
          "SELECT normalized_email AS \"normalizedEmail\" FROM opsweave.users WHERE id=$1 AND status='active'",
          [userId],
        );
        if (user.rows[0]?.normalizedEmail !== invitation.normalizedDelegateEmail) {
          throw new StoreConflictError("Sign in with the account that received this invitation.");
        }
      } else {
        if (input.passwordHash === undefined || input.fullName === undefined) {
          throw new StoreConflictError("Account details are required.");
        }
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM opsweave.users WHERE normalized_email=$1",
          [invitation.normalizedDelegateEmail],
        );
        if (existing.rows[0] !== undefined) {
          throw new StoreConflictError("Sign in to accept this invitation.");
        }
        const userResult = await client.query<{ id: string }>(
          `INSERT INTO opsweave.users (email,normalized_email,full_name,status)
           VALUES ($1,$2,$3,'active') RETURNING id`,
          [invitation.delegateEmail, invitation.normalizedDelegateEmail, input.fullName],
        );
        userId = userResult.rows[0]?.id;
        if (userId === undefined) throw new Error("Invited user creation failed.");
        await client.query(
          `INSERT INTO opsweave.user_credentials
            (user_id,password_hash,password_algorithm,password_parameters)
           VALUES ($1,$2,'argon2id-v19',$3::jsonb)`,
          [
            userId,
            input.passwordHash,
            JSON.stringify({ memoryCost: 19_456, outputLen: 32, parallelism: 1, timeCost: 2 }),
          ],
        );
      }
      const membershipResult = await client.query<{ id: string }>(
        `INSERT INTO opsweave.workspace_memberships
          (workspace_id,user_id,role,status,activated_at,lifecycle_actor_user_id)
         VALUES ($1,$2,'delegate','active',now(),$2)
         ON CONFLICT (workspace_id,user_id) DO UPDATE SET status='active',activated_at=coalesce(
          opsweave.workspace_memberships.activated_at,now()),deactivated_at=NULL,archived_at=NULL,
          authorization_version=opsweave.workspace_memberships.authorization_version+1,updated_at=now()
         RETURNING id`,
        [invitation.workspaceId, userId],
      );
      const membershipId = membershipResult.rows[0]?.id;
      if (membershipId === undefined) throw new Error("Workspace membership activation failed.");
      await seedDelegateStages(client, membershipId);
      await client.query(
        `UPDATE opsweave.access_grants SET delegate_user_id=$2,status='active',activated_at=now(),
          version=version+1,updated_at=now() WHERE id=$1`,
        [invitation.accessGrantId, userId],
      );
      await client.query("UPDATE opsweave.invitation_tokens SET consumed_at=now() WHERE id=$1", [
        invitation.tokenId,
      ]);
      await client.query(
        `UPDATE opsweave.notification_outbox SET state='cancelled',cancelled_at=now(),
          encrypted_payload=NULL,updated_at=now()
         WHERE invitation_token_id=$1 AND state IN ('pending','processing')`,
        [invitation.tokenId],
      );
      if (invitation.subjectType === "task") {
        const assignmentRole = invitation.accessRole === "reviewer" ? "review" : "delivery";
        const assignmentResult = await client.query<{ id: string }>(
          `INSERT INTO opsweave.task_assignments
            (task_id,user_id,access_grant_id,assignment_role,created_by_user_id)
           SELECT subject_task_id,$2,id,$3,granted_by_user_id FROM opsweave.access_grants WHERE id=$1
           ON CONFLICT (task_id,user_id) WHERE active DO UPDATE SET
             access_grant_id=EXCLUDED.access_grant_id,assignment_role=EXCLUDED.assignment_role,
             updated_at=now() RETURNING id`,
          [invitation.accessGrantId, userId, assignmentRole],
        );
        if (assignmentRole === "delivery") {
          await client.query(
            `UPDATE opsweave.tasks task SET pre_delegation_lane=CASE WHEN task.workflow_lane='delegated'
              THEN task.pre_delegation_lane ELSE task.workflow_lane END,workflow_lane='delegated',
              owner_work_assigned=false,version=task.version+1,updated_at=now()
             FROM opsweave.access_grants access WHERE access.id=$1 AND task.id=access.subject_task_id`,
            [invitation.accessGrantId],
          );
        }
        const firstStage = await client.query<{ id: string }>(
          `SELECT id FROM opsweave.delegate_kanban_stages
           WHERE membership_id=$1 AND semantic_kind=$2 AND archived_at IS NULL LIMIT 1`,
          [membershipId, invitation.accessRole === "reviewer" ? "waiting_for_input" : "assigned"],
        );
        await client.query(
          `INSERT INTO opsweave.delegate_task_states
            (task_id,user_id,task_assignment_id,stage_id)
           SELECT subject_task_id,$2,$3,$4 FROM opsweave.access_grants WHERE id=$1
           ON CONFLICT (task_id,user_id) DO UPDATE SET task_assignment_id=EXCLUDED.task_assignment_id,
             stage_id=EXCLUDED.stage_id,updated_at=now()`,
          [
            invitation.accessGrantId,
            userId,
            assignmentResult.rows[0]?.id ?? null,
            firstStage.rows[0]?.id,
          ],
        );
      }
      await insertAudit(client, {
        action: "access.invitation.accepted",
        actorUserId: userId,
        category: "delegation",
        metadata: { grantId: invitation.accessGrantId },
        occurredForUserId: userId,
        subjectId: invitation.subjectId,
        subjectType: invitation.subjectType,
        visibility: "authorised_participants",
        workspaceId: invitation.workspaceId,
      });
      return {
        grantId: invitation.accessGrantId,
        subjectId: invitation.subjectId,
        subjectType: invitation.subjectType,
        userId,
      };
    });
  }

  public async revokeAccessGrant(
    workspaceId: string,
    actorUserId: string,
    grantId: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const result = await client.query<{
        delegateUserId: string | null;
        subjectId: string;
        subjectType: AccessSubjectType;
      }>(
        `UPDATE opsweave.access_grants SET status='revoked',revoked_by_user_id=$2,
          revoked_at=now(),version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$3 AND status IN ('invite_pending','active')
         RETURNING delegate_user_id AS "delegateUserId",subject_type AS "subjectType",
          coalesce(subject_project_id,subject_task_id) AS "subjectId"`,
        [grantId, actorUserId, workspaceId],
      );
      const grant = result.rows[0];
      if (grant === undefined) throw new StoreConflictError("The Access Grant is unavailable.");
      await client.query(
        "UPDATE opsweave.invitation_tokens SET invalidated_at=now() WHERE access_grant_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL",
        [grantId],
      );
      await client.query(
        `UPDATE opsweave.notification_outbox outbox SET state='cancelled',cancelled_at=now(),
          encrypted_payload=NULL,updated_at=now()
         FROM opsweave.invitation_tokens token WHERE token.access_grant_id=$1
           AND outbox.invitation_token_id=token.id AND outbox.state IN ('pending','processing')`,
        [grantId],
      );
      await client.query(
        `UPDATE opsweave.task_assignments SET active=false,ended_at=now(),updated_at=now()
         WHERE access_grant_id=$1 AND active`,
        [grantId],
      );
      if (grant.delegateUserId !== null) {
        await client.query(
          "UPDATE opsweave.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
          [grant.delegateUserId],
        );
        await client.query(
          `UPDATE opsweave.notifications SET state='cancelled',cancelled_at=now(),updated_at=now()
           WHERE recipient_user_id=$1 AND state IN ('unread','read') AND
             (route_id=$2 OR ($3='project' AND route_type='task' AND route_id IN
               (SELECT id FROM opsweave.tasks WHERE project_id=$2)))`,
          [grant.delegateUserId, grant.subjectId, grant.subjectType],
        );
      }
      await insertAudit(client, {
        action: "access.revoked",
        actorUserId,
        category: "delegation",
        metadata: { grantId },
        occurredForUserId: grant.delegateUserId,
        subjectId: grant.subjectId,
        subjectType: grant.subjectType,
        workspaceId,
      });
    });
  }

  public async updateAccessGrant(input: {
    accessRole?: AccessRole;
    actorUserId: string;
    delegationNote?: string | null;
    privacyKeywords?: readonly string[];
    profileDescription?: string | null;
    expiresAt?: Date | null;
    grantId: string;
    version: number;
    workspaceId: string;
  }): Promise<AccessGrantRecord> {
    return transaction(this.pool, async (client) => {
      const current = await client.query<{
        subjectId: string;
        subjectType: AccessSubjectType;
      }>(
        `SELECT subject_type AS "subjectType",coalesce(subject_project_id,subject_task_id) AS "subjectId"
         FROM opsweave.access_grants WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [input.grantId, input.workspaceId],
      );
      const subject = current.rows[0];
      if (subject === undefined) throw new StoreConflictError("The Access Grant is unavailable.");
      if (input.accessRole === "project_collaborator" && subject.subjectType !== "project") {
        throw new StoreConflictError("Project collaborator access requires project scope.");
      }
      const updated = await client.query(
        `UPDATE opsweave.access_grants SET
          access_role=coalesce($4,access_role),
          expires_at=CASE WHEN $5::boolean THEN $6::timestamptz ELSE expires_at END,
          delegation_note=CASE WHEN $7::boolean THEN $8::text ELSE delegation_note END,
          profile_description=CASE WHEN $9::boolean THEN $10::text ELSE profile_description END,
          privacy_keywords=CASE WHEN $11::boolean THEN $12::text[] ELSE privacy_keywords END,
          version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND version=$3 AND status IN ('invite_pending','active')`,
        [
          input.grantId,
          input.workspaceId,
          input.version,
          input.accessRole ?? null,
          input.expiresAt !== undefined,
          input.expiresAt ?? null,
          input.delegationNote !== undefined,
          input.delegationNote ?? null,
          input.profileDescription !== undefined,
          input.profileDescription ?? null,
          input.privacyKeywords !== undefined,
          input.privacyKeywords ?? [],
        ],
      );
      if (updated.rowCount !== 1) throw new StoreConflictError("The Access Grant changed.");
      if (input.accessRole !== undefined) {
        await client.query(
          `UPDATE opsweave.task_assignments SET assignment_role=$2,updated_at=now()
           WHERE access_grant_id=$1 AND active`,
          [input.grantId, input.accessRole === "reviewer" ? "review" : "delivery"],
        );
      }
      if (
        input.expiresAt !== undefined &&
        input.expiresAt !== null &&
        input.expiresAt <= new Date()
      ) {
        await client.query(
          `UPDATE opsweave.access_grants SET status='expired',version=version+1,updated_at=now()
           WHERE id=$1`,
          [input.grantId],
        );
      }
      await insertAudit(client, {
        action: "access.updated",
        actorUserId: input.actorUserId,
        category: "delegation",
        metadata: {
          accessRole: input.accessRole,
          delegationNoteChanged: input.delegationNote !== undefined,
          privacyKeywordsChanged: input.privacyKeywords !== undefined,
          profileDescriptionChanged: input.profileDescription !== undefined,
          expiresAt: input.expiresAt,
          grantId: input.grantId,
        },
        subjectId: subject.subjectId,
        subjectType: subject.subjectType,
        workspaceId: input.workspaceId,
      });
      const rows = await client.query<Record<string, unknown>>(
        `${grantSelect} WHERE access.id=$1 AND access.workspace_id=$2`,
        [input.grantId, input.workspaceId],
      );
      const row = rows.rows[0];
      if (row === undefined) throw new Error("Access Grant reload failed.");
      return mapGrant(row);
    });
  }

  public async reissueInvitation(input: {
    actorUserId: string;
    encryptedInvitationPayload: string | null;
    grantId: string;
    invitationExpiresAt: Date;
    invitationTokenDigest: string;
    workspaceId: string;
  }): Promise<string> {
    return transaction(this.pool, async (client) => {
      const grant = await client.query<{
        delegateEmail: string;
        delegateUserId: string | null;
        invitationEmailEnabled: boolean;
        subjectId: string;
        subjectType: AccessSubjectType;
      }>(
        `SELECT delegate_email AS "delegateEmail",delegate_user_id AS "delegateUserId",
          subject_type AS "subjectType",coalesce(subject_project_id,subject_task_id) AS "subjectId",
          settings.invitation_email_enabled AS "invitationEmailEnabled"
         FROM opsweave.access_grants access
         JOIN opsweave.workspace_settings settings ON settings.workspace_id=access.workspace_id
         WHERE access.id=$1 AND access.workspace_id=$2 AND access.status='invite_pending'
         FOR UPDATE`,
        [input.grantId, input.workspaceId],
      );
      const record = grant.rows[0];
      if (record === undefined)
        throw new StoreConflictError("The pending invitation is unavailable.");
      await client.query(
        `UPDATE opsweave.invitation_tokens SET invalidated_at=now()
         WHERE access_grant_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
        [input.grantId],
      );
      const token = await client.query<{ id: string }>(
        `INSERT INTO opsweave.invitation_tokens
          (access_grant_id,token_digest,expires_at,created_by_user_id)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [input.grantId, input.invitationTokenDigest, input.invitationExpiresAt, input.actorUserId],
      );
      const tokenId = token.rows[0]?.id;
      if (tokenId === undefined) throw new Error("Invitation token creation failed.");
      await client.query(
        `UPDATE opsweave.notification_outbox outbox SET state='cancelled',cancelled_at=now(),
          encrypted_payload=NULL,updated_at=now()
         FROM opsweave.invitation_tokens invitation
         WHERE invitation.access_grant_id=$1 AND outbox.invitation_token_id=invitation.id
           AND outbox.invitation_token_id<>$2 AND outbox.state IN ('pending','processing')`,
        [input.grantId, tokenId],
      );
      if (input.encryptedInvitationPayload !== null && record.invitationEmailEnabled) {
        await client.query(
          `INSERT INTO opsweave.notification_outbox
            (workspace_id,invitation_token_id,recipient_user_id,recipient_email,template_key,
             encrypted_payload,idempotency_key)
           VALUES ($1,$2,$3,$4,'access_invitation',$5,$6)`,
          [
            input.workspaceId,
            tokenId,
            record.delegateUserId,
            record.delegateEmail,
            input.encryptedInvitationPayload,
            `invite:${tokenId}`,
          ],
        );
      }
      await insertAudit(client, {
        action: "access.invitation.resent",
        actorUserId: input.actorUserId,
        category: "delegation",
        metadata: { grantId: input.grantId },
        subjectId: record.subjectId,
        subjectType: record.subjectType,
        workspaceId: input.workspaceId,
      });
      return tokenId;
    });
  }

  public async resolveAccess(
    workspaceId: string,
    userId: string,
    subjectType: AccessSubjectType,
    subjectId: string,
  ): Promise<AccessDecisionRecord | null> {
    const result = await this.pool.query<AccessDecisionRecord>(
      subjectType === "project"
        ? `SELECT access.id AS "grantId",access.access_role AS "accessRole",false AS inherited,
            project.anonymise_delegation AS anonymised,alias.alias
           FROM opsweave.access_grants access
           JOIN opsweave.projects project ON project.id=access.subject_project_id
           LEFT JOIN opsweave.delegation_aliases alias ON alias.user_id=$2
             AND alias.context_type='project' AND alias.context_project_id=project.id
             AND alias.retired_at IS NULL
           WHERE access.workspace_id=$1 AND access.delegate_user_id=$2
             AND access.subject_project_id=$3 AND access.status='active'
             AND (access.expires_at IS NULL OR access.expires_at>now()) LIMIT 1`
        : `SELECT candidate."grantId",candidate."accessRole",candidate.inherited,
            candidate.anonymised,alias.alias
           FROM (
             SELECT access.id AS "grantId",access.access_role AS "accessRole",false AS inherited,
               (project.anonymise_delegation OR task.anonymise_delegation) AS anonymised,
               CASE WHEN project.anonymise_delegation THEN project.id ELSE NULL END AS "aliasProjectId",
               CASE WHEN NOT project.anonymise_delegation AND task.anonymise_delegation THEN task.id ELSE NULL END AS "aliasTaskId"
             FROM opsweave.access_grants access
             JOIN opsweave.tasks task ON task.id=access.subject_task_id
             LEFT JOIN opsweave.projects project ON project.id=task.project_id
             WHERE access.workspace_id=$1 AND access.delegate_user_id=$2 AND access.subject_task_id=$3
               AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now())
             UNION ALL
             SELECT access.id,access.access_role,true,
               (project.anonymise_delegation OR task.anonymise_delegation),
               CASE WHEN project.anonymise_delegation THEN project.id END,
               CASE WHEN NOT project.anonymise_delegation AND task.anonymise_delegation THEN task.id END
             FROM opsweave.access_grants access
             JOIN opsweave.projects project ON project.id=access.subject_project_id
             JOIN opsweave.tasks task ON task.project_id=project.id AND task.id=$3
             LEFT JOIN opsweave.task_delegate_audience audience
               ON audience.task_id=task.id AND audience.user_id=$2
             WHERE access.workspace_id=$1 AND access.delegate_user_id=$2 AND access.status='active'
               AND (access.expires_at IS NULL OR access.expires_at>now())
               AND (task.delegate_visibility='project_delegates'
                 OR (task.delegate_visibility='selected_delegates' AND audience.user_id IS NOT NULL)
                 OR task.created_by_user_id=$2)
           ) candidate
           LEFT JOIN opsweave.delegation_aliases alias ON alias.user_id=$2 AND alias.retired_at IS NULL
             AND ((alias.context_type='project' AND alias.context_project_id=candidate."aliasProjectId")
               OR (alias.context_type='task' AND alias.context_task_id=candidate."aliasTaskId"))
           ORDER BY candidate.inherited LIMIT 1`,
      [workspaceId, userId, subjectId],
    );
    return result.rows[0] ?? null;
  }

  public async ensureAliasesForUser(
    workspaceId: string,
    userId: string,
    createAlias: () => string,
  ): Promise<void> {
    const contexts = await this.pool.query<{
      contextProjectId: string | null;
      contextTaskId: string | null;
      contextType: "project" | "task";
    }>(
      `SELECT DISTINCT
        CASE WHEN project.anonymise_delegation THEN project.id END AS "contextProjectId",
        CASE WHEN NOT coalesce(project.anonymise_delegation,false) AND task.anonymise_delegation
          THEN task.id END AS "contextTaskId",
        CASE WHEN project.anonymise_delegation THEN 'project' ELSE 'task' END AS "contextType"
       FROM opsweave.access_grants access
       LEFT JOIN opsweave.projects direct_project ON direct_project.id=access.subject_project_id
       LEFT JOIN opsweave.tasks task ON task.id=access.subject_task_id
       LEFT JOIN opsweave.projects project ON project.id=coalesce(direct_project.id,task.project_id)
       WHERE access.workspace_id=$1 AND access.delegate_user_id=$2 AND access.status='active'
         AND (access.expires_at IS NULL OR access.expires_at>now())
         AND (project.anonymise_delegation OR task.anonymise_delegation)`,
      [workspaceId, userId],
    );
    for (const context of contexts.rows) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          await this.pool.query(
            `INSERT INTO opsweave.delegation_aliases
              (workspace_id,user_id,context_type,context_project_id,context_task_id,alias)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
            [
              workspaceId,
              userId,
              context.contextType,
              context.contextProjectId,
              context.contextTaskId,
              createAlias(),
            ],
          );
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "23505" || attempt === 19) throw error;
        }
      }
    }
  }

  public async listDelegateWorkspace(
    workspaceId: string,
    membershipId: string,
    userId: string,
  ): Promise<DelegateWorkspaceRecord> {
    await transaction(this.pool, async (client) => {
      const assigned = await client.query<{ id: string }>(
        `SELECT id FROM opsweave.delegate_kanban_stages WHERE membership_id=$1
         AND semantic_kind='assigned' AND archived_at IS NULL LIMIT 1`,
        [membershipId],
      );
      const stageId = assigned.rows[0]?.id;
      if (stageId === undefined) {
        await seedDelegateStages(client, membershipId);
      }
      await client.query(
        `WITH visible_tasks AS (
          SELECT access.subject_task_id AS task_id FROM opsweave.access_grants access
          WHERE access.workspace_id=$1 AND access.delegate_user_id=$2 AND access.subject_type='task'
            AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now())
          UNION
          SELECT task.id FROM opsweave.access_grants access
          JOIN opsweave.tasks task ON task.project_id=access.subject_project_id
          LEFT JOIN opsweave.task_delegate_audience audience ON audience.task_id=task.id AND audience.user_id=$2
          WHERE access.workspace_id=$1 AND access.delegate_user_id=$2 AND access.subject_type='project'
            AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now())
            AND task.deleted_at IS NULL AND (task.delegate_visibility='project_delegates'
              OR (task.delegate_visibility='selected_delegates' AND audience.user_id IS NOT NULL)
              OR task.created_by_user_id=$2)
        )
        INSERT INTO opsweave.delegate_task_states (task_id,user_id,stage_id)
        SELECT visible.task_id,$2,stage.id FROM visible_tasks visible
        CROSS JOIN LATERAL (SELECT id FROM opsweave.delegate_kanban_stages
          WHERE membership_id=$3 AND semantic_kind='assigned' AND archived_at IS NULL LIMIT 1) stage
        WHERE visible.task_id IS NOT NULL
        ON CONFLICT (task_id,user_id) DO NOTHING`,
        [workspaceId, userId, membershipId],
      );
    });
    const [projects, stages, tasks] = await Promise.all([
      this.pool.query<DelegateProjectRecord>(
        `SELECT project.id,
          CASE WHEN project.anonymise_delegation THEN presentation.safe_title ELSE project.name END AS name,
          CASE WHEN project.anonymise_delegation THEN presentation.safe_description ELSE project.description END AS description,
          CASE WHEN project.anonymise_delegation THEN presentation.safe_notes ELSE project.notes END AS notes,
          access.access_role AS "accessRole",access.delegation_note AS "delegationNote",alias.alias
         FROM opsweave.access_grants access
         JOIN opsweave.projects project ON project.id=access.subject_project_id
         LEFT JOIN opsweave.delegate_entity_presentations presentation
           ON presentation.subject_project_id=project.id AND presentation.status='approved'
         LEFT JOIN opsweave.delegation_aliases alias ON alias.user_id=$2 AND alias.retired_at IS NULL
           AND alias.context_type='project' AND alias.context_project_id=project.id
         WHERE access.workspace_id=$1 AND access.delegate_user_id=$2 AND access.status='active'
           AND (access.expires_at IS NULL OR access.expires_at>now())
           AND project.archived_at IS NULL
           AND (NOT project.anonymise_delegation OR presentation.id IS NOT NULL)
         ORDER BY access.activated_at DESC,project.id`,
        [workspaceId, userId],
      ),
      this.pool.query<DelegateStageRecord>(
        `SELECT id,name,semantic_kind AS "semanticKind",color,sequence,archived_at AS "archivedAt",version
         FROM opsweave.delegate_kanban_stages WHERE membership_id=$1
         ORDER BY archived_at NULLS FIRST,sequence,id`,
        [membershipId],
      ),
      this.pool.query<DelegateTaskRecord>(
        `WITH candidate AS (
          SELECT access.subject_task_id AS task_id,access.id AS grant_id,access.access_role,
            access.delegation_note,false AS inherited
          FROM opsweave.access_grants access
          WHERE access.workspace_id=$1 AND access.delegate_user_id=$2 AND access.subject_type='task'
            AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now())
          UNION ALL
          SELECT task.id,access.id,access.access_role,access.delegation_note,true
          FROM opsweave.access_grants access
          JOIN opsweave.tasks task ON task.project_id=access.subject_project_id
          LEFT JOIN opsweave.task_delegate_audience audience ON audience.task_id=task.id AND audience.user_id=$2
          WHERE access.workspace_id=$1 AND access.delegate_user_id=$2 AND access.subject_type='project'
            AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now())
            AND task.deleted_at IS NULL AND (task.delegate_visibility='project_delegates'
              OR (task.delegate_visibility='selected_delegates' AND audience.user_id IS NOT NULL)
              OR task.created_by_user_id=$2)
        ), selected AS (
          SELECT DISTINCT ON (task_id) * FROM candidate ORDER BY task_id,inherited
        )
        SELECT task.id,
          CASE WHEN effective.anonymised THEN presentation.safe_title ELSE task.title END AS title,
          CASE WHEN effective.anonymised THEN presentation.safe_work_description ELSE task.work_description END AS "workDescription",
          CASE WHEN effective.anonymised THEN presentation.safe_definition_of_done ELSE task.definition_of_done END AS "definitionOfDone",
          CASE WHEN effective.anonymised THEN presentation.safe_notes ELSE task.notes END AS notes,
          CASE WHEN selected.inherited THEN
            CASE WHEN project.anonymise_delegation THEN project_presentation.safe_title ELSE project.name END
            ELSE NULL END AS "projectLabel",
          task.allocated_hours::float8 AS "allocatedHours",task.hours_spent::float8 AS "hoursSpent",
          task.due_date::text AS "dueDate",selected.access_role AS "accessRole",
          selected.delegation_note AS "delegationNote",state.stage_id AS "stageId",
          state.latest_update AS "latestUpdate",state.version AS "stateVersion",alias.alias
        FROM selected JOIN opsweave.tasks task ON task.id=selected.task_id
        LEFT JOIN opsweave.projects project ON project.id=task.project_id
        CROSS JOIN LATERAL (SELECT coalesce(project.anonymise_delegation,false)
          OR task.anonymise_delegation AS anonymised) effective
        LEFT JOIN opsweave.delegate_entity_presentations presentation ON presentation.subject_task_id=task.id
          AND presentation.status='approved'
        LEFT JOIN opsweave.delegate_entity_presentations project_presentation
          ON project_presentation.subject_project_id=project.id AND project_presentation.status='approved'
        JOIN opsweave.delegate_task_states state ON state.task_id=task.id AND state.user_id=$2
        LEFT JOIN opsweave.delegation_aliases alias ON alias.user_id=$2 AND alias.retired_at IS NULL
          AND ((project.anonymise_delegation AND alias.context_project_id=project.id)
            OR (NOT coalesce(project.anonymise_delegation,false) AND task.anonymise_delegation
              AND alias.context_task_id=task.id))
        WHERE task.deleted_at IS NULL AND (NOT effective.anonymised OR
          (presentation.id IS NOT NULL AND (NOT project.anonymise_delegation OR project_presentation.id IS NOT NULL)))
        ORDER BY state.last_activity_at DESC,task.id`,
        [workspaceId, userId],
      ),
    ]);
    return { projects: projects.rows, stages: stages.rows, tasks: tasks.rows };
  }

  public async createDelegateProjectTask(input: {
    allocatedHours: number | null;
    actorUserId: string;
    definitionOfDone: string | null;
    description: string | null;
    membershipId: string;
    projectId: string;
    title: string;
    workspaceId: string;
  }): Promise<string> {
    return transaction(this.pool, async (client) => {
      const access = await client.query<{ anonymised: boolean; grantId: string }>(
        `SELECT access.id AS "grantId",project.anonymise_delegation AS anonymised
         FROM opsweave.access_grants access
         JOIN opsweave.projects project ON project.id=access.subject_project_id
         WHERE access.workspace_id=$1 AND access.delegate_user_id=$2
           AND access.subject_project_id=$3 AND access.access_role='project_collaborator'
           AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now())
           AND project.archived_at IS NULL FOR UPDATE OF access,project`,
        [input.workspaceId, input.actorUserId, input.projectId],
      );
      const grant = access.rows[0];
      if (grant === undefined) throw new StoreConflictError("The project is unavailable.");
      const created = await client.query<{ id: string; version: number }>(
        `INSERT INTO opsweave.tasks
          (workspace_id,project_id,title,allocated_hours,size,work_description,definition_of_done,
           workflow_lane,delegate_visibility,created_by_user_id,owner_work_assigned,planning_eligible)
         VALUES ($1,$2,$3,$4::numeric,CASE WHEN coalesce($4::numeric,0)<=0.5 THEN 'small'
           WHEN $4::numeric<=1 THEN 'medium' WHEN $4::numeric<=2 THEN 'large' ELSE 'mega' END,
           $5,$6,'delegated','selected_delegates',$7,false,false)
         RETURNING id,version`,
        [
          input.workspaceId,
          input.projectId,
          input.title,
          input.allocatedHours,
          input.description,
          input.definitionOfDone,
          input.actorUserId,
        ],
      );
      const task = created.rows[0];
      if (task === undefined) throw new Error("Delegate task creation failed.");
      await client.query(
        `INSERT INTO opsweave.task_delegate_audience (task_id,user_id,created_by_user_id)
         VALUES ($1,$2,$2)`,
        [task.id, input.actorUserId],
      );
      const assignment = await client.query<{ id: string }>(
        `INSERT INTO opsweave.task_assignments
          (task_id,user_id,access_grant_id,assignment_role,created_by_user_id)
         VALUES ($1,$2,$3,'delivery',$2) RETURNING id`,
        [task.id, input.actorUserId, grant.grantId],
      );
      await seedDelegateStages(client, input.membershipId);
      await client.query(
        `INSERT INTO opsweave.delegate_task_states (task_id,user_id,task_assignment_id,stage_id)
         SELECT $1,$2,$3,stage.id FROM opsweave.delegate_kanban_stages stage
         WHERE stage.membership_id=$4 AND stage.semantic_kind='assigned' AND stage.archived_at IS NULL
         ORDER BY stage.sequence LIMIT 1`,
        [task.id, input.actorUserId, assignment.rows[0]?.id, input.membershipId],
      );
      if (grant.anonymised) {
        await client.query(
          `INSERT INTO opsweave.delegate_entity_presentations
            (workspace_id,subject_task_id,source_version,safe_title,safe_work_description,
             safe_definition_of_done,status)
           VALUES ($1,$2,$3,$4,$5,$6,'draft')`,
          [
            input.workspaceId,
            task.id,
            task.version,
            input.title,
            input.description,
            input.definitionOfDone,
          ],
        );
      }
      const eventId = await insertAudit(client, {
        action: "task.created_by_project_collaborator",
        actorUserId: input.actorUserId,
        category: "status",
        metadata: {},
        subjectId: task.id,
        subjectType: "task",
        userGenerated: true,
        visibility: "authorised_participants",
        workspaceId: input.workspaceId,
      });
      if (grant.anonymised) {
        await client.query(
          `INSERT INTO opsweave.notifications
            (workspace_id,recipient_user_id,source_audit_event_id,type,title,body,
             route_type,route_id,idempotency_key)
           SELECT $1,recipient.user_id,$2,'safe_presentation_review',
             'Delegate-created task needs safe-view approval',
             'Review and approve the delegate-safe presentation before releasing this task.',
             'task',$3,$4||':'||recipient.user_id::text
           FROM opsweave.workspace_memberships recipient WHERE recipient.workspace_id=$1
             AND recipient.role IN ('owner','admin') AND recipient.status='active'
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            input.workspaceId,
            eventId,
            task.id,
            `safe-presentation:${task.id}:${String(task.version)}`,
          ],
        );
      }
      return task.id;
    });
  }

  public async listDelegateSubtasks(
    taskId: string,
    userId: string,
  ): Promise<DelegateSubtaskRecord[]> {
    const result = await this.pool.query<DelegateSubtaskRecord>(
      `SELECT item.id,item.label,item.description,
        item.predicted_hours::float8 AS "predictedHours",item.completed,item.position,item.version,
        (item.created_by_user_id=$2) AS "canEdit"
       FROM opsweave.task_checklist_items item
       WHERE item.task_id=$1 AND (item.delegate_visible OR item.created_by_user_id=$2)
       ORDER BY item.position,item.id`,
      [taskId, userId],
    );
    return result.rows;
  }

  public async createDelegateSubtask(input: {
    actorAlias: string | null;
    actorUserId: string;
    description: string | null;
    label: string;
    predictedHours: number | null;
    taskId: string;
    workspaceId: string;
  }): Promise<string> {
    return transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('delegate-subtasks:' || $1::text))",
        [input.taskId],
      );
      const created = await client.query<{ id: string }>(
        `INSERT INTO opsweave.task_checklist_items
          (task_id,label,description,predicted_hours,completed,position,created_by_user_id,delegate_visible)
         SELECT task.id,$3,$4,$5,false,
           coalesce((SELECT max(item.position)+1 FROM opsweave.task_checklist_items item
             WHERE item.task_id=task.id),0),$2,true
         FROM opsweave.tasks task WHERE task.id=$1 AND task.workspace_id=$6 AND task.deleted_at IS NULL
         RETURNING id`,
        [
          input.taskId,
          input.actorUserId,
          input.label,
          input.description,
          input.predictedHours,
          input.workspaceId,
        ],
      );
      const id = created.rows[0]?.id;
      if (id === undefined) throw new StoreConflictError("The task is unavailable.");
      await client.query(
        `UPDATE opsweave.tasks SET requires_breakdown=false,version=version+1,updated_at=now()
         WHERE id=$1`,
        [input.taskId],
      );
      const eventId = await insertAudit(client, {
        action: "task.subtask.created_by_delegate",
        actorUserId: input.actorUserId,
        category: "status",
        metadata: { subtaskId: id },
        subjectId: input.taskId,
        subjectType: "task",
        userGenerated: true,
        visibility: "authorised_participants",
        workspaceId: input.workspaceId,
      });
      await client.query("UPDATE opsweave.audit_events SET actor_alias_snapshot=$2 WHERE id=$1", [
        eventId,
        input.actorAlias,
      ]);
      return id;
    });
  }

  public async updateDelegateSubtask(input: {
    actorAlias: string | null;
    actorUserId: string;
    completed: boolean;
    description: string | null;
    label: string;
    predictedHours: number | null;
    subtaskId: string;
    taskId: string;
    version: number;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const changed = await client.query(
        `UPDATE opsweave.task_checklist_items item SET label=$5,description=$6,
          predicted_hours=$7,completed=$8,version=item.version+1,updated_at=now()
         FROM opsweave.tasks task WHERE item.id=$1 AND item.task_id=$2
           AND item.created_by_user_id=$3 AND item.version=$4 AND task.id=item.task_id
           AND task.workspace_id=$9 AND task.deleted_at IS NULL`,
        [
          input.subtaskId,
          input.taskId,
          input.actorUserId,
          input.version,
          input.label,
          input.description,
          input.predictedHours,
          input.completed,
          input.workspaceId,
        ],
      );
      if (changed.rowCount !== 1)
        throw new StoreConflictError("The subtask changed or is unavailable.");
      await client.query(
        `UPDATE opsweave.tasks SET version=version+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2`,
        [input.taskId, input.workspaceId],
      );
      const eventId = await insertAudit(client, {
        action: "task.subtask.updated_by_delegate",
        actorUserId: input.actorUserId,
        category: "status",
        metadata: { completed: input.completed, subtaskId: input.subtaskId },
        subjectId: input.taskId,
        subjectType: "task",
        userGenerated: true,
        visibility: "authorised_participants",
        workspaceId: input.workspaceId,
      });
      await client.query("UPDATE opsweave.audit_events SET actor_alias_snapshot=$2 WHERE id=$1", [
        eventId,
        input.actorAlias,
      ]);
    });
  }

  public async deleteDelegateSubtask(input: {
    actorAlias: string | null;
    actorUserId: string;
    subtaskId: string;
    taskId: string;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const removed = await client.query(
        `DELETE FROM opsweave.task_checklist_items item USING opsweave.tasks task
         WHERE item.id=$1 AND item.task_id=$2 AND item.created_by_user_id=$3
           AND task.id=item.task_id AND task.workspace_id=$4 AND task.deleted_at IS NULL`,
        [input.subtaskId, input.taskId, input.actorUserId, input.workspaceId],
      );
      if (removed.rowCount !== 1) throw new StoreConflictError("The subtask is unavailable.");
      await client.query(
        `UPDATE opsweave.tasks task SET requires_breakdown=(task.size='mega' AND NOT EXISTS
          (SELECT 1 FROM opsweave.task_checklist_items item WHERE item.task_id=task.id)),
          version=version+1,updated_at=now() WHERE task.id=$1`,
        [input.taskId],
      );
      const eventId = await insertAudit(client, {
        action: "task.subtask.deleted_by_delegate",
        actorUserId: input.actorUserId,
        category: "status",
        metadata: { subtaskId: input.subtaskId },
        subjectId: input.taskId,
        subjectType: "task",
        userGenerated: true,
        visibility: "authorised_participants",
        workspaceId: input.workspaceId,
      });
      await client.query("UPDATE opsweave.audit_events SET actor_alias_snapshot=$2 WHERE id=$1", [
        eventId,
        input.actorAlias,
      ]);
    });
  }

  public async createDelegateStage(
    membershipId: string,
    name: string,
    color: string,
  ): Promise<DelegateStageRecord> {
    return transaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('delegate-stages:' || $1::text))", [
        membershipId,
      ]);
      const result = await client.query<DelegateStageRecord>(
        `INSERT INTO opsweave.delegate_kanban_stages
          (membership_id,name,semantic_kind,color,sequence)
         SELECT $1,$2,'custom',$3,coalesce(max(sequence),-1)+1
         FROM opsweave.delegate_kanban_stages WHERE membership_id=$1
         RETURNING id,name,semantic_kind AS "semanticKind",color,sequence,
          archived_at AS "archivedAt",version`,
        [membershipId, name, color],
      );
      const stage = result.rows[0];
      if (stage === undefined) throw new Error("Delegate stage creation failed.");
      return stage;
    });
  }

  public async updateDelegateTaskState(input: {
    latestUpdate: string | null;
    membershipId: string;
    stageId: string;
    taskId: string;
    userId: string;
    version: number;
    workspaceId: string;
  }): Promise<{ stageId: string; version: number }> {
    return transaction(this.pool, async (client) => {
      const access = await client.query<{ accessRole: AccessRole }>(
        `SELECT access.access_role AS "accessRole" FROM opsweave.access_grants access
         LEFT JOIN opsweave.tasks task ON task.id=$3
         LEFT JOIN opsweave.task_delegate_audience audience ON audience.task_id=task.id AND audience.user_id=$2
         WHERE access.workspace_id=$1 AND access.delegate_user_id=$2 AND access.status='active'
           AND (access.expires_at IS NULL OR access.expires_at>now())
           AND (access.subject_task_id=$3 OR (access.subject_project_id=task.project_id AND
             (task.delegate_visibility='project_delegates' OR audience.user_id IS NOT NULL
               OR task.created_by_user_id=$2))) LIMIT 1`,
        [input.workspaceId, input.userId, input.taskId],
      );
      if (access.rows[0] === undefined) throw new StoreConflictError("The task is unavailable.");
      const stage = await client.query<{ semanticKind: string }>(
        `SELECT semantic_kind AS "semanticKind" FROM opsweave.delegate_kanban_stages
         WHERE id=$1 AND membership_id=$2 AND archived_at IS NULL`,
        [input.stageId, input.membershipId],
      );
      if (stage.rows[0] === undefined) throw new StoreConflictError("The stage is unavailable.");
      if (
        access.rows[0].accessRole === "reviewer" &&
        stage.rows[0].semanticKind !== "waiting_for_input" &&
        stage.rows[0].semanticKind !== "complete" &&
        stage.rows[0].semanticKind !== "custom"
      ) {
        throw new StoreConflictError(
          "Reviewers can only use validation or request-changes stages.",
        );
      }
      const updated = await client.query<{ stageId: string; version: number }>(
        `UPDATE opsweave.delegate_task_states SET stage_id=$2,latest_update=$3,
          last_activity_at=now(),version=version+1,updated_at=now()
         WHERE task_id=$1 AND user_id=$4 AND version=$5
         RETURNING stage_id AS "stageId",version`,
        [input.taskId, input.stageId, input.latestUpdate, input.userId, input.version],
      );
      const state = updated.rows[0];
      if (state === undefined) throw new StoreConflictError("The task state changed.");
      const eventId = await insertAudit(client, {
        action:
          stage.rows[0].semanticKind === "ready_for_review"
            ? "delegate.ready_for_review"
            : "delegate.stage.changed",
        actorUserId: input.userId,
        category: "status",
        metadata: { latestUpdate: input.latestUpdate, stageId: input.stageId },
        occurredForUserId: input.userId,
        subjectId: input.taskId,
        subjectType: "task",
        visibility: "authorised_participants",
        workspaceId: input.workspaceId,
      });
      if (stage.rows[0].semanticKind === "ready_for_review") {
        await client.query(
          `INSERT INTO opsweave.notifications
            (workspace_id,recipient_user_id,source_audit_event_id,type,title,body,
             route_type,route_id,idempotency_key)
           SELECT $1,recipient.user_id,$2,'ready_for_review','Delegated task ready for review',
             'A delegate marked shared work as ready for review.','task',$3,
             $4||':'||recipient.user_id::text
           FROM opsweave.workspace_memberships recipient WHERE recipient.workspace_id=$1
             AND recipient.role IN ('owner','admin') AND recipient.status='active'
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            input.workspaceId,
            eventId,
            input.taskId,
            `ready:${input.taskId}:${String(state.version)}`,
          ],
        );
      }
      return state;
    });
  }

  public async claimEmailOutbox(): Promise<EmailOutboxRecord | null> {
    return transaction(this.pool, async (client) => {
      await client.query(
        `UPDATE opsweave.notification_outbox outbox SET state='cancelled',cancelled_at=now(),
          encrypted_payload=NULL,updated_at=now()
         FROM opsweave.invitation_tokens token
         JOIN opsweave.access_grants access ON access.id=token.access_grant_id
         WHERE outbox.invitation_token_id=token.id AND outbox.state IN ('pending','processing')
           AND (token.consumed_at IS NOT NULL OR token.invalidated_at IS NOT NULL
             OR token.expires_at<=now() OR access.status<>'invite_pending'
             OR (access.expires_at IS NOT NULL AND access.expires_at<=now()))`,
      );
      const result = await client.query<EmailOutboxRecord>(
        `WITH claimed AS (
          SELECT id FROM opsweave.notification_outbox
          WHERE state='pending' AND next_attempt_at<=now() AND encrypted_payload IS NOT NULL
          ORDER BY next_attempt_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE opsweave.notification_outbox outbox SET state='processing',
          attempt_count=attempt_count+1,updated_at=now()
        FROM claimed WHERE outbox.id=claimed.id
        RETURNING outbox.id,outbox.workspace_id AS "workspaceId",outbox.recipient_email AS "recipientEmail",
          outbox.template_key AS "templateKey",outbox.encrypted_payload AS "encryptedPayload"`,
      );
      return result.rows[0] ?? null;
    });
  }

  public async validateEmailOutboxBeforeSend(outboxId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM opsweave.notification_outbox outbox
       JOIN opsweave.invitation_tokens token ON token.id=outbox.invitation_token_id
       JOIN opsweave.access_grants access ON access.id=token.access_grant_id
       WHERE outbox.id=$1 AND outbox.state='processing' AND token.consumed_at IS NULL
         AND token.invalidated_at IS NULL AND token.expires_at>now()
         AND access.status='invite_pending'
         AND (access.expires_at IS NULL OR access.expires_at>now())`,
      [outboxId],
    );
    if (result.rowCount === 1) return true;
    await this.pool.query(
      `UPDATE opsweave.notification_outbox SET state='cancelled',cancelled_at=now(),
        encrypted_payload=NULL,updated_at=now() WHERE id=$1 AND state='processing'`,
      [outboxId],
    );
    return false;
  }

  public async completeEmailOutbox(outboxId: string): Promise<void> {
    await this.pool.query(
      `UPDATE opsweave.notification_outbox SET state='delivered',delivered_at=now(),
        encrypted_payload=NULL,safe_error=NULL,updated_at=now()
       WHERE id=$1 AND state='processing'`,
      [outboxId],
    );
  }

  public async failEmailOutbox(outboxId: string, safeError: string): Promise<void> {
    await this.pool.query(
      `UPDATE opsweave.notification_outbox SET
        state=CASE WHEN attempt_count>=5 THEN 'failed' ELSE 'pending' END,
        next_attempt_at=now()+make_interval(secs=>least(3600,power(2,attempt_count)::int*30)),
        safe_error=$2,encrypted_payload=CASE WHEN attempt_count>=5 THEN NULL ELSE encrypted_payload END,
        updated_at=now() WHERE id=$1 AND state='processing'`,
      [outboxId, safeError.slice(0, 500)],
    );
  }

  public async materializeExpiredAccessGrants(): Promise<number> {
    return transaction(this.pool, async (client) => {
      const expired = await client.query<{
        delegateUserId: string | null;
        id: string;
        subjectId: string;
        subjectType: AccessSubjectType;
        workspaceId: string;
      }>(
        `UPDATE opsweave.access_grants SET status='expired',version=version+1,updated_at=now()
         WHERE status IN ('active','invite_pending') AND expires_at IS NOT NULL AND expires_at<=now()
         RETURNING id,workspace_id AS "workspaceId",delegate_user_id AS "delegateUserId",
          subject_type AS "subjectType",coalesce(subject_project_id,subject_task_id) AS "subjectId"`,
      );
      for (const grant of expired.rows) {
        await client.query(
          `UPDATE opsweave.invitation_tokens SET invalidated_at=now()
           WHERE access_grant_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL`,
          [grant.id],
        );
        await client.query(
          `UPDATE opsweave.notification_outbox outbox SET state='cancelled',cancelled_at=now(),
            encrypted_payload=NULL,updated_at=now()
           FROM opsweave.invitation_tokens token WHERE token.access_grant_id=$1
             AND outbox.invitation_token_id=token.id AND outbox.state IN ('pending','processing')`,
          [grant.id],
        );
        await client.query(
          `UPDATE opsweave.task_assignments SET active=false,ended_at=now(),updated_at=now()
           WHERE access_grant_id=$1 AND active`,
          [grant.id],
        );
        if (grant.delegateUserId !== null) {
          await client.query(
            "UPDATE opsweave.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
            [grant.delegateUserId],
          );
          await client.query(
            `UPDATE opsweave.notifications SET state='cancelled',cancelled_at=now(),updated_at=now()
             WHERE recipient_user_id=$1 AND state IN ('unread','read') AND
               (route_id=$2 OR ($3='project' AND route_type='task' AND route_id IN
                 (SELECT id FROM opsweave.tasks WHERE project_id=$2)))`,
            [grant.delegateUserId, grant.subjectId, grant.subjectType],
          );
        }
        await client.query(
          `INSERT INTO opsweave.notifications
            (workspace_id,recipient_user_id,type,title,body,route_type,idempotency_key)
           SELECT $1,recipient.user_id,'access_expired','Delegated access expired',
             'A delegated access grant reached its expiry and was closed.','delegations',
             $2||':'||recipient.user_id::text
           FROM opsweave.workspace_memberships recipient WHERE recipient.workspace_id=$1
             AND recipient.role IN ('owner','admin') AND recipient.status='active'
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [grant.workspaceId, `access-expired:${grant.id}`],
        );
      }
      return expired.rows.length;
    });
  }

  /** Removes closed grant control records after their retention window; audit and time snapshots remain. */
  public async purgeClosedAccessGrants(retentionDays = 30): Promise<number> {
    const boundedDays = Math.max(1, Math.min(3650, Math.trunc(retentionDays)));
    const result = await this.pool.query(
      `DELETE FROM opsweave.access_grants
       WHERE status IN ('revoked','expired','declined')
         AND coalesce(revoked_at,updated_at)<now()-make_interval(days=>$1)`,
      [boundedDays],
    );
    return result.rowCount ?? 0;
  }

  public async materializeDelegationAlerts(): Promise<number> {
    return transaction(this.pool, async (client) => {
      const overdue = await client.query(
        `INSERT INTO opsweave.notifications
          (workspace_id,recipient_user_id,type,title,body,route_type,route_id,idempotency_key)
         SELECT task.workspace_id,recipient.user_id,'delegated_overdue','Delegated task overdue',
           'A delegated task is past its deadline and still needs attention.','task',task.id,
           'delegated-overdue:'||task.id::text||':'||state.user_id::text||':'||task.due_date::text||':'||recipient.user_id::text
         FROM opsweave.delegate_task_states state
         JOIN opsweave.tasks task ON task.id=state.task_id
         JOIN opsweave.workspace_memberships recipient ON recipient.workspace_id=task.workspace_id
           AND recipient.role IN ('owner','admin') AND recipient.status='active'
         WHERE task.deleted_at IS NULL AND task.due_date<current_date
           AND task.workflow_lane NOT IN ('done','cancelled')
           AND EXISTS (
             SELECT 1 FROM opsweave.access_grants access
             LEFT JOIN opsweave.task_delegate_audience audience
               ON audience.task_id=task.id AND audience.user_id=state.user_id
             WHERE access.workspace_id=task.workspace_id AND access.delegate_user_id=state.user_id
               AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now())
               AND (access.subject_task_id=task.id OR (access.subject_project_id=task.project_id
                 AND (task.delegate_visibility='project_delegates'
                   OR (task.delegate_visibility='selected_delegates' AND audience.user_id IS NOT NULL)
                   OR task.created_by_user_id=state.user_id))))
         ON CONFLICT (idempotency_key) DO NOTHING`,
      );
      const waiting = await client.query(
        `INSERT INTO opsweave.notifications
          (workspace_id,recipient_user_id,type,title,body,route_type,route_id,idempotency_key)
         SELECT task.workspace_id,recipient.user_id,'delegated_waiting','Delegate waiting for input',
           'Delegated work has remained in Waiting for input for more than 24 hours.',
           'task',task.id,'delegated-waiting:'||state.id::text||':'||state.version::text||':'||recipient.user_id::text
         FROM opsweave.delegate_task_states state
         JOIN opsweave.delegate_kanban_stages stage ON stage.id=state.stage_id
         JOIN opsweave.tasks task ON task.id=state.task_id
         JOIN opsweave.workspace_memberships recipient ON recipient.workspace_id=task.workspace_id
           AND recipient.role IN ('owner','admin') AND recipient.status='active'
         WHERE stage.semantic_kind='waiting_for_input'
           AND state.last_activity_at<=now()-interval '24 hours' AND task.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM opsweave.access_grants access
             WHERE access.workspace_id=task.workspace_id AND access.delegate_user_id=state.user_id
               AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now())
               AND (access.subject_task_id=task.id OR access.subject_project_id=task.project_id))
         ON CONFLICT (idempotency_key) DO NOTHING`,
      );
      const expiring = await client.query(
        `INSERT INTO opsweave.notifications
          (workspace_id,recipient_user_id,type,title,body,route_type,route_id,idempotency_key)
         SELECT access.workspace_id,recipient.user_id,'access_expiring','Delegated access expiring soon',
           'An active or pending Access Grant expires within 48 hours.','delegations',access.id,
           'access-expiring:'||access.id::text||':'||extract(epoch FROM access.expires_at)::bigint::text||':'||recipient.user_id::text
         FROM opsweave.access_grants access
         JOIN opsweave.workspace_memberships recipient ON recipient.workspace_id=access.workspace_id
           AND recipient.role IN ('owner','admin') AND recipient.status='active'
         WHERE access.status IN ('active','invite_pending') AND access.expires_at>now()
           AND access.expires_at<=now()+interval '48 hours'
         ON CONFLICT (idempotency_key) DO NOTHING`,
      );
      return (overdue.rowCount ?? 0) + (waiting.rowCount ?? 0) + (expiring.rowCount ?? 0);
    });
  }

  public async listNotifications(userId: string, limit = 100): Promise<NotificationRecord[]> {
    const result = await this.pool.query<NotificationRecord>(
      `SELECT id,type,state,title,body,route_type AS "routeType",route_id AS "routeId",
        created_at AS "createdAt" FROM opsweave.notifications
       WHERE recipient_user_id=$1 AND state<>'cancelled'
       ORDER BY created_at DESC,id DESC LIMIT $2`,
      [userId, Math.max(1, Math.min(200, limit))],
    );
    return result.rows;
  }

  public async updateNotificationState(
    userId: string,
    notificationId: string,
    state: "dismissed" | "read",
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE opsweave.notifications SET state=$3,
        read_at=CASE WHEN $3='read' THEN now() ELSE read_at END,
        dismissed_at=CASE WHEN $3='dismissed' THEN now() ELSE dismissed_at END,updated_at=now()
       WHERE id=$1 AND recipient_user_id=$2 AND state<>'cancelled'`,
      [notificationId, userId, state],
    );
    if (result.rowCount !== 1) throw new StoreConflictError("The notification is unavailable.");
  }

  public async changeUserLifecycle(input: {
    actorUserId: string;
    archive: boolean;
    targetUserId: string;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const membership = await client.query<{ role: WorkspaceRole }>(
        `SELECT role FROM opsweave.workspace_memberships
         WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE`,
        [input.workspaceId, input.targetUserId],
      );
      if (membership.rows[0] === undefined || membership.rows[0].role === "owner") {
        throw new StoreConflictError("The user cannot be changed.");
      }
      const status = input.archive ? "archived" : "deactivated";
      await client.query(
        `UPDATE opsweave.workspace_memberships SET status=$3,
          deactivated_at=CASE WHEN $3='deactivated' THEN now() ELSE deactivated_at END,
          archived_at=CASE WHEN $3='archived' THEN now() ELSE archived_at END,
          lifecycle_actor_user_id=$4,authorization_version=authorization_version+1,updated_at=now()
         WHERE workspace_id=$1 AND user_id=$2`,
        [input.workspaceId, input.targetUserId, status, input.actorUserId],
      );
      if (input.archive) {
        await client.query(
          `UPDATE opsweave.users SET status='archived',archived_at=now(),
            authorization_version=authorization_version+1,updated_at=now() WHERE id=$1`,
          [input.targetUserId],
        );
      } else {
        await client.query(
          `UPDATE opsweave.users SET authorization_version=authorization_version+1,updated_at=now()
           WHERE id=$1`,
          [input.targetUserId],
        );
      }
      await client.query(
        "UPDATE opsweave.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [input.targetUserId],
      );
      const revoked = await client.query<{ id: string }>(
        `UPDATE opsweave.access_grants SET status='revoked',revoked_by_user_id=$3,revoked_at=now(),
          version=version+1,updated_at=now()
         WHERE workspace_id=$1 AND delegate_user_id=$2 AND status IN ('invite_pending','active')
         RETURNING id`,
        [input.workspaceId, input.targetUserId, input.actorUserId],
      );
      const grantIds = revoked.rows.map((grant) => grant.id);
      if (grantIds.length > 0) {
        await client.query(
          `UPDATE opsweave.invitation_tokens SET invalidated_at=now()
           WHERE access_grant_id=ANY($1::uuid[]) AND consumed_at IS NULL
             AND invalidated_at IS NULL`,
          [grantIds],
        );
        await client.query(
          `UPDATE opsweave.notification_outbox outbox SET state='cancelled',cancelled_at=now(),
            encrypted_payload=NULL,updated_at=now()
           FROM opsweave.invitation_tokens token
           WHERE token.access_grant_id=ANY($1::uuid[]) AND outbox.invitation_token_id=token.id
             AND outbox.state IN ('pending','processing')`,
          [grantIds],
        );
        await client.query(
          `UPDATE opsweave.task_assignments SET active=false,ended_at=now(),updated_at=now()
           WHERE access_grant_id=ANY($1::uuid[]) AND active`,
          [grantIds],
        );
      }
      await client.query(
        `UPDATE opsweave.notifications SET state='cancelled',cancelled_at=now(),updated_at=now()
         WHERE recipient_user_id=$1 AND state IN ('unread','read')`,
        [input.targetUserId],
      );
      await insertAudit(client, {
        action: input.archive ? "user.archived" : "user.deactivated",
        actorUserId: input.actorUserId,
        category: "access",
        metadata: { targetUserId: input.targetUserId },
        occurredForUserId: input.targetUserId,
        subjectId: input.workspaceId,
        subjectType: "workspace",
        workspaceId: input.workspaceId,
      });
    });
  }

  public async changeUserRole(input: {
    actorUserId: string;
    role: "admin" | "delegate";
    targetUserId: string;
    workspaceId: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const membership = await client.query<{ role: WorkspaceRole }>(
        `SELECT role FROM opsweave.workspace_memberships
         WHERE workspace_id=$1 AND user_id=$2 AND status='active' FOR UPDATE`,
        [input.workspaceId, input.targetUserId],
      );
      const current = membership.rows[0];
      if (current === undefined || current.role === "owner") {
        throw new StoreConflictError("The user role cannot be changed.");
      }
      if (current.role === input.role) return;
      await client.query(
        `UPDATE opsweave.workspace_memberships SET role=$3,
          lifecycle_actor_user_id=$4,authorization_version=authorization_version+1,
          updated_at=now() WHERE workspace_id=$1 AND user_id=$2`,
        [input.workspaceId, input.targetUserId, input.role, input.actorUserId],
      );
      await client.query(
        "UPDATE opsweave.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [input.targetUserId],
      );
      await insertAudit(client, {
        action: "user.role.changed",
        actorUserId: input.actorUserId,
        category: "access",
        metadata: { from: current.role, targetUserId: input.targetUserId, to: input.role },
        occurredForUserId: input.targetUserId,
        subjectId: input.workspaceId,
        subjectType: "workspace",
        workspaceId: input.workspaceId,
      });
    });
  }
}
