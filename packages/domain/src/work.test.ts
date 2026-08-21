import { describe, expect, it } from "vitest";

import {
  compareTasksForBoard,
  dependencyMermaid,
  deriveProjectMetrics,
  deriveTaskMetrics,
  projectCreateSchema,
  taskCreateSchema,
  taskUpdateSchema,
  transitiveBlockerIds,
} from "./work.ts";

const task = (overrides: Partial<Parameters<typeof compareTasksForBoard>[1]> = {}) => ({
  businessValueScore: null,
  createdAt: new Date("2026-08-05T08:00:00.000Z"),
  dueDate: null,
  id: "00000000-0000-4000-8000-000000000001",
  manualLanePosition: 1,
  ...overrides,
});

describe("task board contract", () => {
  it("sorts greatest value by score, due date, creation time, then stable ID", () => {
    const tasks = [
      task({ businessValueScore: null, id: "c" }),
      task({ businessValueScore: 50, dueDate: "2026-08-09", id: "b" }),
      task({ businessValueScore: 50, dueDate: "2026-08-08", id: "a" }),
      task({ businessValueScore: 100, id: "d" }),
    ];
    expect(
      tasks
        .sort((left, right) => compareTasksForBoard("greatest_value", left, right))
        .map(({ id }) => id),
    ).toEqual(["d", "a", "b", "c"]);
  });

  it("requires a lane for complete task edits", () => {
    expect(() => taskUpdateSchema.parse({ title: "A task", version: 1 })).toThrow();
    expect(() =>
      taskUpdateSchema.parse({
        dueDate: "2026-08-10",
        startDate: "2026-08-11",
        title: "A task",
        version: 1,
        workflowLane: "inbox",
      }),
    ).toThrow("Task start date must be on or before its due date.");
    expect(() =>
      taskUpdateSchema.parse({
        dueDate: "2026-08-11",
        endTime: "09:00",
        startDate: "2026-08-11",
        startTime: "10:00",
        title: "A task",
        version: 1,
        workflowLane: "inbox",
      }),
    ).toThrow("Task start date must be on or before its due date.");
    expect(
      taskUpdateSchema.parse({
        dueDate: "2026-08-11",
        endTime: "11:00",
        startDate: "2026-08-11",
        startTime: "10:00",
        title: "A task",
        version: 1,
        workflowLane: "inbox",
      }).endTime,
    ).toBe("11:00");
  });

  it("validates saved client, status, and 1–5 priority metadata", () => {
    expect(
      projectCreateSchema.parse({
        clientName: "ACME Ltd",
        name: "Client project",
        priorityLevel: 5,
        status: "at_risk",
      }),
    ).toMatchObject({ clientName: "ACME Ltd", priorityLevel: 5, status: "at_risk" });
    expect(() => projectCreateSchema.parse({ name: "Invalid", priorityLevel: 6 })).toThrow();
    expect(
      taskCreateSchema.parse({
        clientName: null,
        priorityLevel: 1,
        status: "on_hold",
        title: "Personal task",
      }),
    ).toMatchObject({ clientName: null, priorityLevel: 1, status: "on_hold" });
  });

  it("uses persisted positions manually and deadlines for planning priority", () => {
    const earlier = task({ dueDate: "2026-08-08", manualLanePosition: 2 });
    const later = task({ dueDate: "2026-08-09", manualLanePosition: 1 });
    expect(compareTasksForBoard("manual", earlier, later)).toBeGreaterThan(0);
    expect(compareTasksForBoard("planning_priority", earlier, later)).toBeLessThan(0);
  });

  it("derives checklist progress and project dates without stored project dates", () => {
    expect(
      deriveTaskMetrics({
        allocatedHours: 4,
        checklist: [{ completed: true }, { completed: false }],
        workflowLane: "inbox",
      }),
    ).toEqual({ allocatedHours: 4, hoursSpent: 0, progressPercent: 50 });
    expect(
      deriveTaskMetrics({ allocatedHours: null, checklist: [], workflowLane: "done" }),
    ).toEqual({ allocatedHours: 0, hoursSpent: 0, progressPercent: 100 });
    expect(
      deriveProjectMetrics([
        {
          ...task({ dueDate: "2026-08-10" }),
          allocatedHours: 4,
          checklist: [{ completed: true }, { completed: false }],
          hoursSpent: 1,
          workflowLane: "inbox" as const,
        },
        {
          ...task({ dueDate: "2026-08-12", id: "second" }),
          allocatedHours: 2,
          checklist: [],
          workflowLane: "done" as const,
        },
      ]),
    ).toMatchObject({
      allocatedHours: 6,
      endDate: "2026-08-12",
      progressPercent: 50,
      startDate: "2026-08-10",
    });
  });

  it("credits project progress from spent hours, completed allocations, and excludes cancellation", () => {
    expect(
      deriveProjectMetrics([
        {
          ...task(),
          allocatedHours: 4,
          checklist: [],
          hoursSpent: 2,
          workflowLane: "today" as const,
        },
        {
          ...task({ id: "done" }),
          allocatedHours: 2,
          checklist: [],
          hoursSpent: 0,
          workflowLane: "done" as const,
        },
        {
          ...task({ id: "cancelled" }),
          allocatedHours: 10,
          checklist: [],
          hoursSpent: 10,
          workflowLane: "cancelled" as const,
        },
      ]).progressPercent,
    ).toBeCloseTo(66.67, 1);
  });

  it("escapes adversarial labels in Mermaid exports", () => {
    expect(
      dependencyMermaid(
        [
          { id: "a", title: 'A"\nB' },
          { id: "b", title: "Task B" },
        ],
        [{ dependsOnTaskId: "b", taskId: "a" }],
      ),
    ).toContain('task_0["A\\" B"]');
  });

  it("frames tasks by project and ignores dangling dependency edges", () => {
    const definition = dependencyMermaid(
      [
        { id: "a", projectId: "p", title: "Project task" },
        { id: "b", projectId: null, title: "Unassigned task" },
      ],
      [
        { dependsOnTaskId: "b", taskId: "a" },
        { dependsOnTaskId: "missing", taskId: "a" },
      ],
      [
        { id: "p", name: "Main project" },
        { id: "empty", name: "Empty project" },
      ],
      [
        { dependsOnProjectId: "empty", projectId: "p" },
        { dependsOnProjectId: "missing", projectId: "p" },
      ],
    );

    expect(definition).toContain('subgraph group_0["Main project"]');
    expect(definition).toContain('subgraph unassigned["Unassigned"]');
    expect(definition).toContain("task_1 --> task_0");
    expect(definition).toContain("project_1 --> project_0");
    expect(definition).toContain('subgraph group_1["Empty project"]');
    expect(definition).toContain("style group_0 fill:#122433,stroke:#4cc9f0");
    expect(definition).toContain("style group_1 fill:#271936,stroke:#b77bff");
  });

  it("renders cross-type blocker links", () => {
    const definition = dependencyMermaid(
      [{ id: "task", projectId: "project", title: "Task" }],
      [],
      [{ id: "project", name: "Project" }],
      [],
      [
        {
          blockerId: "project",
          blockerType: "project",
          dependentId: "task",
          dependentType: "task",
        },
      ],
    );
    expect(definition).toContain("project_0 --> task_0");
  });

  it("finds unique direct and transitive blockers across a chain", () => {
    expect(
      transitiveBlockerIds("a", [
        { dependsOnTaskId: "b", taskId: "a" },
        { dependsOnTaskId: "c", taskId: "b" },
        { dependsOnTaskId: "c", taskId: "a" },
      ]),
    ).toEqual(["b", "c"]);
  });
});
