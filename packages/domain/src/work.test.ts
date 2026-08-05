import { describe, expect, it } from "vitest";

import { compareTasksForBoard, taskUpdateSchema } from "./work.ts";

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
});
