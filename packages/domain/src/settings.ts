import { z } from "zod";

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const timezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Timezone must be a valid IANA identifier.");

export const generalSettingsSchema = z.object({
  dateDisplay: z.enum(["iso", "locale"]),
  defaultKanbanSort: z.enum(["manual", "planning_priority", "greatest_value", "dependency"]),
  defaultLandingView: z.enum(["projects"]),
  displayName: z.string().trim().min(1).max(100),
  firstDayOfWeek: z.literal("monday"),
  fullName: z.string().trim().min(1).max(200).nullable().default(null),
  knownAs: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  timezone: timezoneSchema,
  version: z.number().int().positive(),
});

export const workingDaySchema = z
  .object({
    availableHours: z.number().min(0).max(24),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
      .default("17:00"),
    enabled: z.boolean(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
      .default("09:00"),
    weekday: z.enum(WEEKDAYS),
  })
  .refine((day) => !day.enabled || day.startTime < day.endTime, {
    message: "Working-day end time must be after its start time.",
    path: ["endTime"],
  });

export const workingTimeSettingsSchema = z.object({
  days: z
    .array(workingDaySchema)
    .length(7)
    .refine(
      (days) => new Set(days.map((day) => day.weekday)).size === 7,
      "Each weekday is required.",
    ),
  version: z.number().int().positive(),
});

export const prioritizationSettingsSchema = z.object({
  aiTieBreakingEnabled: z.boolean(),
  allowFinalTaskOverflow: z.boolean(),
  allowMissingSizeSubstitution: z.boolean(),
  businessValueInfluenceEnabled: z.boolean(),
  dailyAutomationEnabled: z.boolean(),
  dailyBufferEnabled: z.boolean(),
  dailyLargeQuota: z.number().int().min(0).max(20),
  dailyMediumQuota: z.number().int().min(0).max(20),
  dailySmallQuota: z.number().int().min(0).max(20),
  deadlineRiskHorizonDays: z.number().int().min(1).max(90),
  manualTodayCarryover: z.boolean(),
  planningBufferPercent: z.number().min(0).max(50),
  version: z.number().int().positive(),
  weeklyAutomationEnabled: z.boolean(),
});

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;
export type PrioritizationSettingsInput = z.infer<typeof prioritizationSettingsSchema>;
export type WorkingDayInput = z.infer<typeof workingDaySchema>;
export type WorkingTimeSettingsInput = z.infer<typeof workingTimeSettingsSchema>;

export interface CapacityPreview {
  readonly bufferHours: number;
  readonly effectiveHours: number;
  readonly rawHours: number;
  readonly status: "available" | "no_capacity";
}

const roundHours = (value: number): number => Math.round(value * 100) / 100;

export const calculateWeeklyCapacity = (
  days: readonly WorkingDayInput[],
  planningBufferPercent: number,
): CapacityPreview => {
  const parsedDays = workingTimeSettingsSchema.shape.days.parse(days);
  const parsedBuffer = z.number().min(0).max(50).parse(planningBufferPercent);
  const rawHours = roundHours(
    parsedDays.reduce((total, day) => total + (day.enabled ? day.availableHours : 0), 0),
  );
  const bufferHours = roundHours(rawHours * (parsedBuffer / 100));
  const effectiveHours = roundHours(rawHours - bufferHours);

  return {
    bufferHours,
    effectiveHours,
    rawHours,
    status: effectiveHours === 0 ? "no_capacity" : "available",
  };
};

export const createDefaultWorkingDays = (): WorkingDayInput[] =>
  WEEKDAYS.map((weekday, index) => ({
    availableHours: index < 5 ? 8 : 0,
    endTime: "17:00",
    enabled: index < 5,
    startTime: "09:00",
    weekday,
  }));
