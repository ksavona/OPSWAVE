import { describe, expect, it } from "vitest";

import {
  calculateWeeklyCapacity,
  createDefaultWorkingDays,
  generalSettingsSchema,
  prioritizationSettingsSchema,
  workingTimeSettingsSchema,
} from "./settings.ts";

describe("settings validation and capacity", () => {
  it("calculates raw, buffered, effective, disabled-day, and zero capacity", () => {
    const days = createDefaultWorkingDays();
    expect(calculateWeeklyCapacity(days, 10)).toEqual({
      bufferHours: 4,
      effectiveHours: 36,
      rawHours: 40,
      status: "available",
    });
    expect(
      calculateWeeklyCapacity(
        days.map((day) => ({ ...day, availableHours: 24, enabled: false })),
        50,
      ),
    ).toEqual({ bufferHours: 0, effectiveHours: 0, rawHours: 0, status: "no_capacity" });
  });

  it("supports decimal and 24-hour boundaries but rejects invalid weekday sets", () => {
    const days = createDefaultWorkingDays().map((day, index) => ({
      ...day,
      availableHours: index === 0 ? 24 : index === 1 ? 7.25 : day.availableHours,
    }));
    expect(calculateWeeklyCapacity(days, 12.5).effectiveHours).toBe(48.34);
    expect(() => workingTimeSettingsSchema.parse({ days: days.slice(0, 6), version: 1 })).toThrow();
    expect(() =>
      workingTimeSettingsSchema.parse({
        days: days.map((day) => ({ ...day, availableHours: 24.01 })),
        version: 1,
      }),
    ).toThrow();
  });

  it("validates general and prioritization ranges", () => {
    expect(
      generalSettingsSchema.parse({
        dateDisplay: "iso",
        defaultKanbanSort: "manual",
        defaultLandingView: "projects",
        displayName: "Synthetic workspace",
        firstDayOfWeek: "monday",
        timezone: "Europe/London",
        version: 1,
      }).timezone,
    ).toBe("Europe/London");
    expect(() =>
      generalSettingsSchema.parse({
        dateDisplay: "iso",
        defaultKanbanSort: "manual",
        defaultLandingView: "projects",
        displayName: "Synthetic workspace",
        firstDayOfWeek: "monday",
        timezone: "Not/AZone",
        version: 1,
      }),
    ).toThrow();
    expect(() =>
      prioritizationSettingsSchema.parse({
        aiTieBreakingEnabled: false,
        allowFinalTaskOverflow: false,
        allowMissingSizeSubstitution: false,
        businessValueInfluenceEnabled: false,
        dailyAutomationEnabled: false,
        dailyBufferEnabled: false,
        dailyLargeQuota: 1,
        dailyMediumQuota: 2,
        dailySmallQuota: 3,
        deadlineRiskHorizonDays: 0,
        manualTodayCarryover: true,
        planningBufferPercent: 51,
        version: 1,
        weeklyAutomationEnabled: false,
      }),
    ).toThrow();
  });
});
