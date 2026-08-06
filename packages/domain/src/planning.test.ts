import { describe, expect, it } from "vitest";

import { createDefaultWorkingDays, prioritizationSettingsSchema } from "./settings.ts";
import { planWeeklyWork } from "./planning.ts";

const settings = prioritizationSettingsSchema.parse({
  aiTieBreakingEnabled: false,
  allowFinalTaskOverflow: false,
  allowMissingSizeSubstitution: true,
  businessValueInfluenceEnabled: false,
  dailyAutomationEnabled: false,
  dailyBufferEnabled: false,
  dailyLargeQuota: 1,
  dailyMediumQuota: 2,
  dailySmallQuota: 3,
  deadlineRiskHorizonDays: 14,
  manualTodayCarryover: true,
  planningBufferPercent: 0,
  version: 1,
  weeklyAutomationEnabled: false,
});

describe("planWeeklyWork", () => {
  it("excludes blocked and terminal work before deterministic deadline ordering", () => {
    const result = planWeeklyWork(
      [
        {
          allocatedHours: 1,
          businessValueScore: 1,
          dueDate: "2026-08-07",
          id: "a",
          title: "A",
          workflowLane: "inbox",
        },
        {
          allocatedHours: 1,
          businessValueScore: 100,
          dueDate: "2026-08-06",
          id: "b",
          title: "B",
          workflowLane: "inbox",
        },
        {
          allocatedHours: 1,
          businessValueScore: 100,
          dueDate: null,
          id: "c",
          title: "C",
          workflowLane: "done",
        },
      ],
      [{ taskId: "b", dependsOnTaskId: "a" }],
      createDefaultWorkingDays(),
      settings,
      "2026-08-06",
    );
    expect(result.selected.map((task) => task.id)).toEqual(["a"]);
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        { id: "b", reason: "blocked" },
        { id: "c", reason: "terminal_or_unavailable_lane" },
      ]),
    );
  });

  it("makes zero capacity a no-move outcome", () => {
    const days = createDefaultWorkingDays().map((day) => ({
      ...day,
      availableHours: 0,
      enabled: false,
    }));
    expect(planWeeklyWork([], [], days, settings, "2026-08-06").status).toBe("no_capacity");
  });
});
