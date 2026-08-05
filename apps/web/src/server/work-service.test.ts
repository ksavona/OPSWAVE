import { type OpsWeaveStore, StoreConflictError, type SessionRecord } from "@opsweave/db";
import { describe, expect, it, vi } from "vitest";

import { WorkService } from "./work-service";

const session = { ownerId: "owner", workspaceId: "workspace" } as SessionRecord;

const createStore = () => ({
  archiveProjectStage: vi.fn(async () => undefined),
  createProject: vi.fn(async () => ({ id: "project" })),
  createProjectStage: vi.fn(async () => ({ id: "stage" })),
  createTask: vi.fn(async () => ({ id: "task" })),
  getWorkspaceConfiguration: vi.fn(async () => ({
    general: { defaultKanbanSort: "manual" as const },
  })),
  listProjectStages: vi.fn(async () => [{ id: "stage" }]),
  listProjects: vi.fn(async () => [{ id: "project" }]),
  listTasks: vi.fn(async () => [{ id: "task" }]),
  moveTask: vi.fn(async () => ({ id: "task" })),
  reorderTask: vi.fn(async () => 2),
  updateProject: vi.fn(async () => ({ id: "project" })),
  updateProjectStage: vi.fn(async () => ({ id: "stage" })),
  updateTask: vi.fn(async () => ({ id: "task" })),
});

describe("WorkService", () => {
  it("uses the configured sort by default and validates an explicit sort", async () => {
    const store = createStore();
    const service = new WorkService(store as unknown as OpsWeaveStore);
    await expect(service.readWorkspace(session)).resolves.toMatchObject({ sort: "manual" });
    await expect(service.readWorkspace(session, "greatest_value")).resolves.toMatchObject({
      sort: "greatest_value",
    });
    await expect(service.readWorkspace(session, "untrusted")).rejects.toThrow();
  });

  it("validates writes and maps optimistic conflicts to safe 409 errors", async () => {
    const store = createStore();
    vi.mocked(store.updateTask).mockRejectedValueOnce(new StoreConflictError("stale task"));
    const service = new WorkService(store as unknown as OpsWeaveStore);
    await expect(service.createProject(session, { name: "Project" })).resolves.toEqual({
      id: "project",
    });
    await expect(service.createStage(session, { name: "Ready", sequence: 0 })).resolves.toEqual({
      id: "stage",
    });
    await expect(service.createTask(session, { title: "Task" })).resolves.toEqual({ id: "task" });
    await expect(
      service.updateTask(session, "task", { title: "Task", version: 1, workflowLane: "inbox" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.moveTask(session, "task", { version: 1, workflowLane: "today_1" }),
    ).resolves.toEqual({ id: "task" });
    await expect(
      service.reorderTask(session, "task", { direction: "earlier", version: 1 }),
    ).resolves.toBe(2);
    await expect(service.archiveStage(session, "stage")).resolves.toBeUndefined();
  });
});
