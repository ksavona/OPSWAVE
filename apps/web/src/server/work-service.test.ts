import { type OpsWeaveStore, StoreConflictError, type SessionRecord } from "@opsweave/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkService } from "./work-service";

const session = { ownerId: "owner", workspaceId: "workspace" } as SessionRecord;
const projectId = "11111111-1111-4111-8111-111111111111";
const stageId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";

const createStore = () => ({
  archiveProjectStage: vi.fn(async () => undefined),
  createProject: vi.fn(async () => ({ id: projectId })),
  createEntityDependency: vi.fn(async () => undefined),
  createProjectDependency: vi.fn(async () => undefined),
  createProjectStage: vi.fn(async () => ({ id: stageId })),
  createTask: vi.fn(async () => ({ id: taskId })),
  deleteTask: vi.fn(async () => undefined),
  getWorkspaceConfiguration: vi.fn(async () => ({
    general: { defaultKanbanSort: "manual" as const },
  })),
  listProjectStages: vi.fn(async () => [{ id: stageId }]),
  listEntityDependencies: vi.fn(async () => []),
  listEntityAuditEvents: vi.fn(async () => []),
  listAttachments: vi.fn(async () => []),
  listProjectDependencies: vi.fn(async () => []),
  listTaskDependencies: vi.fn(async () => []),
  listProjects: vi.fn(async () => [{ id: projectId }]),
  listTasks: vi.fn(async () => [{ id: taskId }]),
  moveTask: vi.fn(async () => ({ id: taskId })),
  removeProjectDependency: vi.fn(async () => undefined),
  removeEntityDependency: vi.fn(async () => undefined),
  replaceTaskChecklist: vi.fn(async () => undefined),
  reorderTask: vi.fn(async () => 2),
  updateProject: vi.fn(async () => ({ id: projectId })),
  updateProjectStage: vi.fn(async () => ({ id: stageId })),
  updateTask: vi.fn(async () => ({ id: taskId })),
});

describe("WorkService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured sort by default and validates an explicit sort", async () => {
    const store = createStore();
    const service = new WorkService(store as unknown as OpsWeaveStore);
    await expect(service.readWorkspace(session)).resolves.toMatchObject({ sort: "manual" });
    await expect(service.readWorkspace(session, "greatest_value")).resolves.toMatchObject({
      sort: "greatest_value",
    });
    await expect(service.readWorkspace(session, "untrusted")).rejects.toThrow();
  });

  it("places blockers before dependent tasks in dependency order", async () => {
    const store = createStore();
    const blockerId = "44444444-4444-4444-8444-444444444444";
    vi.mocked(store.listTasks).mockResolvedValueOnce([
      { id: taskId, title: "Dependent" },
      { id: blockerId, title: "Blocker" },
    ] as never);
    vi.mocked(store.listEntityDependencies).mockResolvedValueOnce([
      {
        blockerId,
        blockerType: "task",
        dependentId: taskId,
        dependentType: "task",
      },
    ] as never);
    const result = await new WorkService(store as unknown as OpsWeaveStore).readWorkspace(
      session,
      "dependency",
    );
    expect(result.tasks.map((task) => task.id)).toEqual([blockerId, taskId]);
  });

  it("validates writes and maps optimistic conflicts to safe 409 errors", async () => {
    const store = createStore();
    vi.mocked(store.updateTask).mockRejectedValueOnce(new StoreConflictError("stale task"));
    const service = new WorkService(store as unknown as OpsWeaveStore);
    await expect(service.createProject(session, { name: "Project" })).resolves.toEqual({
      id: projectId,
    });
    await expect(service.createStage(session, { name: "Ready", sequence: 0 })).resolves.toEqual({
      id: stageId,
    });
    await expect(service.createTask(session, { title: "Task" })).resolves.toEqual({ id: taskId });
    await expect(
      service.updateTask(session, taskId, { title: "Task", version: 1, workflowLane: "inbox" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.moveTask(session, taskId, { version: 1, workflowLane: "today" }),
    ).resolves.toEqual({ id: taskId });
    await expect(
      service.reorderTask(session, taskId, { direction: "earlier", version: 1 }),
    ).resolves.toBe(2);
    await expect(service.archiveStage(session, stageId)).resolves.toBeUndefined();
    await expect(service.archiveStage(session, "not-a-uuid")).rejects.toThrow();
    await expect(
      service.createProjectDependency(session, projectId, { dependsOnProjectId: stageId }),
    ).resolves.toBeUndefined();
    await expect(
      service.removeProjectDependency(session, projectId, stageId),
    ).resolves.toBeUndefined();
    await expect(service.deleteTask(session, taskId, { version: 1 })).resolves.toBeUndefined();
    await expect(service.audit(session, "task", taskId)).resolves.toEqual([]);
    await expect(
      service.createEntityDependency(session, "task", taskId, {
        blockerId: projectId,
        blockerType: "project",
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.removeEntityDependency(session, "task", taskId, "project", projectId),
    ).resolves.toBeUndefined();
    expect(store.deleteTask).toHaveBeenCalledWith(session.workspaceId, session.ownerId, taskId, 1);
  });

  it("can structure subtasks for a non-Mega task without allowing destructive task splitting", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const store = createStore();
    vi.mocked(store.listProjects).mockResolvedValueOnce([
      { id: projectId, name: "Context project" },
    ] as never);
    vi.mocked(store.listTasks).mockResolvedValue([
      {
        allocatedHours: 2,
        checklist: [
          {
            description: "Use the project acceptance criteria.",
            label: "Verify result",
            predictedHours: 1,
          },
        ],
        hoursLeft: 2,
        id: taskId,
        projectId,
        title: "Normal task",
      },
      {
        allocatedHours: 1,
        checklist: [],
        hoursLeft: 1,
        id: "44444444-4444-4444-8444-444444444444",
        projectId,
        title: "Related project task",
      },
    ] as never);
    const service = new WorkService(store as unknown as OpsWeaveStore);

    await expect(
      service.splitMegaTask(session, taskId, { mode: "subtasks", version: 1 }),
    ).resolves.toMatchObject({ count: 1, mode: "subtasks" });
    expect(store.listAttachments).toHaveBeenCalledTimes(3);
    expect(store.replaceTaskChecklist).toHaveBeenCalledWith(
      session.workspaceId,
      session.ownerId,
      taskId,
      1,
      [
        {
          description: "Use the project acceptance criteria.",
          predictedHours: 1,
          title: "Verify result",
        },
      ],
      "deterministic-fake",
    );

    await expect(
      service.splitMegaTask(session, taskId, { mode: "tasks", version: 1 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
