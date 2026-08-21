import {
  calculateWeeklyCapacity,
  type PrioritizationSettingsInput,
  type WorkingDayInput,
} from "./settings.ts";

export interface PlanningTask {
  readonly allocatedHours: number | null;
  readonly businessValueScore: number | null;
  readonly dueDate: string | null;
  readonly id: string;
  readonly title: string;
  readonly workflowLane: string;
}

export interface PlanningResult {
  readonly capacityHours: number;
  readonly excluded: readonly { id: string; reason: string }[];
  readonly selected: readonly { id: string; reason: string }[];
  readonly status: "completed" | "no_capacity";
}

const terminalLanes = new Set(["cancelled", "delegated", "done", "waiting"]);

export const planWeeklyWork = (
  tasks: readonly PlanningTask[],
  dependencies: readonly { dependsOnTaskId: string; taskId: string }[],
  days: readonly (
    WorkingDayInput | { availableHours: number; enabled: boolean; weekday: string }
  )[],
  settings: PrioritizationSettingsInput,
  today: string,
): PlanningResult => {
  const capacity = calculateWeeklyCapacity(
    days as readonly WorkingDayInput[],
    settings.planningBufferPercent,
  ).effectiveHours;
  if (capacity === 0)
    return {
      capacityHours: 0,
      excluded: tasks.map((task) => ({ id: task.id, reason: "no_capacity" })),
      selected: [],
      status: "no_capacity",
    };
  const blocked = new Set(dependencies.map((dependency) => dependency.taskId));
  const excluded: { id: string; reason: string }[] = [];
  const candidates = tasks
    .filter((task) => {
      const reason = terminalLanes.has(task.workflowLane)
        ? "terminal_or_unavailable_lane"
        : blocked.has(task.id)
          ? "blocked"
          : null;
      if (reason !== null) excluded.push({ id: task.id, reason });
      return reason === null;
    })
    .sort((left, right) => {
      const deadline = (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31");
      if (deadline !== 0) return deadline;
      const value = settings.businessValueInfluenceEnabled
        ? (right.businessValueScore ?? -1) - (left.businessValueScore ?? -1)
        : 0;
      return value || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
    });
  let remaining = capacity;
  const selected: { id: string; reason: string }[] = [];
  for (const task of candidates) {
    const hours = task.allocatedHours ?? 1;
    if (hours <= remaining || (settings.allowFinalTaskOverflow && selected.length === 0)) {
      selected.push({
        id: task.id,
        reason: task.dueDate !== null && task.dueDate <= today ? "deadline" : "contextual",
      });
      remaining -= hours;
    } else excluded.push({ id: task.id, reason: "capacity" });
  }
  return { capacityHours: capacity, excluded, selected, status: "completed" };
};
