import { createHash, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { systemMetadata } from "./schema.ts";
import { CollaborationStore } from "./collaboration-store.ts";
import { OpsWeaveStore, StoreConflictError, type SessionTimes } from "./store.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;

const assertIsolatedTestDatabase = (value: string | undefined): string => {
  if (value === undefined) throw new Error("TEST_DATABASE_URL is required.");
  const parsed = new URL(value);
  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.pathname !== "/opsweave_test" ||
    parsed.port !== "55432"
  ) {
    throw new Error("Integration tests refuse to use a non-isolated database.");
  }
  return value;
};

describe("database migrations and repositories", () => {
  const isolatedDatabaseUrl = assertIsolatedTestDatabase(databaseUrl);
  const pool = new Pool({ connectionString: isolatedDatabaseUrl, max: 4 });
  const database = createDatabase(pool);
  const store = new OpsWeaveStore(pool);
  const collaboration = new CollaborationStore(pool);

  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS opsweave CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await runMigrations(isolatedDatabaseUrl);
  });

  afterAll(async () => pool.end());

  it("builds every migration from zero and supports the foundation round trip", async () => {
    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='opsweave'",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "attachments",
        "access_grants",
        "activity_payloads",
        "compliance_flags",
        "compliance_jobs",
        "delegate_kanban_stages",
        "delegate_task_states",
        "delegation_aliases",
        "email_delivery_settings",
        "invitation_tokens",
        "notification_outbox",
        "notifications",
        "owners",
        "owner_credentials",
        "sessions",
        "workspace_settings",
        "workspace_working_hours",
        "encrypted_provider_credentials",
        "entity_dependencies",
        "learning_events",
        "project_dependencies",
        "projects",
        "project_stages",
        "tasks",
        "task_checklist_items",
        "task_intake_origins",
        "task_time_entries",
        "task_assignments",
        "users",
        "user_credentials",
        "workspace_memberships",
        "audit_events",
        "trash_records",
      ]),
    );
    await database.insert(systemMetadata).values({ key: "phase", value: { value: 1 } });
    expect(
      await database
        .select({ key: systemMetadata.key })
        .from(systemMetadata)
        .where(sql`${systemMetadata.key}=${"phase"}`),
    ).toEqual([{ key: "phase" }]);
  });

  it("bootstraps exactly one owner and rejects replay", async () => {
    const owner = await store.bootstrapOwner({
      normalizedUsername: "synthetic-owner",
      passwordHash: "$argon2id$synthetic-hash-never-used-for-verification",
      username: "Synthetic-Owner",
      workspaceDisplayName: "Synthetic workspace",
    });
    expect(owner.passwordHash).not.toContain("password");
    expect((await store.getWorkspaceConfiguration(owner.workspaceId)).workingDays).toHaveLength(7);
    const user = await store.findUserForLogin("synthetic-owner");
    expect(user).toMatchObject({
      membershipStatus: "active",
      ownerId: owner.ownerId,
      role: "owner",
      userStatus: "active",
    });
    await expect(
      store.bootstrapOwner({
        normalizedUsername: "second-owner",
        passwordHash: "synthetic-hash",
        username: "Second-Owner",
        workspaceDisplayName: "Second workspace",
      }),
    ).rejects.toBeInstanceOf(StoreConflictError);
  });

  it("activates scoped access, creates private delegate state, and revokes immediately", async () => {
    const owner = await store.findUserForLogin("synthetic-owner");
    if (!owner?.ownerId) throw new Error("Expected unified owner.");
    const task = await store.createTask(owner.workspaceId, owner.ownerId, {
      allocatedHours: 2,
      title: "Scoped collaboration fixture",
      workflowLane: "inbox",
    });
    const token = "synthetic-invitation-token-that-is-long-enough";
    const digest = createHash("sha256").update(token).digest("hex");
    const created = await collaboration.createAccessGrant({
      accessRole: "contributor",
      actorUserId: owner.userId,
      delegateEmail: "delegate@example.test",
      delegationNote: "Complete the isolated fixture.",
      encryptedInvitationPayload: null,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      invitationExpiresAt: new Date("2030-08-20T00:00:00.000Z"),
      invitationTokenDigest: digest,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    expect(created.grant.status).toBe("invite_pending");
    expect(
      await collaboration.inspectInvitation(digest, new Date("2026-08-18T00:00:00.000Z")),
    ).not.toBeNull();
    const accepted = await collaboration.acceptInvitation({
      fullName: "Synthetic Delegate",
      passwordHash: "$argon2id$synthetic-delegate-hash",
      tokenDigest: digest,
    });
    const delegate = await store.findUserForLogin("delegate@example.test");
    if (delegate === null) throw new Error("Expected activated delegate.");
    expect(accepted.userId).toBe(delegate.userId);
    const delegateWorkspace = await collaboration.listDelegateWorkspace(
      owner.workspaceId,
      delegate.membershipId,
      delegate.userId,
    );
    expect(delegateWorkspace.tasks.map((candidate) => candidate.id)).toContain(task.id);
    const ready = delegateWorkspace.stages.find(
      (stage) => stage.semanticKind === "ready_for_review",
    );
    const delegateTask = delegateWorkspace.tasks.find((candidate) => candidate.id === task.id);
    if (ready === undefined || delegateTask === undefined)
      throw new Error("Expected delegate state.");
    await collaboration.updateDelegateTaskState({
      latestUpdate: "Ready for owner validation.",
      membershipId: delegate.membershipId,
      stageId: ready.id,
      taskId: task.id,
      userId: delegate.userId,
      version: delegateTask.stateVersion,
      workspaceId: owner.workspaceId,
    });
    expect(
      (await store.listTasks(owner.workspaceId, "manual")).find(
        (candidate) => candidate.id === task.id,
      ),
    ).toMatchObject({ delegateReviewPending: true });
    expect((await collaboration.listNotifications(owner.userId))[0]?.type).toBe("ready_for_review");
    expect(await collaboration.listTaskDelegationProgress(owner.workspaceId, task.id)).toEqual([
      expect.objectContaining({
        accessStatus: "active",
        delegateUserId: delegate.userId,
        latestUpdate: "Ready for owner validation.",
        stageName: ready.name,
      }),
    ]);
    const sessionTimes: SessionTimes = {
      absoluteExpiresAt: new Date("2026-08-25T00:00:00.000Z"),
      createdAt: new Date("2026-08-18T00:00:00.000Z"),
      idleExpiresAt: new Date("2026-08-19T00:00:00.000Z"),
      lastSeenAt: new Date("2026-08-18T00:00:00.000Z"),
      recentAuthenticatedAt: new Date("2026-08-18T00:00:00.000Z"),
      revokedAt: null,
    };
    const delegateSession = await store.createPrincipalSession(
      delegate,
      "b".repeat(64),
      sessionTimes,
    );
    await collaboration.revokeAccessGrant(owner.workspaceId, owner.userId, created.grant.id);
    expect(
      (await store.findPrincipalSessionByDigest(delegateSession.tokenDigest))?.revokedAt,
    ).toBeInstanceOf(Date);
    expect(
      await collaboration.resolveAccess(owner.workspaceId, delegate.userId, "task", task.id),
    ).toBeNull();
  });

  it("changes a delegate by preserving the revoked grant and issuing a new invitation", async () => {
    const owner = await store.findUserForLogin("synthetic-owner");
    if (!owner?.ownerId) throw new Error("Expected unified owner.");
    const task = await store.createTask(owner.workspaceId, owner.ownerId, {
      title: "Delegate replacement fixture",
      workflowLane: "inbox",
    });
    const originalDigest = createHash("sha256")
      .update("original-delegate-replacement-token")
      .digest("hex");
    const original = await collaboration.createAccessGrant({
      accessRole: "contributor",
      actorUserId: owner.userId,
      delegateEmail: "original-replacement@example.test",
      delegationNote: "Preserve this instruction on replacement.",
      encryptedInvitationPayload: null,
      expiresAt: new Date("2030-09-01T00:00:00.000Z"),
      invitationExpiresAt: new Date("2030-08-20T00:00:00.000Z"),
      invitationTokenDigest: originalDigest,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    const replacementDigest = createHash("sha256")
      .update("new-delegate-replacement-token")
      .digest("hex");
    const replacement = await collaboration.replaceAccessGrant({
      actorUserId: owner.userId,
      delegateEmail: "new-replacement@example.test",
      encryptedInvitationPayload: null,
      grantId: original.grant.id,
      invitationExpiresAt: new Date("2030-08-20T00:00:00.000Z"),
      invitationTokenDigest: replacementDigest,
      version: original.grant.version,
      workspaceId: owner.workspaceId,
    });
    const grants = await collaboration.listAccessGrants(owner.workspaceId, {
      id: task.id,
      type: "task",
    });
    expect(grants.find((grant) => grant.id === original.grant.id)?.status).toBe("revoked");
    expect(replacement.grant).toMatchObject({
      delegateEmail: "new-replacement@example.test",
      delegationNote: "Preserve this instruction on replacement.",
      status: "invite_pending",
    });
    expect(await collaboration.inspectInvitation(originalDigest)).toBeNull();
    expect(await collaboration.inspectInvitation(replacementDigest)).not.toBeNull();
  });

  it("materialises idempotent overdue, waiting, and access-expiry owner alerts", async () => {
    const owner = await store.findUserForLogin("synthetic-owner");
    if (!owner?.ownerId) throw new Error("Expected unified owner.");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
    const task = await store.createTask(owner.workspaceId, owner.ownerId, {
      dueDate: yesterday,
      title: "Delegation alert fixture",
    });
    const digest = createHash("sha256").update("delegation-alert-token").digest("hex");
    await collaboration.createAccessGrant({
      accessRole: "contributor",
      actorUserId: owner.userId,
      delegateEmail: "alert-delegate@example.test",
      delegationNote: null,
      encryptedInvitationPayload: null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      invitationExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1_000),
      invitationTokenDigest: digest,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    const accepted = await collaboration.acceptInvitation({
      fullName: "Alert Delegate",
      passwordHash: "$argon2id$synthetic-alert-hash",
      tokenDigest: digest,
    });
    const delegate = await store.findUserForLogin("alert-delegate@example.test");
    if (delegate === null) throw new Error("Expected alert delegate.");
    const workspace = await collaboration.listDelegateWorkspace(
      owner.workspaceId,
      delegate.membershipId,
      accepted.userId,
    );
    const delegatedTask = workspace.tasks.find((candidate) => candidate.id === task.id);
    const waiting = workspace.stages.find((stage) => stage.semanticKind === "waiting_for_input");
    if (delegatedTask === undefined || waiting === undefined)
      throw new Error("Expected waiting state.");
    await collaboration.updateDelegateTaskState({
      latestUpdate: "Waiting for an owner decision.",
      membershipId: delegate.membershipId,
      stageId: waiting.id,
      taskId: task.id,
      userId: accepted.userId,
      version: delegatedTask.stateVersion,
      workspaceId: owner.workspaceId,
    });
    await pool.query(
      `UPDATE opsweave.delegate_task_states SET last_activity_at=now()-interval '25 hours'
       WHERE task_id=$1 AND user_id=$2`,
      [task.id, accepted.userId],
    );
    expect(await collaboration.materializeDelegationAlerts()).toBe(3);
    expect(await collaboration.materializeDelegationAlerts()).toBe(0);
    expect((await collaboration.listNotifications(owner.userId)).map((item) => item.type)).toEqual(
      expect.arrayContaining(["access_expiring", "delegated_overdue", "delegated_waiting"]),
    );
  });

  it("keeps an approved safe presentation current when anonymisation is already enabled", async () => {
    const owner = await store.findUserForLogin("synthetic-owner");
    if (!owner?.ownerId) throw new Error("Expected unified owner.");
    const task = await store.createTask(owner.workspaceId, owner.ownerId, {
      title: "Anonymisation idempotency fixture",
    });
    await collaboration.setSubjectAnonymisation({
      actorUserId: owner.userId,
      enabled: true,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    const draft = await collaboration.getDelegatePresentation(owner.workspaceId, "task", task.id);
    if (draft === null) throw new Error("Expected a safe presentation draft.");
    const approved = await collaboration.saveDelegatePresentation({
      actorUserId: owner.userId,
      neutralClientLabel: null,
      neutralProjectLabel: null,
      safeDefinitionOfDone: null,
      safeDescription: "Safe description",
      safeNotes: { content: [], type: "doc" },
      safeTitle: "Shared task",
      safeWorkDescription: null,
      status: "approved",
      subjectId: task.id,
      subjectType: "task",
      version: draft.version,
      workspaceId: owner.workspaceId,
    });
    await collaboration.setSubjectAnonymisation({
      actorUserId: owner.userId,
      enabled: true,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    expect(
      await collaboration.getDelegatePresentation(owner.workspaceId, "task", task.id),
    ).toMatchObject({
      sourceVersion: approved.sourceVersion,
      status: "approved",
      version: approved.version,
    });
    await collaboration.createTimeEntry({
      accessGrantId: null,
      actorAlias: null,
      actorUserId: owner.userId,
      description: "Safe accounting-only update",
      entryDate: "2026-08-17",
      hours: 0.25,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    expect(
      await collaboration.getDelegatePresentation(owner.workspaceId, "task", task.id),
    ).toMatchObject({ status: "approved" });
    const current = (await store.listTasks(owner.workspaceId, "manual")).find(
      (candidate) => candidate.id === task.id,
    );
    if (current === undefined) throw new Error("Expected the anonymised task.");
    await store.updateTask(owner.workspaceId, owner.ownerId, task.id, {
      ...current,
      title: "Changed private source title",
    });
    expect(
      await collaboration.getDelegatePresentation(owner.workspaceId, "task", task.id),
    ).toMatchObject({ status: "stale" });
  });

  it("enforces invitation, document, notification, identity, and audit boundaries", async () => {
    const owner = await store.findUserForLogin("synthetic-owner");
    if (!owner?.ownerId) throw new Error("Expected unified owner.");
    const task = await store.createTask(owner.workspaceId, owner.ownerId, {
      allocatedHours: 4,
      title: "External boundary fixture",
      workflowLane: "inbox",
    });
    const expiredDigest = createHash("sha256").update("expired-boundary-token").digest("hex");
    const expiredTask = await store.createTask(owner.workspaceId, owner.ownerId, {
      title: "Expired invitation fixture",
    });
    await collaboration.createAccessGrant({
      accessRole: "reviewer",
      actorUserId: owner.userId,
      delegateEmail: "expired-boundary@example.test",
      delegationNote: null,
      encryptedInvitationPayload: null,
      expiresAt: null,
      invitationExpiresAt: new Date(0),
      invitationTokenDigest: expiredDigest,
      subjectId: expiredTask.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    expect(await collaboration.inspectInvitation(expiredDigest)).toBeNull();

    const primaryDigest = createHash("sha256").update("primary-boundary-token").digest("hex");
    const primaryGrant = await collaboration.createAccessGrant({
      accessRole: "contributor",
      actorUserId: owner.userId,
      delegateEmail: "primary-boundary@example.test",
      delegationNote: "Use only the approved collaboration surface.",
      encryptedInvitationPayload: null,
      expiresAt: new Date("2030-09-01T00:00:00.000Z"),
      invitationExpiresAt: new Date("2030-08-20T00:00:00.000Z"),
      invitationTokenDigest: primaryDigest,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    const primaryAccepted = await collaboration.acceptInvitation({
      fullName: "Primary Boundary Delegate",
      passwordHash: "$argon2id$synthetic-primary-boundary-hash",
      tokenDigest: primaryDigest,
    });
    const secondaryDigest = createHash("sha256").update("secondary-boundary-token").digest("hex");
    await collaboration.createAccessGrant({
      accessRole: "reviewer",
      actorUserId: owner.userId,
      delegateEmail: "secondary-boundary@example.test",
      delegationNote: null,
      encryptedInvitationPayload: null,
      expiresAt: new Date("2030-09-01T00:00:00.000Z"),
      invitationExpiresAt: new Date("2030-08-20T00:00:00.000Z"),
      invitationTokenDigest: secondaryDigest,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    const secondaryAccepted = await collaboration.acceptInvitation({
      fullName: "Secondary Boundary Delegate",
      passwordHash: "$argon2id$synthetic-secondary-boundary-hash",
      tokenDigest: secondaryDigest,
    });
    const primary = await store.findUserForLogin("primary-boundary@example.test");
    if (primary === null) throw new Error("Expected primary boundary delegate.");
    const participants = await collaboration.listSubjectParticipants(
      owner.workspaceId,
      "delegate",
      "task",
      task.id,
      primaryAccepted.userId,
    );
    const secondaryParticipant = participants.find(
      (participant) => participant.userId === secondaryAccepted.userId,
    );
    expect(secondaryParticipant?.displayName).toMatch(/^Participant [0-9A-F]{6}$/u);
    expect(secondaryParticipant?.displayName).not.toContain("Secondary Boundary Delegate");
    expect(secondaryParticipant?.displayName).not.toContain("secondary-boundary@example.test");

    const createAttachment = (input: {
      name: string;
      selectedUserIds?: readonly string[];
      visibility: "internal_only" | "shared_all_delegates" | "shared_selected_delegates";
    }) =>
      collaboration.createCollaborationAttachment({
        actorAlias: null,
        actorUserId: owner.userId,
        approvalStatus: "approved",
        byteSize: 10,
        contentHash: createHash("sha256").update(input.name).digest("hex"),
        contentType: "text/plain",
        delegateSafeName: null,
        filenameRisk: false,
        originalAttachmentId: null,
        originalName: input.name,
        selectedUserIds: input.selectedUserIds ?? [],
        storageKey: randomUUID(),
        subjectId: task.id,
        subjectType: "task",
        visibility: input.visibility,
        workspaceId: owner.workspaceId,
      });
    await Promise.all([
      createAttachment({ name: "internal.txt", visibility: "internal_only" }),
      createAttachment({ name: "everyone.txt", visibility: "shared_all_delegates" }),
      createAttachment({
        name: "primary-only.txt",
        selectedUserIds: [primaryAccepted.userId],
        visibility: "shared_selected_delegates",
      }),
      createAttachment({
        name: "owner-only-selection.txt",
        selectedUserIds: [owner.userId],
        visibility: "shared_selected_delegates",
      }),
    ]);
    const ownerDocuments = await collaboration.listAccessibleAttachments({
      subjectId: task.id,
      subjectType: "task",
      userId: owner.userId,
      viewerRole: "owner",
      workspaceId: owner.workspaceId,
    });
    expect(ownerDocuments).toHaveLength(4);
    const primaryDocuments = await collaboration.listAccessibleAttachments({
      subjectId: task.id,
      subjectType: "task",
      userId: primaryAccepted.userId,
      viewerRole: "delegate",
      workspaceId: owner.workspaceId,
    });
    expect(primaryDocuments.map((document) => document.displayName).sort()).toEqual([
      "everyone.txt",
      "primary-only.txt",
    ]);

    const activityId = await collaboration.createActivity({
      actorAlias: null,
      actorUserId: primaryAccepted.userId,
      body: "This retained activity is visible only to authorised participants.",
      contentStatus: "approved",
      kind: "message",
      mentionedUserIds: [owner.userId],
      notificationUserIds: [owner.userId],
      quarantineReason: null,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    expect(await collaboration.listNotifications(primaryAccepted.userId)).toEqual([]);
    expect(await collaboration.listNotifications(owner.userId)).toContainEqual(
      expect.objectContaining({ routeId: task.id, type: "mention_or_message" }),
    );
    await collaboration.createTimeEntry({
      accessGrantId: primaryGrant.grant.id,
      actorAlias: null,
      actorUserId: primaryAccepted.userId,
      description: "Retained delivery history",
      entryDate: "2026-08-17",
      hours: 1,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    const ownerCredentialBefore = await store.getOnlyOwnerCredential();
    const primaryCredential = await store.getUserCredentialById(
      owner.workspaceId,
      primaryAccepted.userId,
    );
    if (primaryCredential === null) throw new Error("Expected primary delegate credentials.");
    const rotated = await store.changeUserPassword({
      newPasswordHash: "$argon2id$synthetic-primary-rotated-hash",
      times: {
        absoluteExpiresAt: new Date("2026-08-25T00:00:00.000Z"),
        createdAt: new Date("2026-08-18T00:00:00.000Z"),
        idleExpiresAt: new Date("2026-08-19T00:00:00.000Z"),
        lastSeenAt: new Date("2026-08-18T00:00:00.000Z"),
        recentAuthenticatedAt: new Date("2026-08-18T00:00:00.000Z"),
        revokedAt: null,
      },
      tokenDigest: createHash("sha256").update("primary-rotated-session").digest("hex"),
      user: primaryCredential,
    });
    expect(rotated.userId).toBe(primaryAccepted.userId);
    expect(
      (await store.getUserCredentialById(owner.workspaceId, primaryAccepted.userId))?.passwordHash,
    ).toBe("$argon2id$synthetic-primary-rotated-hash");
    expect((await store.getOnlyOwnerCredential())?.passwordHash).toBe(
      ownerCredentialBefore?.passwordHash,
    );
    await collaboration.revokeAccessGrant(owner.workspaceId, owner.userId, primaryGrant.grant.id);
    expect(
      await collaboration.resolveAccess(owner.workspaceId, primaryAccepted.userId, "task", task.id),
    ).toBeNull();
    expect(
      await collaboration.resolveAccess(
        owner.workspaceId,
        secondaryAccepted.userId,
        "task",
        task.id,
      ),
    ).not.toBeNull();
    expect(
      await collaboration.listTimeEntries({
        subjectId: task.id,
        subjectType: "task",
        viewerRole: "owner",
        workspaceId: owner.workspaceId,
      }),
    ).toContainEqual(
      expect.objectContaining({ description: "Retained delivery history", userId: primary.userId }),
    );
    expect(
      await collaboration.listActivity({
        subjectId: task.id,
        subjectType: "task",
        viewerRole: "owner",
        viewerUserId: owner.userId,
        workspaceId: owner.workspaceId,
      }),
    ).toContainEqual(expect.objectContaining({ id: activityId }));
  });

  it("keeps aliases stable within an anonymised project and unlinkable across projects", async () => {
    const owner = await store.findUserForLogin("synthetic-owner");
    if (!owner?.ownerId) throw new Error("Expected unified owner.");
    const firstProject = await store.createProject(owner.workspaceId, owner.ownerId, {
      name: "Private client one",
    });
    const secondProject = await store.createProject(owner.workspaceId, owner.ownerId, {
      name: "Private client two",
    });
    const firstTasks = await Promise.all([
      store.createTask(owner.workspaceId, owner.ownerId, {
        projectId: firstProject.id,
        title: "First private task",
      }),
      store.createTask(owner.workspaceId, owner.ownerId, {
        projectId: firstProject.id,
        title: "Second private task",
      }),
    ]);
    const secondTask = await store.createTask(owner.workspaceId, owner.ownerId, {
      projectId: secondProject.id,
      title: "Other private task",
    });
    const firstDigest = createHash("sha256").update("first-alias-project-token").digest("hex");
    await collaboration.createAccessGrant({
      accessRole: "project_collaborator",
      actorUserId: owner.userId,
      anonymise: true,
      delegateEmail: "alias-boundary@example.test",
      delegationNote: null,
      encryptedInvitationPayload: null,
      expiresAt: null,
      invitationExpiresAt: new Date("2030-08-20T00:00:00.000Z"),
      invitationTokenDigest: firstDigest,
      subjectId: firstProject.id,
      subjectType: "project",
      workspaceId: owner.workspaceId,
    });
    const firstAccepted = await collaboration.acceptInvitation({
      fullName: "Alias Boundary Delegate",
      passwordHash: "$argon2id$synthetic-alias-boundary-hash",
      tokenDigest: firstDigest,
    });
    await collaboration.ensureAliasesForUser(
      owner.workspaceId,
      firstAccepted.userId,
      () => `Synthetic Alias ${randomUUID()}`,
    );
    for (const task of firstTasks) {
      await collaboration.updateTaskDelegateSharing({
        actorUserId: owner.userId,
        selectedUserIds: [],
        taskId: task.id,
        visibility: "project_delegates",
        workspaceId: owner.workspaceId,
      });
    }
    const secondDigest = createHash("sha256").update("second-alias-project-token").digest("hex");
    await collaboration.createAccessGrant({
      accessRole: "project_collaborator",
      actorUserId: owner.userId,
      anonymise: true,
      delegateEmail: "alias-boundary@example.test",
      delegationNote: null,
      encryptedInvitationPayload: null,
      expiresAt: null,
      invitationExpiresAt: new Date("2030-08-20T00:00:00.000Z"),
      invitationTokenDigest: secondDigest,
      subjectId: secondProject.id,
      subjectType: "project",
      workspaceId: owner.workspaceId,
    });
    await collaboration.acceptInvitation({
      tokenDigest: secondDigest,
      userId: firstAccepted.userId,
    });
    await collaboration.ensureAliasesForUser(
      owner.workspaceId,
      firstAccepted.userId,
      () => `Synthetic Alias ${randomUUID()}`,
    );
    await collaboration.updateTaskDelegateSharing({
      actorUserId: owner.userId,
      selectedUserIds: [],
      taskId: secondTask.id,
      visibility: "project_delegates",
      workspaceId: owner.workspaceId,
    });
    const firstProjectAccess = await collaboration.resolveAccess(
      owner.workspaceId,
      firstAccepted.userId,
      "project",
      firstProject.id,
    );
    const secondProjectAccess = await collaboration.resolveAccess(
      owner.workspaceId,
      firstAccepted.userId,
      "project",
      secondProject.id,
    );
    expect(firstProjectAccess?.alias).toBeTruthy();
    expect(secondProjectAccess?.alias).toBeTruthy();
    expect(secondProjectAccess?.alias).not.toBe(firstProjectAccess?.alias);
    for (const task of firstTasks) {
      expect(
        await collaboration.resolveAccess(owner.workspaceId, firstAccepted.userId, "task", task.id),
      ).toMatchObject({ alias: firstProjectAccess?.alias, inherited: true });
    }
    expect(
      await collaboration.resolveAccess(
        owner.workspaceId,
        firstAccepted.userId,
        "task",
        secondTask.id,
      ),
    ).toMatchObject({ alias: secondProjectAccess?.alias, inherited: true });
  });

  it("keeps chatter and timesheets scoped to authorised principals and immutable audit", async () => {
    const owner = await store.findUserForLogin("synthetic-owner");
    if (!owner?.ownerId) throw new Error("Expected unified owner.");
    const task = await store.createTask(owner.workspaceId, owner.ownerId, {
      allocatedHours: 3,
      title: "Collaborative activity fixture",
      workflowLane: "inbox",
    });
    const digest = createHash("sha256").update("second-synthetic-invitation-token").digest("hex");
    await collaboration.createAccessGrant({
      accessRole: "contributor",
      actorUserId: owner.userId,
      delegateEmail: "activity-delegate@example.test",
      delegationNote: null,
      encryptedInvitationPayload: null,
      expiresAt: new Date("2030-09-01T00:00:00.000Z"),
      invitationExpiresAt: new Date("2030-08-20T00:00:00.000Z"),
      invitationTokenDigest: digest,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    const accepted = await collaboration.acceptInvitation({
      fullName: "Activity Delegate",
      passwordHash: "$argon2id$synthetic-activity-hash",
      tokenDigest: digest,
    });
    const participants = await collaboration.listSubjectParticipants(
      owner.workspaceId,
      "delegate",
      "task",
      task.id,
      accepted.userId,
    );
    expect(participants.map((participant) => participant.userId)).toEqual(
      expect.arrayContaining([owner.userId, accepted.userId]),
    );
    expect(
      participants.find((participant) => participant.userId === accepted.userId),
    ).toMatchObject({
      displayName: "You",
    });
    expect(participants.find((participant) => participant.userId === owner.userId)).toMatchObject({
      displayName: "Workspace owner",
    });
    const eventId = await collaboration.createActivity({
      actorAlias: null,
      actorUserId: accepted.userId,
      body: "The scoped implementation is ready for review.",
      contentStatus: "approved",
      kind: "message",
      mentionedUserIds: [owner.userId],
      notificationUserIds: [owner.userId],
      quarantineReason: null,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    expect(
      await collaboration.listActivity({
        subjectId: task.id,
        subjectType: "task",
        viewerRole: "delegate",
        viewerUserId: accepted.userId,
        workspaceId: owner.workspaceId,
      }),
    ).toContainEqual(
      expect.objectContaining({
        body: "The scoped implementation is ready for review.",
        id: eventId,
      }),
    );
    await collaboration.createTimeEntry({
      accessGrantId:
        (await collaboration.resolveAccess(owner.workspaceId, accepted.userId, "task", task.id))
          ?.grantId ?? null,
      actorAlias: null,
      actorUserId: accepted.userId,
      description: "Implemented the scoped collaboration fixture.",
      entryDate: "2030-08-18",
      hours: 1.25,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    const entries = await collaboration.listTimeEntries({
      subjectId: task.id,
      subjectType: "task",
      viewerRole: "owner",
      workspaceId: owner.workspaceId,
    });
    expect(entries).toContainEqual(
      expect.objectContaining({ hours: 1.25, userId: accepted.userId }),
    );
    const entry = entries.find((candidate) => candidate.userId === accepted.userId);
    if (entry === undefined) throw new Error("Expected delegate time entry.");
    await collaboration.updateTimeEntry({
      actorUserId: accepted.userId,
      canManageAll: false,
      description: "Implemented and verified the fixture.",
      entryDate: entry.entryDate,
      entryId: entry.id,
      hours: 1.5,
      subjectId: task.id,
      subjectType: "task",
      version: entry.version,
      workspaceId: owner.workspaceId,
    });
    expect(
      (await store.listTasks(owner.workspaceId, "manual")).find(
        (candidate) => candidate.id === task.id,
      ),
    ).toMatchObject({ hoursSpent: 1.5 });
    await collaboration.deleteTimeEntry({
      actorUserId: accepted.userId,
      canManageAll: false,
      entryId: entry.id,
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    expect(
      (await store.listTasks(owner.workspaceId, "manual")).find(
        (candidate) => candidate.id === task.id,
      ),
    ).toMatchObject({ hoursSpent: 0 });
  });

  it("inherits project clearance across tasks and keeps assignment separate", async () => {
    const owner = await store.findUserForLogin("synthetic-owner");
    if (!owner?.ownerId) throw new Error("Expected unified owner.");
    const project = await store.createProject(owner.workspaceId, owner.ownerId, {
      name: "Project collaboration fixture",
    });
    const internalTask = await store.createTask(owner.workspaceId, owner.ownerId, {
      projectId: project.id,
      title: "Initially internal project task",
    });
    const digest = createHash("sha256")
      .update("project-collaborator-invitation-token")
      .digest("hex");
    await collaboration.createAccessGrant({
      accessRole: "project_collaborator",
      actorUserId: owner.userId,
      delegateEmail: "project-collaborator@example.test",
      delegationNote: "Create only work needed for this project.",
      encryptedInvitationPayload: null,
      expiresAt: new Date("2030-09-01T00:00:00.000Z"),
      invitationExpiresAt: new Date("2030-08-20T00:00:00.000Z"),
      invitationTokenDigest: digest,
      privacyKeywords: ["project-collaborator.example.test"],
      profileDescription: "Reusable project collaborator profile.",
      subjectId: project.id,
      subjectType: "project",
      workspaceId: owner.workspaceId,
    });
    const accepted = await collaboration.acceptInvitation({
      fullName: "Project Collaborator",
      passwordHash: "$argon2id$synthetic-project-collaborator-hash",
      tokenDigest: digest,
    });
    const collaborator = await store.findUserForLogin("project-collaborator@example.test");
    if (collaborator === null) throw new Error("Expected project collaborator.");
    expect(
      await collaboration.resolveAccess(
        owner.workspaceId,
        accepted.userId,
        "task",
        internalTask.id,
      ),
    ).toMatchObject({ accessRole: "project_collaborator", inherited: true });
    const visibleWorkspace = await collaboration.listDelegateWorkspace(
      owner.workspaceId,
      collaborator.membershipId,
      accepted.userId,
    );
    expect(visibleWorkspace.projects).toContainEqual(
      expect.objectContaining({ id: project.id, taskCount: 1 }),
    );
    expect(visibleWorkspace.tasks).toContainEqual(
      expect.objectContaining({ assigned: false, id: internalTask.id }),
    );
    const doneStage = visibleWorkspace.stages.find((stage) => stage.semanticKind === "complete");
    if (doneStage === undefined) throw new Error("Expected Done stage.");
    expect(doneStage.name).toBe("Done");
    expect(
      await collaboration.updateDelegateStage(
        collaborator.membershipId,
        doneStage.id,
        "Completed",
        doneStage.version,
      ),
    ).toMatchObject({ name: "Completed", version: doneStage.version + 1 });
    expect(
      await collaboration.listTaskAssignmentCandidates(owner.workspaceId, internalTask.id),
    ).toContainEqual(
      expect.objectContaining({
        assigned: false,
        clearanceScope: "project",
        userId: accepted.userId,
      }),
    );
    expect(
      await collaboration.updateTaskAssignments({
        actorUserId: owner.userId,
        delegateUserIds: [accepted.userId],
        taskId: internalTask.id,
        workspaceId: owner.workspaceId,
      }),
    ).toContainEqual(expect.objectContaining({ assigned: true, userId: accepted.userId }));
    expect(
      (
        await collaboration.listDelegateWorkspace(
          owner.workspaceId,
          collaborator.membershipId,
          accepted.userId,
        )
      ).tasks,
    ).toContainEqual(expect.objectContaining({ assigned: true, id: internalTask.id }));
    expect(
      (await store.listTasks(owner.workspaceId, "manual")).find(
        (candidate) => candidate.id === internalTask.id,
      ),
    ).toMatchObject({ ownerWorkAssigned: false, workflowLane: "delegated" });
    expect(
      await collaboration.updateTaskAssignments({
        actorUserId: owner.userId,
        delegateUserIds: [],
        taskId: internalTask.id,
        workspaceId: owner.workspaceId,
      }),
    ).toContainEqual(expect.objectContaining({ assigned: false, userId: accepted.userId }));
    expect(
      (
        await collaboration.listDelegateWorkspace(
          owner.workspaceId,
          collaborator.membershipId,
          accepted.userId,
        )
      ).tasks,
    ).toContainEqual(expect.objectContaining({ assigned: false, id: internalTask.id }));
    await collaboration.updateTaskDelegateSharing({
      actorUserId: owner.userId,
      selectedUserIds: [],
      taskId: internalTask.id,
      visibility: "project_delegates",
      workspaceId: owner.workspaceId,
    });
    expect(
      await collaboration.resolveAccess(
        owner.workspaceId,
        accepted.userId,
        "task",
        internalTask.id,
      ),
    ).toMatchObject({ accessRole: "project_collaborator", inherited: true });
    await collaboration.updateTaskDelegateSharing({
      actorUserId: owner.userId,
      selectedUserIds: [accepted.userId],
      taskId: internalTask.id,
      visibility: "selected_delegates",
      workspaceId: owner.workspaceId,
    });
    expect(await collaboration.getTaskDelegateSharing(owner.workspaceId, internalTask.id)).toEqual({
      selectedUserIds: [accepted.userId],
      visibility: "selected_delegates",
    });
    expect(
      await collaboration.resolveAccess(
        owner.workspaceId,
        accepted.userId,
        "task",
        internalTask.id,
      ),
    ).toMatchObject({ inherited: true });
    const reusedProject = await store.createProject(owner.workspaceId, owner.ownerId, {
      name: "Existing-profile clearance fixture",
    });
    const reusedProjectTask = await store.createTask(owner.workspaceId, owner.ownerId, {
      projectId: reusedProject.id,
      title: "Visible through reused project clearance",
    });
    const reusedProjectGrant = await collaboration.createExistingUserAccessGrant({
      accessRole: "contributor",
      actorUserId: owner.userId,
      delegateUserId: accepted.userId,
      delegationNote: "Use the existing delegate profile.",
      expiresAt: null,
      subjectId: reusedProject.id,
      subjectType: "project",
      workspaceId: owner.workspaceId,
    });
    expect(reusedProjectGrant).toMatchObject({
      profileDescription: "Reusable project collaborator profile.",
      status: "active",
    });
    expect(
      await collaboration.resolveAccess(
        owner.workspaceId,
        accepted.userId,
        "task",
        reusedProjectTask.id,
      ),
    ).toMatchObject({ inherited: true });
    const standaloneTask = await store.createTask(owner.workspaceId, owner.ownerId, {
      title: "Existing-profile direct task fixture",
    });
    await collaboration.createExistingUserAccessGrant({
      accessRole: "contributor",
      actorUserId: owner.userId,
      delegateUserId: accepted.userId,
      delegationNote: null,
      expiresAt: null,
      subjectId: standaloneTask.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    expect(
      await collaboration.resolveAccess(
        owner.workspaceId,
        accepted.userId,
        "task",
        standaloneTask.id,
      ),
    ).toMatchObject({ inherited: false });
    expect(
      await collaboration.listTaskAssignmentCandidates(owner.workspaceId, standaloneTask.id),
    ).toContainEqual(expect.objectContaining({ assigned: true, userId: accepted.userId }));
    const createdTaskId = await collaboration.createDelegateProjectTask({
      allocatedHours: 1.5,
      actorUserId: accepted.userId,
      definitionOfDone: "The synthetic outcome is independently verifiable.",
      description: "A delegate-created task with an explicit safe scope.",
      membershipId: collaborator.membershipId,
      projectId: project.id,
      title: "Delegate-created project task",
      workspaceId: owner.workspaceId,
    });
    const delegateSubtaskId = await collaboration.createDelegateSubtask({
      actorAlias: null,
      actorUserId: accepted.userId,
      description: "Only the creator may edit this item.",
      label: "Delegate-owned subtask",
      predictedHours: 0.5,
      taskId: createdTaskId,
      workspaceId: owner.workspaceId,
    });
    const delegateSubtask = (
      await collaboration.listDelegateSubtasks(createdTaskId, accepted.userId)
    ).find((subtask) => subtask.id === delegateSubtaskId);
    if (delegateSubtask === undefined) throw new Error("Expected delegate-owned subtask.");
    expect(delegateSubtask).toMatchObject({ canEdit: true, predictedHours: 0.5 });
    await collaboration.updateDelegateSubtask({
      actorAlias: null,
      actorUserId: accepted.userId,
      completed: true,
      description: delegateSubtask.description,
      label: delegateSubtask.label,
      predictedHours: delegateSubtask.predictedHours,
      subtaskId: delegateSubtask.id,
      taskId: createdTaskId,
      version: delegateSubtask.version,
      workspaceId: owner.workspaceId,
    });
    expect(
      (await collaboration.listDelegateSubtasks(createdTaskId, accepted.userId))[0],
    ).toMatchObject({ completed: true });
    expect(
      await collaboration.resolveAccess(owner.workspaceId, accepted.userId, "task", createdTaskId),
    ).toMatchObject({ accessRole: "project_collaborator", inherited: true });
    expect(
      (
        await collaboration.listDelegateWorkspace(
          owner.workspaceId,
          collaborator.membershipId,
          accepted.userId,
        )
      ).tasks,
    ).toContainEqual(expect.objectContaining({ id: createdTaskId }));
    await collaboration.updateCollaborationFlags(owner.workspaceId, owner.userId, {
      complianceMonitorEnabled: true,
      delegateUploadsEnabled: false,
      invitationEmailEnabled: false,
      multiUserEnabled: true,
    });
    await collaboration.createActivity({
      actorAlias: null,
      actorUserId: accepted.userId,
      body: "A synthetic message that requires private model triage.",
      contentStatus: "approved",
      kind: "message",
      mentionedUserIds: [],
      notificationUserIds: [],
      quarantineReason: null,
      subjectId: createdTaskId,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    const complianceJob = await collaboration.claimComplianceJob();
    if (complianceJob === null) throw new Error("Expected a compliance job.");
    await collaboration.completeComplianceJob({
      categories: ["off_platform_solicitation"],
      flagged: true,
      job: complianceJob,
      model: "synthetic-model",
      provider: "deterministic-fake",
      reason: "Synthetic owner review fixture.",
      riskLevel: "medium",
    });
    const complianceFlag = (await collaboration.listComplianceFlags(owner.workspaceId)).find(
      (flag) => flag.subjectId === createdTaskId && flag.status === "open",
    );
    if (complianceFlag === undefined) throw new Error("Expected a private compliance flag.");
    await collaboration.reviewComplianceFlag({
      action: "restrict",
      actorUserId: owner.userId,
      flagId: complianceFlag.id,
      workspaceId: owner.workspaceId,
    });
    expect(
      await collaboration.resolveAccess(owner.workspaceId, accepted.userId, "task", createdTaskId),
    ).toMatchObject({ accessRole: "reviewer" });
    const restrictedWorkspace = await collaboration.listDelegateWorkspace(
      owner.workspaceId,
      collaborator.membershipId,
      accepted.userId,
    );
    const restrictedTask = restrictedWorkspace.tasks.find((task) => task.id === createdTaskId);
    const readyStage = restrictedWorkspace.stages.find(
      (stage) => stage.semanticKind === "ready_for_review",
    );
    if (restrictedTask === undefined || readyStage === undefined) {
      throw new Error("Expected restricted delegate task state.");
    }
    await expect(
      collaboration.updateDelegateTaskState({
        latestUpdate: "A reviewer must not mark delivery ready.",
        membershipId: collaborator.membershipId,
        stageId: readyStage.id,
        taskId: createdTaskId,
        userId: accepted.userId,
        version: restrictedTask.stateVersion,
        workspaceId: owner.workspaceId,
      }),
    ).rejects.toBeInstanceOf(StoreConflictError);
  });

  it("persists, expires, and revokes only digested session tokens", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected bootstrapped owner.");
    const rawToken = "synthetic-session-token-not-for-storage";
    const tokenDigest = createHash("sha256").update(rawToken).digest("hex");
    const now = new Date("2026-08-04T12:00:00.000Z");
    const times: SessionTimes = {
      absoluteExpiresAt: new Date("2026-08-11T12:00:00.000Z"),
      createdAt: now,
      idleExpiresAt: new Date("2026-08-05T00:00:00.000Z"),
      lastSeenAt: now,
      recentAuthenticatedAt: now,
      revokedAt: null,
    };
    const session = await store.createSession(owner, tokenDigest, times);
    const serialized = JSON.stringify(await store.findSessionByDigest(tokenDigest));
    expect(serialized).not.toContain(rawToken);
    await store.revokeSession(session.id);
    expect((await store.findSessionByDigest(tokenDigest))?.revokedAt).toBeInstanceOf(Date);
  });

  it("enforces optimistic settings versions and database ranges", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    const current = await store.getWorkspaceConfiguration(owner.workspaceId);
    const version = await store.updateGeneral(owner.workspaceId, owner.ownerId, {
      ...current.general,
      displayName: "Updated synthetic workspace",
      fullName: "Alexandra Simões",
      knownAs: ["Alex", "Sandra"],
    });
    expect(version).toBe(current.general.version + 1);
    expect((await store.getWorkspaceConfiguration(owner.workspaceId)).general).toMatchObject({
      fullName: "Alexandra Simões",
      knownAs: ["Alex", "Sandra"],
    });
    await expect(
      store.updateGeneral(owner.workspaceId, owner.ownerId, current.general),
    ).rejects.toBeInstanceOf(StoreConflictError);
    await expect(
      pool.query(
        `UPDATE opsweave.workspace_working_hours SET available_hours=25
         WHERE workspace_id=$1 AND weekday='monday'`,
        [owner.workspaceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("creates project and task boards with stable manual and value ordering", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    const stages = await store.listProjectStages(owner.workspaceId);
    expect(stages.map((stage) => stage.name)).toEqual([
      "Planned",
      "In progress",
      "Done",
      "Cancelled",
    ]);
    const project = await store.createProject(owner.workspaceId, owner.ownerId, {
      llmLink: "https://example.com/synthetic-project",
      name: "Phase 2 project",
      priorityLevel: 4,
    });
    expect(project.stageId).toBe(stages[0]?.id);
    expect(project).toMatchObject({
      llmLink: "https://example.com/synthetic-project",
      priorityLevel: 4,
    });
    const blockerProject = await store.createProject(owner.workspaceId, owner.ownerId, {
      name: "Blocking project",
    });
    await store.createProjectDependency(
      owner.workspaceId,
      owner.ownerId,
      project.id,
      blockerProject.id,
    );
    expect(await store.listProjectDependencies(owner.workspaceId)).toContainEqual({
      dependsOnProjectId: blockerProject.id,
      projectId: project.id,
    });
    await expect(
      store.createProjectDependency(
        owner.workspaceId,
        owner.ownerId,
        blockerProject.id,
        project.id,
      ),
    ).rejects.toBeInstanceOf(StoreConflictError);
    await store.removeProjectDependency(
      owner.workspaceId,
      owner.ownerId,
      project.id,
      blockerProject.id,
    );
    const first = await store.createTask(owner.workspaceId, owner.ownerId, {
      allocatedHours: 4,
      businessValueScore: 30,
      checklist: [{ completed: false, label: "Define outcome", position: 0 }],
      dueDate: "2026-08-10",
      hoursSpent: 1.5,
      projectId: project.id,
      size: "medium",
      startDate: "2026-08-08",
      title: "Lower value task",
      valueSource: "owner",
      workflowLane: "inbox",
    });
    const second = await store.createTask(owner.workspaceId, owner.ownerId, {
      businessValueScore: 90,
      title: "Higher value task",
      valueSource: "owner",
      workflowLane: "inbox",
    });
    const edited = await store.updateTask(owner.workspaceId, owner.ownerId, first.id, {
      allocatedHours: 6,
      businessValueRationale: "Prevents avoidable operational rework.",
      businessValueScore: 45,
      checklist: first.checklist,
      dueDate: first.dueDate,
      hoursSpent: 3,
      projectId: first.projectId,
      size: "large",
      startDate: first.startDate,
      title: "Edited lower value task",
      valueSource: "owner",
      version: first.version,
      workflowLane: first.workflowLane,
    });
    expect(edited).toMatchObject({
      allocatedHours: 6,
      businessValueRationale: "Prevents avoidable operational rework.",
      businessValueScore: 45,
      hoursSpent: 1.5,
      size: "mega",
      title: "Edited lower value task",
      valueSource: "owner",
      version: first.version + 1,
    });
    const updateAudit = (
      await store.listEntityAuditEvents(owner.workspaceId, "task", first.id)
    ).find((event) => event.action === "task.updated");
    expect(updateAudit).toBeDefined();
    expect(updateAudit?.metadata).toMatchObject({
      changes: {
        allocatedHours: { from: 4, to: 6 },
      },
    });
    await store.rescheduleTask(
      owner.workspaceId,
      owner.ownerId,
      edited.id,
      edited.version,
      new Date("2026-08-08T20:00:00.000Z"),
    );
    let scheduled = (await store.listTasks(owner.workspaceId, "manual")).find(
      (task) => task.id === edited.id,
    );
    expect(scheduled).toMatchObject({
      dueDate: "2026-08-10",
      plannedDate: "2026-08-10",
      plannedEndTime: "13:30",
      plannedStartTime: "09:00",
      scheduleLocked: true,
      startDate: "2026-08-08",
    });
    await store.shiftProjectSchedule(
      owner.workspaceId,
      owner.ownerId,
      project.id,
      project.version,
      1_440,
    );
    scheduled = (await store.listTasks(owner.workspaceId, "manual")).find(
      (task) => task.id === edited.id,
    );
    expect(scheduled).toMatchObject({
      dueDate: "2026-08-10",
      plannedDate: "2026-08-11",
      plannedEndTime: "13:30",
      plannedStartTime: "09:00",
      scheduleLocked: true,
      startDate: "2026-08-08",
    });
    expect(first.checklist).toHaveLength(1);
    expect(
      (await store.listTasks(owner.workspaceId, "greatest_value"))
        .filter((task) => task.workflowLane === "inbox")
        .slice(0, 2)
        .map((task) => task.id),
    ).toEqual([second.id, first.id]);
    const movedSecond = await store.moveTask(
      owner.workspaceId,
      owner.ownerId,
      second.id,
      "today",
      second.version,
    );
    const nextFirst = await store.listTasks(owner.workspaceId, "manual");
    const moved = nextFirst.find((task) => task.id === second.id);
    expect(moved?.workflowLane).toBe("today");
    await store.createTaskDependency(owner.workspaceId, owner.ownerId, first.id, second.id);
    expect(await store.listTaskDependencies(owner.workspaceId)).toContainEqual({
      dependsOnTaskId: second.id,
      taskId: first.id,
    });
    await expect(
      store.createTaskDependency(owner.workspaceId, owner.ownerId, second.id, first.id),
    ).rejects.toBeInstanceOf(StoreConflictError);
    await store.createEntityDependency(
      owner.workspaceId,
      owner.ownerId,
      "task",
      first.id,
      "project",
      blockerProject.id,
    );
    expect(await store.listEntityDependencies(owner.workspaceId)).toContainEqual({
      blockerId: blockerProject.id,
      blockerType: "project",
      dependentId: first.id,
      dependentType: "task",
    });
    await expect(
      store.createEntityDependency(
        owner.workspaceId,
        owner.ownerId,
        "project",
        blockerProject.id,
        "task",
        first.id,
      ),
    ).rejects.toBeInstanceOf(StoreConflictError);
    await store.removeEntityDependency(
      owner.workspaceId,
      owner.ownerId,
      "task",
      first.id,
      "project",
      blockerProject.id,
    );
    await expect(
      pool.query(
        "UPDATE opsweave.tasks SET start_date='2026-09-02',due_date='2026-09-01' WHERE id=$1",
        [first.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const context = await store.getAiWorkspaceContext(
      owner.workspaceId,
      "Estimate allocated hours for this project task",
    );
    expect(context.projects).toContainEqual(expect.objectContaining({ id: project.id }));
    expect(context.learning).toContainEqual(expect.objectContaining({ kind: "task_correction" }));
    await store.deleteTask(owner.workspaceId, owner.ownerId, movedSecond.id, movedSecond.version);
    expect((await store.listTasks(owner.workspaceId, "manual")).map(({ id }) => id)).not.toContain(
      second.id,
    );
    expect(await store.listLearningEvents(owner.workspaceId)).toContainEqual(
      expect.objectContaining({ kind: "task_deleted", sourceEntityId: second.id }),
    );
    await store.removeTaskDependency(owner.workspaceId, owner.ownerId, first.id, second.id);
    await expect(
      store.updateTask(owner.workspaceId, owner.ownerId, first.id, {
        businessValueScore: 99,
        title: edited.title,
        valueSource: "ai_proposed",
        version: edited.version,
        workflowLane: edited.workflowLane,
      }),
    ).rejects.toBeInstanceOf(StoreConflictError);
  });

  it("derives hours and size and applies attachment retention through the linked project", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    const stages = await store.listProjectStages(owner.workspaceId);
    const planned = stages.find((stage) => stage.name === "Planned");
    const done = stages.find((stage) => stage.name === "Done");
    if (planned === undefined || done === undefined) throw new Error("Expected project stages.");
    const project = await store.createProject(owner.workspaceId, owner.ownerId, {
      name: "Retention test project",
      stageId: planned.id,
    });
    const task = await store.createTask(owner.workspaceId, owner.ownerId, {
      allocatedHours: 5,
      projectId: project.id,
      title: "Retention test task",
    });
    expect(task.size).toBe("mega");
    const time = await store.addTaskTimeEntry(owner.workspaceId, owner.ownerId, task.id, {
      description: "Synthetic work log",
      entryDate: "2026-08-14",
      hours: 1.5,
    });
    expect(time.hoursSpent).toBe(1.5);
    const attachment = await store.addAttachment(owner.workspaceId, owner.ownerId, {
      byteSize: 12,
      contentType: "text/plain",
      entityId: task.id,
      entityType: "task",
      originalName: "synthetic.txt",
      storageKey: randomUUID(),
    });
    expect(attachment.purgeAfter).toBeNull();
    const terminal = await store.updateProject(owner.workspaceId, owner.ownerId, project.id, {
      name: project.name,
      stageId: done.id,
      version: project.version,
    });
    expect(
      (await store.getAttachment(owner.workspaceId, attachment.id))?.purgeAfter,
    ).toBeInstanceOf(Date);
    await store.updateProject(owner.workspaceId, owner.ownerId, project.id, {
      name: project.name,
      stageId: planned.id,
      version: terminal.version,
    });
    expect((await store.getAttachment(owner.workspaceId, attachment.id))?.purgeAfter).toBeNull();
  });

  it("applies scheduled moves atomically and only once per local date", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    const configuration = await store.getWorkspaceConfiguration(owner.workspaceId);
    const task = await store.createTask(owner.workspaceId, owner.ownerId, {
      allocatedHours: 1,
      size: "small",
      title: "Automation rollover task",
      workflowLane: "today",
    });
    const input = {
      destinationLane: "this_week" as const,
      kind: "daily_rollover" as const,
      localDate: "2026-08-14",
      ownerId: owner.ownerId,
      resetFromLanes: ["today" as const],
      resetToLane: "this_week" as const,
      selectedIds: [],
      settingsSnapshot: configuration,
      settingsVersion: configuration.prioritization.version,
      workspaceId: owner.workspaceId,
    };
    await expect(store.applyAutomationRun(input)).resolves.toBe(true);
    await expect(store.applyAutomationRun(input)).resolves.toBe(false);
    expect(
      (await store.listTasks(owner.workspaceId, "manual")).find(({ id }) => id === task.id),
    ).toMatchObject({
      workflowLane: "this_week",
    });
    const manualInput = {
      ...input,
      kind: "daily" as const,
      resetFromLanes: [],
    };
    await expect(store.applyAutomationRun(manualInput)).resolves.toBe(true);
    await expect(store.applyAutomationRun(manualInput)).resolves.toBe(true);
    await expect(
      pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM opsweave.planning_runs
         WHERE workspace_id=$1 AND kind='daily' AND scheduled_for IS NULL`,
        [owner.workspaceId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: "2" }] });
  });

  it("schedules automatic focus work around a manually locked commitment", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    const locked = await store.createTask(owner.workspaceId, owner.ownerId, {
      allocatedHours: 1,
      title: "Locked planning commitment",
      workflowLane: "today",
    });
    await store.rescheduleTask(
      owner.workspaceId,
      owner.ownerId,
      locked.id,
      locked.version,
      new Date("2030-01-07T09:00:00.000Z"),
    );
    const selected = await store.createTask(owner.workspaceId, owner.ownerId, {
      allocatedHours: 1,
      title: "Automatically planned around commitment",
      workflowLane: "this_week",
    });
    const configuration = await store.getWorkspaceConfiguration(owner.workspaceId);

    await expect(
      store.applyAutomationRun({
        assessments: [
          {
            planningRationale: "Highest feasible work after the locked commitment.",
            planningScore: 80,
            reason: "selected",
            selected: true,
            taskId: selected.id,
          },
        ],
        destinationLane: "today",
        gapMinutes: 30,
        kind: "daily_selection",
        localDate: "2030-01-07",
        ownerId: owner.ownerId,
        resetFromLanes: [],
        resetToLane: "this_week",
        scheduleFromDate: "2030-01-07",
        selectedIds: [selected.id],
        settingsSnapshot: configuration,
        settingsVersion: configuration.prioritization.version,
        workspaceId: owner.workspaceId,
      }),
    ).resolves.toBe(true);
    expect(
      (await store.listTasks(owner.workspaceId, "manual")).find((task) => task.id === selected.id),
    ).toMatchObject({
      plannedDate: "2030-01-07",
      plannedEndTime: "11:30",
      plannedStartTime: "10:30",
      workflowLane: "today",
    });
  });

  it("stores provider credentials as ciphertext and redacts audit metadata", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    const plaintext = "synthetic-provider-secret-never-store";
    await store.saveCredential({
      envelope: {
        algorithm: "aes-256-gcm",
        authenticationTag: "synthetic-tag",
        ciphertext: Buffer.from("encrypted synthetic value").toString("base64"),
        envelopeVersion: 1,
        initializationVector: "synthetic-iv",
        keyVersion: 1,
      },
      ownerId: owner.ownerId,
      provider: "fake",
      workspaceId: owner.workspaceId,
    });
    expect(JSON.stringify(await store.credentialEnvelope(owner.workspaceId, "fake"))).not.toContain(
      plaintext,
    );
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='opsweave' AND table_name='encrypted_provider_credentials'`,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain("plaintext");
    expect(JSON.stringify(await store.listAuditMetadata(owner.workspaceId))).not.toContain(
      plaintext,
    );
    await store.removeCredential(owner.workspaceId, owner.ownerId, "fake");
    expect((await store.credentialStatus(owner.workspaceId, "fake")).configured).toBe(false);
  });

  it("surfaces duplicate intake, preserves approval provenance, and purges expired Trash", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    const first = await store.submitIntakeSource(owner.workspaceId, owner.ownerId, {
      content: "Prepare a synthetic continuity runbook",
      sourceType: "instruction",
    });
    expect(first.duplicateOfSourceId).toBeNull();
    const claimedFirst = await store.nextQueuedIntakeRun();
    expect(claimedFirst?.id).toBe(first.id);
    await store.completeIntakeRun(first.id, {
      projects: [
        {
          clientRef: "continuity-program",
          description: "Operational continuity work.",
          name: "Continuity program",
          priorityLevel: 5,
        },
      ],
      questions: [],
      summary: "Prepare a runbook.",
      tasks: [
        {
          allocatedHours: 5,
          businessValueRationale: "Synthetic resilience value",
          businessValueScore: 80,
          checklist: ["Draft the recovery sequence", "Review the runbook"],
          confidence: 0.8,
          definitionOfDone: "The runbook is reviewed.",
          dueDate: "2026-09-01",
          projectId: null,
          proposedProjectRef: "continuity-program",
          size: "medium",
          sourceSpan: "continuity runbook",
          startDate: "2026-08-20",
          title: "Prepare continuity runbook",
          valueAdd: "Faster recovery.",
          workDescription: "Document the continuity response.",
        },
        {
          assigneeName: "Brian Vassallo",
          businessValueRationale: "Tracks an external commitment.",
          businessValueScore: 50,
          confidence: 0.9,
          dueDate: null,
          ownerTask: false,
          sourceSpan: "Brian will confirm the window.",
          title: "Confirm the third-party recovery window",
        },
        {
          businessValueRationale: "Effort needs owner review.",
          businessValueScore: 40,
          confidence: 0.7,
          dueDate: null,
          sourceSpan: "Capture the open recovery question.",
          title: "Capture the open recovery question",
        },
      ],
    });
    const firstDraft = (await store.listIntakeDrafts(owner.workspaceId)).find(
      (draft) => draft.status === "review_required",
    );
    expect(firstDraft).toBeDefined();
    if (firstDraft === undefined) throw new Error("Expected review draft.");
    await store.approveIntakeDraft(owner.workspaceId, owner.ownerId, firstDraft.id);
    const approvedTask = (await store.listTasks(owner.workspaceId, "manual")).find(
      (task) => task.title === "Prepare continuity runbook",
    );
    expect(approvedTask).toMatchObject({
      allocatedHours: 5,
      businessValueScore: 80,
      dueDate: "2026-09-01",
      size: "mega",
      startDate: "2026-08-20",
      valueSource: "ai_proposed",
    });
    expect(approvedTask?.checklist).toHaveLength(2);
    expect(
      (await store.listTasks(owner.workspaceId, "manual")).find(
        (task) => task.title === "Capture the open recovery question",
      ),
    ).toMatchObject({ allocatedHours: null, requiresBreakdown: false, size: null });
    expect(
      (await store.listTasks(owner.workspaceId, "manual")).find(
        (task) => task.title === "Confirm the third-party recovery window",
      ),
    ).toBeUndefined();
    const intakeProject = (await store.listProjects(owner.workspaceId)).find(
      (candidate) => candidate.name === "Continuity program",
    );
    expect(intakeProject).toMatchObject({ priorityLevel: 5 });
    expect(approvedTask?.projectId).toBe(intakeProject?.id);
    expect(
      await pool.query(
        `SELECT confidence::float8,source_span FROM opsweave.task_intake_origins
         WHERE task_id=$1 AND draft_id=$2`,
        [approvedTask?.id, firstDraft.id],
      ),
    ).toMatchObject({ rows: [{ confidence: 0.8, source_span: "continuity runbook" }] });

    const duplicate = await store.submitIntakeSource(owner.workspaceId, owner.ownerId, {
      content: "  Prepare   a synthetic continuity runbook  ",
      sourceType: "meeting_note",
    });
    expect(duplicate.duplicateOfSourceId).toBe(first.sourceId);
    const claimedDuplicate = await store.nextQueuedIntakeRun();
    expect(claimedDuplicate?.id).toBe(duplicate.id);
    await store.failIntakeRun(duplicate.id, "Synthetic safe provider failure.");
    expect(await store.listFailedIntakeRuns(owner.workspaceId)).toContainEqual(
      expect.objectContaining({ id: duplicate.id, safeError: "Synthetic safe provider failure." }),
    );
    await store.retryIntakeRun(owner.workspaceId, owner.ownerId, duplicate.id);
    expect((await store.nextQueuedIntakeRun())?.id).toBe(duplicate.id);
    await store.completeIntakeRun(duplicate.id, {
      questions: [],
      summary: "Duplicate proposal kept separate.",
      tasks: [],
    });
    const duplicateDraft = (await store.listIntakeDrafts(owner.workspaceId)).find(
      (draft) => draft.duplicateOfSourceId === first.sourceId,
    );
    expect(duplicateDraft).toBeDefined();
    if (duplicateDraft === undefined) throw new Error("Expected duplicate draft.");
    await store.declineIntakeDraft(owner.workspaceId, owner.ownerId, duplicateDraft.id);
    const trashed = (await store.listIntakeDrafts(owner.workspaceId)).find(
      (draft) => draft.id === duplicateDraft.id,
    );
    expect(trashed?.purgeAfter).toBeInstanceOf(Date);
    expect(trashed?.status).toBe("trashed");
    await store.restoreIntakeDraft(owner.workspaceId, owner.ownerId, duplicateDraft.id);
    await store.declineIntakeDraft(owner.workspaceId, owner.ownerId, duplicateDraft.id);
    await pool.query("UPDATE opsweave.trash_records SET purge_after=$2 WHERE entity_id=$1", [
      duplicateDraft.id,
      new Date("2026-08-01T00:00:00.000Z"),
    ]);
    await expect(
      store.restoreIntakeDraft(owner.workspaceId, owner.ownerId, duplicateDraft.id),
    ).rejects.toBeInstanceOf(StoreConflictError);
    const purgeTime = new Date("2026-08-02T00:00:00.000Z");
    expect(await store.purgeExpiredIntakeDrafts(purgeTime)).toBe(1);
    expect(await store.purgeExpiredIntakeDrafts(purgeTime)).toBe(0);
    expect(
      await pool.query("SELECT id FROM opsweave.intake_sources WHERE id=$1", [duplicate.sourceId]),
    ).toMatchObject({ rowCount: 0 });

    const fallbackRun = await store.submitIntakeSource(owner.workspaceId, owner.ownerId, {
      content: "Synthetic retained fallback source",
      sourceType: "transcript",
    });
    expect((await store.nextQueuedIntakeRun())?.id).toBe(fallbackRun.id);
    await store.completeIntakeRun(fallbackRun.id, {
      questions: ["Automatic extraction was unavailable."],
      summary: "The source was retained.",
      tasks: [
        {
          businessValueRationale: "Prevents commitments from being lost.",
          businessValueScore: 40,
          clientRef: "fallback-review-1",
          confidence: 0.1,
          dueDate: null,
          sourceSpan: "Synthetic retained fallback source",
          title: "Review transcript and confirm action items",
        },
      ],
    });
    const fallbackDraft = (await store.listIntakeDrafts(owner.workspaceId)).find(
      (draft) => draft.sourceContent === "Synthetic retained fallback source",
    );
    expect(fallbackDraft).toBeDefined();
    if (fallbackDraft === undefined) throw new Error("Expected fallback draft.");
    await store.retryFallbackIntakeDraft(owner.workspaceId, owner.ownerId, fallbackDraft.id);
    expect((await store.nextQueuedIntakeRun())?.id).toBe(fallbackRun.id);
    await store.failIntakeRun(fallbackRun.id, "Synthetic retry stopped.");

    const restartRun = await store.submitIntakeSource(owner.workspaceId, owner.ownerId, {
      content: "Synthetic restart recovery source",
      sourceType: "other_text",
    });
    expect((await store.nextQueuedIntakeRun())?.id).toBe(restartRun.id);
    await pool.query("UPDATE opsweave.intake_runs SET updated_at=$2 WHERE id=$1", [
      restartRun.id,
      new Date("2026-08-01T00:00:00.000Z"),
    ]);
    expect(await store.recoverStaleIntakeRuns(new Date("2026-08-01T01:00:00.000Z"))).toBe(1);
    expect((await store.nextQueuedIntakeRun())?.id).toBe(restartRun.id);
    await store.failIntakeRun(restartRun.id, "Synthetic cleanup failure.");
  });

  it("stores delegate profiles, filters legacy Kanban events, and purges closed grants after 30 days", async () => {
    const owner = await store.findUserForLogin("synthetic-owner");
    if (owner?.ownerId === null || owner?.ownerId === undefined)
      throw new Error("Expected unified owner.");
    const task = await store.createTask(owner.workspaceId, owner.ownerId, {
      allocatedHours: 1,
      title: "UAT collaboration retention fixture",
      workflowLane: "inbox",
    });
    const token = `uat-profile-${randomUUID()}`;
    const created = await collaboration.createAccessGrant({
      accessRole: "contributor",
      actorUserId: owner.userId,
      delegateEmail: "profile-uat@example.test",
      delegationNote: "Complete the UAT fixture.",
      encryptedInvitationPayload: null,
      expiresAt: null,
      invitationExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1_000),
      invitationTokenDigest: createHash("sha256").update(token).digest("hex"),
      privacyKeywords: ["+44 20 7946 0991", "private-profile.example"],
      profileDescription: "Senior developer responsible for UAT and feature requests.",
      subjectId: task.id,
      subjectType: "task",
      workspaceId: owner.workspaceId,
    });
    expect(created.grant).toMatchObject({
      privacyKeywords: ["+44 20 7946 0991", "private-profile.example"],
      profileDescription: "Senior developer responsible for UAT and feature requests.",
    });
    expect(await collaboration.listDelegationBadges(owner.workspaceId)).toContainEqual(
      expect.objectContaining({
        delegates: [
          expect.objectContaining({
            profileDescription: "Senior developer responsible for UAT and feature requests.",
          }),
        ],
        subjectId: task.id,
        subjectType: "task",
      }),
    );
    expect(
      await collaboration.listProtectedTermValues(owner.workspaceId, "task", task.id, false),
    ).toEqual(expect.arrayContaining(["private-profile.example", "+44 20 7946 0991"]));

    await store.moveTask(owner.workspaceId, owner.ownerId, task.id, "today", task.version);
    expect(
      await collaboration.listActivity({
        category: "status",
        subjectId: task.id,
        subjectType: "task",
        viewerRole: "owner",
        viewerUserId: owner.userId,
        workspaceId: owner.workspaceId,
      }),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ action: "task.moved" })]));

    await collaboration.saveEmailDeliveryConfiguration({
      actorUserId: owner.userId,
      encryptedToken: "synthetic-encrypted-token",
      endpoint: "https://mailer.example.test/opsweave",
      workspaceId: owner.workspaceId,
    });
    expect(await collaboration.getEmailDeliveryConfiguration(owner.workspaceId)).toMatchObject({
      configured: true,
      endpoint: "https://mailer.example.test/opsweave",
      tokenConfigured: true,
    });

    await collaboration.revokeAccessGrant(owner.workspaceId, owner.userId, created.grant.id);
    await pool.query(
      `UPDATE opsweave.access_grants SET revoked_at=now()-interval '31 days',
        updated_at=now()-interval '31 days' WHERE id=$1`,
      [created.grant.id],
    );
    expect(await collaboration.purgeClosedAccessGrants(30)).toBeGreaterThanOrEqual(1);
    expect(
      await pool.query("SELECT id FROM opsweave.access_grants WHERE id=$1", [created.grant.id]),
    ).toMatchObject({ rowCount: 0 });
    const retainedAudit = await pool.query(
      `SELECT id FROM opsweave.audit_events
       WHERE metadata->>'grantId'=$1 OR metadata->>'previousGrantId'=$1`,
      [created.grant.id],
    );
    expect(retainedAudit.rowCount).toBeGreaterThan(0);
  });

  it("recovers credentials, revokes sessions, and preserves operational data", async () => {
    const owner = await store.findOwnerForLogin("synthetic-owner");
    if (owner === null) throw new Error("Expected owner.");
    await pool.query(
      "INSERT INTO opsweave.projects (workspace_id,name) VALUES ($1,'Preserved project')",
      [owner.workspaceId],
    );
    await store.recoverOwner("synthetic-owner", "$argon2id$replacement-synthetic-hash");
    expect(
      Number(
        (
          await pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM opsweave.projects WHERE name='Preserved project'",
          )
        ).rows[0]?.count,
      ),
    ).toBe(1);
    expect((await store.getOnlyOwnerCredential())?.credentialVersion).toBeGreaterThan(1);
  });
});
