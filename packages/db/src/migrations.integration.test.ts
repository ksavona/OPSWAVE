import { createHash, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { systemMetadata } from "./schema.ts";
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
    await expect(
      store.bootstrapOwner({
        normalizedUsername: "second-owner",
        passwordHash: "synthetic-hash",
        username: "Second-Owner",
        workspaceDisplayName: "Second workspace",
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
