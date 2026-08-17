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
    expect(
      planWeeklyWork(
        [
          {
            allocatedHours: null,
            businessValueScore: null,
            dueDate: null,
            id: "unplanned",
            title: "Unplanned",
            workflowLane: "inbox",
          },
        ],
        [],
        days,
        settings,
        "2026-08-06",
      ),
    ).toMatchObject({
      excluded: [{ id: "unplanned", reason: "no_capacity" }],
      status: "no_capacity",
    });
  });

  it("uses owner-enabled value as a deterministic tie-breaker within equal deadlines", () => {
    const oneHour = createDefaultWorkingDays().map((day, index) => ({
      ...day,
      availableHours: index === 0 ? 1 : 0,
      enabled: index === 0,
    }));
    const result = planWeeklyWork(
      [
        {
          allocatedHours: 1,
          businessValueScore: null,
          dueDate: "2026-08-06",
          id: "c",
          title: "Z",
          workflowLane: "inbox",
        },
        {
          allocatedHours: 1,
          businessValueScore: 90,
          dueDate: "2026-08-06",
          id: "b",
          title: "Same",
          workflowLane: "inbox",
        },
        {
          allocatedHours: 1,
          businessValueScore: 90,
          dueDate: "2026-08-06",
          id: "a",
          title: "Same",
          workflowLane: "inbox",
        },
      ],
      [],
      oneHour,
      { ...settings, businessValueInfluenceEnabled: true },
      "2026-08-06",
    );
    expect(result.selected).toEqual([{ id: "a", reason: "deadline" }]);
    expect(result.excluded).toEqual([
      { id: "b", reason: "capacity" },
      { id: "c", reason: "capacity" },
    ]);
  });

  it("allows only the configured first-task overflow and defaults missing effort to one hour", () => {
    const oneHour = createDefaultWorkingDays().map((day, index) => ({
      ...day,
      availableHours: index === 0 ? 1 : 0,
      enabled: index === 0,
    }));
    expect(
      planWeeklyWork(
        [
          {
            allocatedHours: 2,
            businessValueScore: null,
            dueDate: null,
            id: "large",
            title: "Large",
            workflowLane: "inbox",
          },
          {
            allocatedHours: null,
            businessValueScore: null,
            dueDate: null,
            id: "small",
            title: "Small",
            workflowLane: "inbox",
          },
        ],
        [],
        oneHour,
        { ...settings, allowFinalTaskOverflow: true },
        "2026-08-06",
      ),
    ).toMatchObject({
      excluded: [{ id: "small", reason: "capacity" }],
      selected: [{ id: "large", reason: "contextual" }],
    });
  });
});
