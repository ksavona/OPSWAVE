import type { AiPrioritizationResult, AiProvider } from "@opsweave/ai";
import type { AutomationRunInput, OpsWeaveStore, TaskRecord } from "@opsweave/db";
import { calculateWeeklyCapacity } from "@opsweave/domain";

import {
  activeBlockedTaskIds,
  assessCandidate,
  buildPrioritizationCandidates,
  deterministicCandidateOrder,
  firstWorkingWeekday,
  nextWorkingDate,
  rankedAssessmentOrder,
  scaledQuotas,
  selectWithinQuotas,
  taskPlanningEligibility,
} from "./automation-planner.ts";

interface AutomationLogger {
  error(payload: unknown, message: string): void;
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
}

export interface AutomationExecutionResult {
  readonly applied: boolean;
  readonly candidateCount: number;
  readonly kind: "daily" | "daily_rollover" | "weekly";
  readonly llmUsed: boolean;
  readonly provider: string;
  readonly selectedCount: number;
  readonly skippedReasonCounts: Readonly<Record<string, number>>;
  readonly targetDate: string | null;
}

const localParts = (now: Date, timezone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year ?? ""}-${parts.month ?? ""}-${parts.day ?? ""}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: (parts.weekday ?? "monday").toLowerCase(),
  };
};

const fallbackPrioritization = (
  candidates: ReturnType<typeof buildPrioritizationCandidates>,
): AiPrioritizationResult => ({
  assessments: candidates.map((candidate) => ({
    rationale: "No additional strategic-fit evidence was available.",
    strategicFitScore: 0,
    taskId: candidate.id,
  })),
  orderedTaskIds: deterministicCandidateOrder(candidates),
  provider: "deterministic",
});

const prioritize = async (
  provider: AiProvider,
  candidates: ReturnType<typeof buildPrioritizationCandidates>,
  localDate: string,
  mode: "daily" | "weekly",
  logger: AutomationLogger,
  useAi: boolean,
): Promise<AiPrioritizationResult> => {
  if (candidates.length === 0)
    return { assessments: [], orderedTaskIds: [], provider: "not-run-no-candidates" };
  if (!useAi || provider.prioritize === undefined || provider.name === "deterministic-fake")
    return fallbackPrioritization(candidates);
  try {
    return await provider.prioritize({ candidates, localDate, mode });
  } catch (error) {
    logger.warn({ err: error, mode }, "LLM prioritization failed; deterministic ranking used");
    return fallbackPrioritization(candidates);
  }
};

const taskHours = (tasks: readonly TaskRecord[]): number =>
  tasks.reduce((total, task) => total + Math.max(0, task.hoursLeft), 0);

const planningGapHours = (selectedCount: number, existingCommitments: number): number =>
  selectedCount === 0 ? 0 : Math.max(0, selectedCount - 1 + existingCommitments) * 0.5;

const between = (value: string | null, start: string, end: string): boolean =>
  value !== null && value >= start && value <= end;

const datePlusDays = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const automatedAssessments = (
  candidates: ReturnType<typeof buildPrioritizationCandidates>,
  providerResult: AiPrioritizationResult,
  planningDate: string,
  workingDays: Parameters<typeof assessCandidate>[2],
) => {
  const providerById = new Map(
    providerResult.assessments.map((assessment) => [assessment.taskId, assessment]),
  );
  return candidates.map((candidate) => {
    const providerAssessment = providerById.get(candidate.id);
    return assessCandidate(
      candidate,
      planningDate,
      workingDays,
      providerAssessment?.strategicFitScore ?? 0,
      providerAssessment?.rationale,
    );
  });
};

const auditAssessments = (
  assessments: ReturnType<typeof automatedAssessments>,
  selectedIds: readonly string[],
  excluded: readonly { taskId: string; reason: string }[],
): NonNullable<AutomationRunInput["assessments"]> => {
  const selected = new Set(selectedIds);
  const reasonById = new Map(excluded.map(({ reason, taskId }) => [taskId, reason]));
  return assessments.map((assessment) => ({
    planningRationale: assessment.rationale,
    planningScore: assessment.planningScore,
    reason: selected.has(assessment.taskId)
      ? "selected"
      : (reasonById.get(assessment.taskId) ?? "capacity_or_task_mix"),
    selected: selected.has(assessment.taskId),
    taskId: assessment.taskId,
  }));
};

const reasonCounts = (
  excluded: readonly { reason: string; taskId: string }[],
  assessments: NonNullable<AutomationRunInput["assessments"]>,
): Readonly<Record<string, number>> => {
  const counts = new Map<string, number>();
  for (const reason of [
    ...excluded.map((item) => item.reason),
    ...assessments.filter((item) => !item.selected).map((item) => item.reason),
  ])
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return Object.fromEntries(counts);
};

export const runScheduledAutomations = async (
  store: OpsWeaveStore,
  provider: AiProvider,
  logger: AutomationLogger,
  now = new Date(),
  manual?: {
    readonly kind: "daily" | "weekly";
    readonly ownerId: string;
    readonly workspaceId: string;
  },
): Promise<AutomationExecutionResult[]> => {
  const executionResults: AutomationExecutionResult[] = [];
  const workspaces =
    manual === undefined
      ? await store.listAutomationWorkspaces()
      : [
          {
            ownerId: manual.ownerId,
            timezone: (await store.getWorkspaceConfiguration(manual.workspaceId)).general.timezone,
            workspaceId: manual.workspaceId,
          },
        ];
  for (const workspace of workspaces) {
    const local = localParts(now, workspace.timezone);
    const configuration = await store.getWorkspaceConfiguration(workspace.workspaceId);
    const snapshot = {
      prioritization: configuration.prioritization,
      timezone: workspace.timezone,
      workingDays: configuration.workingDays,
    };
    const firstWorkday = firstWorkingWeekday(configuration.workingDays);

    if (
      manual?.kind === "weekly" ||
      (manual === undefined &&
        configuration.prioritization.weeklyAutomationEnabled &&
        firstWorkday !== null &&
        local.weekday === firstWorkday &&
        local.minute >= 0 &&
        !(await store.hasAutomationRun(workspace.workspaceId, "weekly_selection", local.date)))
    ) {
      const [tasks, projects, dependencies] = await Promise.all([
        store.listTasks(workspace.workspaceId, "manual"),
        store.listProjects(workspace.workspaceId),
        store.listEntityDependencies(workspace.workspaceId),
      ]);
      const blocked = activeBlockedTaskIds(tasks, projects, dependencies);
      const weeklyLanes = new Set(["inbox", "this_week", "today"]);
      const eligibility = tasks.map((task) => ({
        ...taskPlanningEligibility(task, blocked, local.date, weeklyLanes),
        task,
      }));
      const eligibleTasks = eligibility.filter(({ eligible }) => eligible).map(({ task }) => task);
      const candidates = buildPrioritizationCandidates(
        eligibleTasks,
        projects,
        dependencies,
        tasks,
      );
      const providerResult = await prioritize(
        provider,
        candidates,
        local.date,
        "weekly",
        logger,
        configuration.prioritization.aiTieBreakingEnabled,
      );
      const assessments = automatedAssessments(
        candidates,
        providerResult,
        local.date,
        configuration.workingDays,
      );
      const ordered = rankedAssessmentOrder(assessments, providerResult.orderedTaskIds);
      const capacity = calculateWeeklyCapacity(
        configuration.workingDays as Parameters<typeof calculateWeeklyCapacity>[0],
        configuration.prioritization.planningBufferPercent,
      );
      const weekEnd = datePlusDays(local.date, 6);
      const lockedTasks = tasks.filter(
        (task) =>
          task.scheduleLocked &&
          !["done", "cancelled"].includes(task.workflowLane) &&
          (between(task.plannedDate, local.date, weekEnd) ||
            ["today", "this_week"].includes(task.workflowLane)),
      );
      const remainingCapacity = Math.max(0, capacity.effectiveHours - taskHours(lockedTasks));
      const quotas = scaledQuotas(
        configuration.workingDays,
        {
          large: configuration.prioritization.dailyLargeQuota,
          medium: configuration.prioritization.dailyMediumQuota,
          small: configuration.prioritization.dailySmallQuota,
        },
        "weekly",
      );
      const selectedIds = selectWithinQuotas(
        candidates,
        ordered,
        quotas,
        remainingCapacity,
        configuration.prioritization.allowMissingSizeSubstitution,
        0.5,
        lockedTasks.length,
      );
      const excluded = eligibility.flatMap(({ reason, task }) =>
        reason === null ? [] : [{ reason, taskId: task.id }],
      );
      const decisions = auditAssessments(assessments, selectedIds, excluded);
      const usedHours =
        taskHours(
          tasks.filter((task) => selectedIds.includes(task.id) || lockedTasks.includes(task)),
        ) + planningGapHours(selectedIds.length, lockedTasks.length);
      const applied = await store.applyAutomationRun({
        assessments: decisions,
        destinationLane: "this_week",
        gapMinutes: 30,
        kind: manual?.kind === "weekly" ? "weekly" : "weekly_selection",
        localDate: local.date,
        ownerId: workspace.ownerId,
        resetFromLanes: ["this_week", "today"],
        resetToLane: "inbox",
        scheduleFromDate: local.date,
        selectedIds,
        settingsSnapshot: {
          ...snapshot,
          capacityHours: capacity.effectiveHours,
          capacityRemaining: Math.max(0, capacity.effectiveHours - usedHours),
          capacityUsed: usedHours,
          excluded,
          lockedTaskIds: lockedTasks.map((task) => task.id),
          quotas,
        },
        settingsVersion: configuration.prioritization.version,
        workspaceId: workspace.workspaceId,
      });
      if (applied)
        logger.info(
          { selectedCount: selectedIds.length, workspaceId: workspace.workspaceId },
          "weekly planning automation completed",
        );
      executionResults.push({
        applied,
        candidateCount: candidates.length,
        kind: "weekly",
        llmUsed: providerResult.provider === "openai",
        provider: providerResult.provider,
        selectedCount: selectedIds.length,
        skippedReasonCounts: reasonCounts(excluded, decisions),
        targetDate: null,
      });
    }

    if (
      manual === undefined &&
      configuration.prioritization.dailyAutomationEnabled &&
      local.minute >= 0 &&
      !(await store.hasAutomationRun(workspace.workspaceId, "daily_rollover", local.date))
    ) {
      await store.applyAutomationRun({
        assessments: [],
        destinationLane: "this_week",
        gapMinutes: 30,
        kind: "daily_rollover",
        localDate: local.date,
        ownerId: workspace.ownerId,
        resetFromLanes: ["today"],
        resetToLane: "this_week",
        selectedIds: [],
        settingsSnapshot: snapshot,
        settingsVersion: configuration.prioritization.version,
        workspaceId: workspace.workspaceId,
      });
    }

    if (
      manual?.kind === "daily" ||
      (manual === undefined &&
        configuration.prioritization.dailyAutomationEnabled &&
        local.minute >= 0 &&
        !(await store.hasAutomationRun(workspace.workspaceId, "daily_selection", local.date)))
    ) {
      const targetDate = nextWorkingDate(local.date, configuration.workingDays, true);
      const [tasks, projects, dependencies] = await Promise.all([
        store.listTasks(workspace.workspaceId, "manual"),
        store.listProjects(workspace.workspaceId),
        store.listEntityDependencies(workspace.workspaceId),
      ]);
      const blocked = activeBlockedTaskIds(tasks, projects, dependencies);
      const dailyLanes = new Set(["inbox", "this_week"]);
      const eligibility = tasks.map((task) => {
        const base = taskPlanningEligibility(task, blocked, targetDate ?? local.date, dailyLanes);
        const relevant =
          task.workflowLane === "this_week" ||
          task.plannedDate === targetDate ||
          (targetDate !== null && task.dueDate !== null && task.dueDate <= targetDate) ||
          (task.createdAt instanceof Date &&
            task.createdAt.toISOString().slice(0, 10) === local.date &&
            (task.priorityLevel ?? 0) >= 4);
        return {
          eligible: base.eligible && relevant && targetDate !== null,
          reason:
            targetDate === null
              ? "no_working_day"
              : !base.eligible
                ? base.reason
                : relevant
                  ? null
                  : "not_due_for_daily_focus",
          task,
        };
      });
      const eligibleTasks = eligibility.filter(({ eligible }) => eligible).map(({ task }) => task);
      const candidates = buildPrioritizationCandidates(
        eligibleTasks,
        projects,
        dependencies,
        tasks,
      );
      const providerResult = await prioritize(
        provider,
        candidates,
        targetDate ?? local.date,
        "daily",
        logger,
        configuration.prioritization.aiTieBreakingEnabled,
      );
      const assessments = automatedAssessments(
        candidates,
        providerResult,
        targetDate ?? local.date,
        configuration.workingDays,
      );
      const ordered = rankedAssessmentOrder(assessments, providerResult.orderedTaskIds);
      const targetWeekday =
        targetDate === null
          ? ""
          : new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" })
              .format(new Date(`${targetDate}T00:00:00.000Z`))
              .toLowerCase();
      const day = configuration.workingDays.find(
        (candidate) => candidate.weekday === targetWeekday,
      );
      const rawCapacity = day?.enabled === true ? day.availableHours : 0;
      const reservePercent = configuration.prioritization.dailyBufferEnabled
        ? configuration.prioritization.planningBufferPercent
        : 0;
      const reservedCapacity = rawCapacity * (reservePercent / 100);
      const lockedTasks = tasks.filter(
        (task) =>
          task.scheduleLocked &&
          !["done", "cancelled"].includes(task.workflowLane) &&
          (task.plannedDate === targetDate || task.workflowLane === "today"),
      );
      const remainingCapacity = Math.max(
        0,
        rawCapacity - reservedCapacity - taskHours(lockedTasks),
      );
      const quotas = scaledQuotas(
        configuration.workingDays,
        {
          large: configuration.prioritization.dailyLargeQuota,
          medium: configuration.prioritization.dailyMediumQuota,
          small: configuration.prioritization.dailySmallQuota,
        },
        "daily",
        targetWeekday,
      );
      const selectedIds = selectWithinQuotas(
        candidates,
        ordered,
        quotas,
        remainingCapacity,
        configuration.prioritization.allowMissingSizeSubstitution,
        0.5,
        lockedTasks.length,
      );
      const excluded = eligibility.flatMap(({ reason, task }) =>
        reason === null ? [] : [{ reason, taskId: task.id }],
      );
      const decisions = auditAssessments(assessments, selectedIds, excluded);
      const selectedHours = taskHours(tasks.filter((task) => selectedIds.includes(task.id)));
      const usedHours =
        taskHours(lockedTasks) +
        selectedHours +
        planningGapHours(selectedIds.length, lockedTasks.length);
      const applied = await store.applyAutomationRun({
        assessments: decisions,
        destinationLane: "today",
        gapMinutes: 30,
        kind: manual?.kind === "daily" ? "daily" : "daily_selection",
        localDate: local.date,
        ownerId: workspace.ownerId,
        resetFromLanes: manual?.kind === "daily" ? ["today"] : [],
        resetToLane: "this_week",
        scheduleFromDate: targetDate ?? local.date,
        selectedIds,
        settingsSnapshot: {
          ...snapshot,
          capacityHours: rawCapacity,
          capacityRemaining: Math.max(0, rawCapacity - reservedCapacity - usedHours),
          capacityUsed: usedHours,
          excluded,
          lockedTaskIds: lockedTasks.map((task) => task.id),
          quotas,
          reserveHours: reservedCapacity,
          targetDate,
        },
        settingsVersion: configuration.prioritization.version,
        workspaceId: workspace.workspaceId,
      });
      if (applied)
        logger.info(
          { selectedCount: selectedIds.length, targetDate, workspaceId: workspace.workspaceId },
          "daily planning automation completed",
        );
      executionResults.push({
        applied,
        candidateCount: candidates.length,
        kind: "daily",
        llmUsed: providerResult.provider === "openai",
        provider: providerResult.provider,
        selectedCount: selectedIds.length,
        skippedReasonCounts: reasonCounts(excluded, decisions),
        targetDate,
      });
    }
  }
  return executionResults;
};
