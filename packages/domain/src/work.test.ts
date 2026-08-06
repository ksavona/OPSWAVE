import { describe, expect, it } from "vitest";

import {
  compareTasksForBoard,
  dependencyMermaid,
  deriveProjectMetrics,
  deriveTaskMetrics,
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
    ).toEqual({ allocatedHours: 4, progressPercent: 50 });
    expect(
      deriveTaskMetrics({ allocatedHours: null, checklist: [], workflowLane: "done" }),
    ).toEqual({ allocatedHours: 0, progressPercent: 100 });
    expect(
      deriveProjectMetrics([
        {
          ...task({ dueDate: "2026-08-10" }),
          allocatedHours: 4,
          checklist: [{ completed: true }, { completed: false }],
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
      progressPercent: (50 * 4 + 100 * 2) / 6,
      startDate: "2026-08-10",
    });
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
    ).toContain('a["A\\" B"]');
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
