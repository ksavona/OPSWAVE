import type { AiPrioritizationCandidate } from "@opsweave/ai";
import type {
  EntityDependencyRecord,
  ProjectRecord,
  TaskRecord,
  WorkingDayInput,
} from "@opsweave/db";

export interface SizeQuotas {
  readonly large: number;
  readonly medium: number;
  readonly small: number;
}

export interface CandidateAssessment {
  readonly deadlinePoints: number;
  readonly planningScore: number;
  readonly projectPriorityPoints: number;
  readonly rationale: string;
  readonly riskPoints: number;
  readonly strategicFitPoints: number;
  readonly taskId: string;
  readonly taskPriorityPoints: number;
  readonly valuePoints: number;
}

export interface EligibilityResult {
  readonly eligible: boolean;
  readonly reason: string | null;
}

const terminalTaskLanes = new Set(["cancelled", "done"]);
const terminalProjectStage = /^(?:cancelled|done|complete|completed)$/iu;
const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const dateAtUtc = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const dateString = (value: Date): string => value.toISOString().slice(0, 10);
const addDays = (value: string, count: number): string => {
  const result = dateAtUtc(value);
  result.setUTCDate(result.getUTCDate() + count);
  return dateString(result);
};
const weekdayForDate = (value: string): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" })
    .format(dateAtUtc(value))
    .toLowerCase();

export const firstWorkingWeekday = (workingDays: readonly WorkingDayInput[]): string | null =>
  weekdays.find(
    (weekday) => workingDays.find((candidate) => candidate.weekday === weekday)?.enabled === true,
  ) ?? null;

export const nextWorkingDate = (
  localDate: string,
  workingDays: readonly WorkingDayInput[],
  includeCurrentDate = true,
): string | null => {
  const enabled = new Set(
    workingDays.filter((day) => day.enabled && day.availableHours > 0).map((day) => day.weekday),
  );
  for (let offset = includeCurrentDate ? 0 : 1; offset <= 14; offset += 1) {
    const candidate = addDays(localDate, offset);
    if (enabled.has(weekdayForDate(candidate))) return candidate;
  }
  return null;
};

export const activeBlockedTaskIds = (
  tasks: readonly TaskRecord[],
  projects: readonly ProjectRecord[],
  dependencies: readonly EntityDependencyRecord[],
): Set<string> => {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return new Set(
    dependencies.flatMap((dependency) => {
      if (dependency.dependentType !== "task") return [];
      const active =
        dependency.blockerType === "task"
          ? !terminalTaskLanes.has(taskById.get(dependency.blockerId)?.workflowLane ?? "done")
          : !terminalProjectStage.test(
              projectById.get(dependency.blockerId)?.stageName?.trim() ?? "done",
            );
      return active ? [dependency.dependentId] : [];
    }),
  );
};

export const taskPlanningEligibility = (
  task: TaskRecord,
  blockedTaskIds: ReadonlySet<string>,
  planningDate: string,
  allowedLanes: ReadonlySet<string> = new Set(["inbox", "this_week"]),
): EligibilityResult => {
  const reason =
    task.externallyAssigned === true && task.ownerWorkAssigned !== true
      ? "delegated_external_capacity"
      : !allowedLanes.has(task.workflowLane)
        ? "stage_not_eligible"
        : terminalTaskLanes.has(task.workflowLane)
          ? "completed_or_cancelled"
          : task.status === "on_hold"
            ? "on_hold"
            : !task.planningEligible
              ? "planning_disabled"
              : task.scheduleLocked
                ? "schedule_locked"
                : task.startDate !== null && task.startDate > planningDate
                  ? "start_date_not_arrived"
                  : blockedTaskIds.has(task.id)
                    ? "blocked"
                    : task.allocatedHours === null
                      ? "effort_not_set"
                      : task.hoursLeft <= 0
                        ? "no_remaining_effort"
                        : task.size === "mega" || task.requiresBreakdown
                          ? "requires_breakdown"
                          : null;
  return { eligible: reason === null, reason };
};

export const buildPrioritizationCandidates = (
  tasks: readonly TaskRecord[],
  projects: readonly ProjectRecord[],
  dependencies: readonly EntityDependencyRecord[],
  contextTasks: readonly TaskRecord[] = tasks,
): AiPrioritizationCandidate[] => {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectDueDates = new Map<string, string>();
  for (const task of contextTasks) {
    if (task.projectId === null || task.dueDate === null) continue;
    const current = projectDueDates.get(task.projectId);
    if (current === undefined || task.dueDate > current)
      projectDueDates.set(task.projectId, task.dueDate);
  }
  const blocksCount = new Map<string, number>();
  const taskById = new Map(contextTasks.map((task) => [task.id, task]));
  for (const dependency of dependencies)
    if (
      dependency.blockerType === "task" &&
      dependency.dependentType === "task" &&
      !terminalTaskLanes.has(taskById.get(dependency.dependentId)?.workflowLane ?? "done")
    )
      blocksCount.set(dependency.blockerId, (blocksCount.get(dependency.blockerId) ?? 0) + 1);
  return tasks.map((task) => {
    const project = task.projectId === null ? undefined : projectById.get(task.projectId);
    const hoursLeft = task.hoursLeft;
    return {
      allocatedHours: Math.max(0.25, hoursLeft),
      blocksCount: blocksCount.get(task.id) ?? 0,
      businessValueScore: task.businessValueScore,
      dueDate: task.dueDate,
      hoursLeft,
      id: task.id,
      priorityLevel: task.priorityLevel,
      project:
        project === undefined
          ? null
          : {
              description: project.description,
              dueDate: projectDueDates.get(project.id) ?? null,
              name: project.name,
              priorityLevel: project.priorityLevel,
              stageName: project.stageName,
              status: project.status,
            },
      size: task.size,
      startDate: task.startDate,
      status: task.status,
      title: task.title,
      valueAdd: task.valueAdd,
      workDescription: task.workDescription,
    };
  });
};

const workingDaysUntil = (
  fromDate: string,
  dueDate: string,
  workingDays: readonly WorkingDayInput[],
): number => {
  if (dueDate <= fromDate) return 0;
  const enabled = new Set(workingDays.filter((day) => day.enabled).map((day) => day.weekday));
  let count = 0;
  for (let offset = 1; offset <= 366; offset += 1) {
    const candidate = addDays(fromDate, offset);
    if (enabled.has(weekdayForDate(candidate))) count += 1;
    if (candidate >= dueDate) return count;
  }
  return 367;
};

export const deadlineUrgencyPoints = (
  dueDate: string | null,
  planningDate: string,
  workingDays: readonly WorkingDayInput[],
): number => {
  if (dueDate === null) return 0;
  if (dueDate < planningDate) return 30;
  const distance = workingDaysUntil(planningDate, dueDate, workingDays);
  if (distance <= 1) return 27;
  if (distance <= 3) return 23;
  if (distance <= 5) return 18;
  if (distance <= 10) return 10;
  return 3;
};

const taskPriorityPoints = (priority: number | null): number =>
  priority === 5 ? 20 : priority === 4 ? 15 : priority === 3 ? 10 : priority === 2 ? 5 : 0;
const projectPriorityPoints = (priority: number | null): number =>
  priority === null
    ? 0
    : priority === 5
      ? 10
      : priority === 4
        ? 8
        : priority === 3
          ? 6
          : priority === 2
            ? 4
            : 2;
const riskPoints = (status: string): number =>
  status === "at_risk"
    ? 10
    : status === "in_progress"
      ? 6
      : status === "on_track"
        ? 3
        : status === "not_started"
          ? 1
          : 0;

export const assessCandidate = (
  candidate: AiPrioritizationCandidate,
  planningDate: string,
  workingDays: readonly WorkingDayInput[],
  strategicFitPoints = 0,
  strategicRationale = "No strategic-fit evidence was available.",
): CandidateAssessment => {
  const deadlinePoints = deadlineUrgencyPoints(
    candidate.dueDate ?? candidate.project?.dueDate ?? null,
    planningDate,
    workingDays,
  );
  const priorityPoints = taskPriorityPoints(candidate.priorityLevel);
  const valuePoints = Math.round(((candidate.businessValueScore ?? 0) / 5) * 100) / 100;
  const projectPoints = projectPriorityPoints(candidate.project?.priorityLevel ?? null);
  const candidateStatus = candidate.status ?? "not_started";
  const statusPoints = Math.max(
    riskPoints(candidateStatus),
    riskPoints(candidate.project?.status ?? "not_started"),
  );
  const boundedStrategicFit = Math.min(10, Math.max(0, Math.round(strategicFitPoints)));
  const planningScore = Math.min(
    100,
    Math.round(
      deadlinePoints +
        priorityPoints +
        valuePoints +
        projectPoints +
        statusPoints +
        boundedStrategicFit,
    ),
  );
  const due = candidate.dueDate ?? candidate.project?.dueDate;
  const rationale = [
    `Score ${String(planningScore)}/100: deadline ${String(deadlinePoints)}/30${due === null || due === undefined ? " (no due date)" : ` (due ${due})`}`,
    `task priority ${String(priorityPoints)}/20 (level ${String(candidate.priorityLevel ?? "not set")})`,
    `value ${String(valuePoints)}/20 (score ${String(candidate.businessValueScore ?? "not set")})`,
    `project priority ${String(projectPoints)}/10`,
    `risk/status ${String(statusPoints)}/10`,
    `strategic fit ${String(boundedStrategicFit)}/10. ${strategicRationale}`,
  ].join("; ");
  return {
    deadlinePoints,
    planningScore,
    projectPriorityPoints: projectPoints,
    rationale,
    riskPoints: statusPoints,
    strategicFitPoints: boundedStrategicFit,
    taskId: candidate.id,
    taskPriorityPoints: priorityPoints,
    valuePoints,
  };
};

export const deterministicCandidateOrder = (
  candidates: readonly AiPrioritizationCandidate[],
): string[] =>
  [...candidates]
    .sort((left, right) => {
      const deadline = (left.dueDate ?? left.project?.dueDate ?? "9999-12-31").localeCompare(
        right.dueDate ?? right.project?.dueDate ?? "9999-12-31",
      );
      if (deadline !== 0) return deadline;
      const value = (right.businessValueScore ?? -1) - (left.businessValueScore ?? -1);
      if (value !== 0) return value;
      const priority =
        (right.priorityLevel ?? right.project?.priorityLevel ?? 0) -
        (left.priorityLevel ?? left.project?.priorityLevel ?? 0);
      if (priority !== 0) return priority;
      const unblock = right.blocksCount - left.blocksCount;
      if (unblock !== 0) return unblock;
      return left.allocatedHours - right.allocatedHours || left.title.localeCompare(right.title);
    })
    .map((candidate) => candidate.id);

export const rankedAssessmentOrder = (
  assessments: readonly CandidateAssessment[],
  tieBreakOrder: readonly string[],
): string[] => {
  const tieBreakPosition = new Map(tieBreakOrder.map((id, index) => [id, index]));
  return [...assessments]
    .sort(
      (left, right) =>
        right.planningScore - left.planningScore ||
        (tieBreakPosition.get(left.taskId) ?? Number.MAX_SAFE_INTEGER) -
          (tieBreakPosition.get(right.taskId) ?? Number.MAX_SAFE_INTEGER) ||
        left.taskId.localeCompare(right.taskId),
    )
    .map((assessment) => assessment.taskId);
};

export const scaledQuotas = (
  workingDays: readonly WorkingDayInput[],
  daily: SizeQuotas,
  mode: "daily" | "weekly",
  weekday?: string,
): SizeQuotas => {
  const hours =
    mode === "weekly"
      ? workingDays.reduce(
          (total, day) => total + (day.enabled ? Math.max(0, day.availableHours) : 0),
          0,
        )
      : (() => {
          const day = workingDays.find((candidate) => candidate.weekday === weekday);
          return day?.enabled === true ? Math.max(0, day.availableHours) : 0;
        })();
  const scale = hours / 8;
  return {
    large: Math.max(0, Math.round(daily.large * scale)),
    medium: Math.max(0, Math.round(daily.medium * scale)),
    small: Math.max(0, Math.round(daily.small * scale)),
  };
};

export const selectWithinQuotas = (
  candidates: readonly AiPrioritizationCandidate[],
  orderedIds: readonly string[],
  quotas: SizeQuotas,
  capacityHours: number,
  allowMissingSizeSubstitution: boolean,
  gapHours = 0,
  existingCommitments = 0,
): string[] => {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const remaining = { ...quotas };
  let remainingHours = Math.max(0, capacityHours);
  const selected: string[] = [];
  for (const id of orderedIds) {
    const candidate = byId.get(id);
    if (candidate === undefined) continue;
    const gap = selected.length > 0 || existingCommitments > 0 ? Math.max(0, gapHours) : 0;
    if (candidate.allocatedHours + gap > remainingHours) continue;
    const size = candidate.size ?? (allowMissingSizeSubstitution ? "small" : null);
    const available =
      size === "large" ? remaining.large : size === "medium" ? remaining.medium : remaining.small;
    if (size === null || size === "mega" || available <= 0) continue;
    selected.push(id);
    if (size === "large") remaining.large -= 1;
    else if (size === "medium") remaining.medium -= 1;
    else remaining.small -= 1;
    remainingHours -= candidate.allocatedHours + gap;
  }
  return selected;
};
