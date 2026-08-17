import { describe, expect, it } from "vitest";

import {
  activeBlockedTaskIds,
  assessCandidate,
  buildPrioritizationCandidates,
  deadlineUrgencyPoints,
  deterministicCandidateOrder,
  firstWorkingWeekday,
  nextWorkingDate,
  rankedAssessmentOrder,
  scaledQuotas,
  selectWithinQuotas,
  taskPlanningEligibility,
} from "./automation-planner.ts";

const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
  (weekday) => ({
    availableHours: 8,
    enabled: true,
    endTime: "17:00",
    startTime: "09:00",
    weekday,
  }),
);

describe("automation planning", () => {
  it("scales the requested 1/2/3 daily mix with configured working time", () => {
    expect(scaledQuotas(days, { large: 1, medium: 2, small: 3 }, "daily", "monday")).toEqual({
      large: 1,
      medium: 2,
      small: 3,
    });
    expect(scaledQuotas(days, { large: 1, medium: 2, small: 3 }, "weekly")).toEqual({
      large: 7,
      medium: 14,
      small: 21,
    });
  });

  it("treats dependencies on done and cancelled cards as cleared", () => {
    const tasks = [
      { id: "blocked", workflowLane: "inbox" },
      { id: "active", workflowLane: "in_focus" },
      { id: "done", workflowLane: "done" },
      { id: "cancelled", workflowLane: "cancelled" },
    ] as never;
    const dependencies = [
      { blockerId: "active", blockerType: "task", dependentId: "blocked", dependentType: "task" },
      { blockerId: "done", blockerType: "task", dependentId: "cleared-1", dependentType: "task" },
      {
        blockerId: "cancelled",
        blockerType: "task",
        dependentId: "cleared-2",
        dependentType: "task",
      },
    ] as never;
    expect(activeBlockedTaskIds(tasks, [], dependencies)).toEqual(new Set(["blocked"]));
  });

  it("handles project blockers, terminal project stages, and non-task dependents", () => {
    const projects = [
      { id: "active-project", stageName: "In progress" },
      { id: "done-project", stageName: " Completed " },
    ] as never;
    const dependencies = [
      {
        blockerId: "active-project",
        blockerType: "project",
        dependentId: "blocked-by-project",
        dependentType: "task",
      },
      {
        blockerId: "done-project",
        blockerType: "project",
        dependentId: "cleared-by-project",
        dependentType: "task",
      },
      {
        blockerId: "active-project",
        blockerType: "project",
        dependentId: "dependent-project",
        dependentType: "project",
      },
      {
        blockerId: "missing-project",
        blockerType: "project",
        dependentId: "missing-is-terminal",
        dependentType: "task",
      },
    ] as never;

    expect(activeBlockedTaskIds([], projects, dependencies)).toEqual(
      new Set(["blocked-by-project"]),
    );
  });

  it("builds complete candidate context and counts only active task dependents", () => {
    const projects = [
      {
        description: "Deliver the rollout.",
        id: "project",
        name: "Rollout",
        priorityLevel: 4,
        stageName: "In progress",
        status: "on_track",
      },
    ] as never;
    const contextTasks = [
      {
        allocatedHours: null,
        businessValueScore: 80,
        dueDate: "2026-08-20",
        hoursLeft: 1,
        id: "candidate",
        priorityLevel: 5,
        projectId: "project",
        size: "medium",
        title: "Candidate",
        workflowLane: "this_week",
      },
      {
        dueDate: "2026-08-30",
        id: "later-project-task",
        projectId: "project",
        workflowLane: "inbox",
      },
      {
        dueDate: "2026-08-10",
        id: "earlier-project-task",
        projectId: "project",
        workflowLane: "inbox",
      },
      { id: "active-dependent", projectId: null, workflowLane: "today" },
      { id: "done-dependent", projectId: null, workflowLane: "done" },
      { hoursLeft: 1, id: "unlinked", projectId: null, workflowLane: "inbox" },
    ] as never;
    const dependencies = [
      {
        blockerId: "candidate",
        blockerType: "task",
        dependentId: "active-dependent",
        dependentType: "task",
      },
      {
        blockerId: "candidate",
        blockerType: "task",
        dependentId: "done-dependent",
        dependentType: "task",
      },
      {
        blockerId: "candidate",
        blockerType: "project",
        dependentId: "active-dependent",
        dependentType: "task",
      },
      {
        blockerId: "candidate",
        blockerType: "task",
        dependentId: "project",
        dependentType: "project",
      },
    ] as never;

    const candidates = buildPrioritizationCandidates(
      [contextTasks[0], contextTasks[5]],
      projects,
      dependencies,
      contextTasks,
    );
    expect(candidates[0]).toMatchObject({
      allocatedHours: 1,
      blocksCount: 1,
      id: "candidate",
    });
    expect(candidates[0]?.project).toMatchObject({ dueDate: "2026-08-30", name: "Rollout" });
    expect(candidates[1]).toMatchObject({
      allocatedHours: 1,
      blocksCount: 0,
      id: "unlinked",
      project: null,
    });
  });

  it("ranks deadline, value, priority, unblocking impact, and quick wins in order", () => {
    const base = {
      allocatedHours: 2,
      blocksCount: 0,
      businessValueScore: 50,
      dueDate: "2026-09-01",
      priorityLevel: 3,
      project: null,
      size: "medium" as const,
    };
    const candidates = [
      { ...base, id: "late", title: "Late" },
      { ...base, dueDate: "2026-08-20", id: "urgent", title: "Urgent" },
    ];
    expect(deterministicCandidateOrder(candidates)).toEqual(["urgent", "late"]);
  });

  it("uses every deterministic tie-breaker and falls back to project values", () => {
    const candidate = {
      allocatedHours: 2,
      blocksCount: 0,
      businessValueScore: null,
      dueDate: null,
      priorityLevel: null,
      project: {
        description: null,
        dueDate: "2026-09-01",
        name: "Project",
        priorityLevel: 2,
        stageName: "In progress",
        status: "on_track",
      },
      size: "medium" as const,
    };
    expect(
      deterministicCandidateOrder([
        { ...candidate, businessValueScore: 50, id: "low-value", title: "Low value" },
        { ...candidate, businessValueScore: 80, id: "high-value", title: "High value" },
      ]),
    ).toEqual(["high-value", "low-value"]);
    expect(
      deterministicCandidateOrder([
        { ...candidate, id: "low-priority", priorityLevel: 1, title: "Low priority" },
        { ...candidate, id: "high-priority", priorityLevel: 5, title: "High priority" },
      ]),
    ).toEqual(["high-priority", "low-priority"]);
    expect(
      deterministicCandidateOrder([
        { ...candidate, blocksCount: 1, id: "blocks-one", title: "Blocks one" },
        { ...candidate, blocksCount: 3, id: "blocks-three", title: "Blocks three" },
      ]),
    ).toEqual(["blocks-three", "blocks-one"]);
    expect(
      deterministicCandidateOrder([
        { ...candidate, allocatedHours: 4, id: "long", title: "Long" },
        { ...candidate, allocatedHours: 1, id: "short", title: "Short" },
        { ...candidate, allocatedHours: 1, id: "alphabetic", title: "Alphabetic" },
      ]),
    ).toEqual(["alphabetic", "short", "long"]);
    const noProjectContext = {
      allocatedHours: 1,
      blocksCount: 0,
      businessValueScore: null,
      dueDate: null,
      priorityLevel: null,
      project: null,
      size: "small" as const,
    };
    expect(
      deterministicCandidateOrder([
        { ...noProjectContext, id: "zulu", title: "Zulu" },
        { ...noProjectContext, id: "alpha", title: "Alpha" },
      ]),
    ).toEqual(["alpha", "zulu"]);
  });

  it("scales disabled, missing, negative, and partial workdays", () => {
    const mixedDays = [
      {
        availableHours: 4,
        enabled: true,
        endTime: "13:00",
        startTime: "09:00",
        weekday: "monday",
      },
      {
        availableHours: 12,
        enabled: false,
        endTime: "21:00",
        startTime: "09:00",
        weekday: "tuesday",
      },
      {
        availableHours: -3,
        enabled: true,
        endTime: "09:00",
        startTime: "09:00",
        weekday: "wednesday",
      },
    ];
    expect(scaledQuotas(mixedDays, { large: 2, medium: 4, small: 6 }, "weekly")).toEqual({
      large: 1,
      medium: 2,
      small: 3,
    });
    expect(scaledQuotas(mixedDays, { large: 1, medium: 2, small: 3 }, "daily", "tuesday")).toEqual({
      large: 0,
      medium: 0,
      small: 0,
    });
    expect(scaledQuotas(mixedDays, { large: 1, medium: 2, small: 3 }, "daily", "sunday")).toEqual({
      large: 0,
      medium: 0,
      small: 0,
    });
  });

  it("honors size quotas and the available-hour cap", () => {
    const candidates = [
      { allocatedHours: 4, id: "large", size: "large" },
      { allocatedHours: 2, id: "medium", size: "medium" },
      { allocatedHours: 0.5, id: "small", size: "small" },
    ] as never;
    expect(
      selectWithinQuotas(
        candidates,
        ["large", "medium", "small"],
        { large: 1, medium: 2, small: 3 },
        6,
        true,
      ),
    ).toEqual(["large", "medium"]);
  });

  it("skips unknown, oversized, missing-size, and exhausted-quota candidates", () => {
    const candidates = [
      { allocatedHours: 9, id: "too-long", size: "large" },
      { allocatedHours: 1, id: "missing-size", size: null },
      { allocatedHours: 4, id: "large-one", size: "large" },
      { allocatedHours: 4, id: "large-two", size: "large" },
      { allocatedHours: 2, id: "medium", size: "medium" },
      { allocatedHours: 0.5, id: "small", size: "small" },
    ] as never;
    expect(
      selectWithinQuotas(
        candidates,
        ["unknown", "too-long", "missing-size", "large-one", "large-two", "medium", "small"],
        { large: 1, medium: 1, small: 1 },
        8,
        false,
      ),
    ).toEqual(["large-one", "medium", "small"]);
    expect(
      selectWithinQuotas(candidates, ["missing-size"], { large: 0, medium: 0, small: 1 }, -1, true),
    ).toEqual([]);
    expect(
      selectWithinQuotas(candidates, ["missing-size"], { large: 0, medium: 0, small: 1 }, 1, true),
    ).toEqual(["missing-size"]);
  });

  it("calculates the specified 100-point score and an evidence-based rationale", () => {
    const assessment = assessCandidate(
      {
        allocatedHours: 2,
        blocksCount: 4,
        businessValueScore: 100,
        dueDate: "2026-08-16",
        id: "critical",
        priorityLevel: 5,
        project: {
          description: "Committed client milestone",
          dueDate: "2026-08-17",
          name: "Client launch",
          priorityLevel: 5,
          stageName: "In progress",
          status: "at_risk",
        },
        size: "large",
        status: "at_risk",
        title: "Unblock launch",
      },
      "2026-08-17",
      days,
      10,
      "Unlocks four downstream launch tasks.",
    );

    expect(assessment).toMatchObject({
      deadlinePoints: 30,
      planningScore: 100,
      projectPriorityPoints: 10,
      riskPoints: 10,
      strategicFitPoints: 10,
      taskPriorityPoints: 20,
      valuePoints: 20,
    });
    expect(assessment.rationale).toContain("Unlocks four downstream launch tasks");
    expect(deadlineUrgencyPoints("2026-08-18", "2026-08-17", days)).toBe(27);
  });

  it("enforces eligibility without consuming capacity for locked, blocked, future, or Mega work", () => {
    const eligible = {
      allocatedHours: 1,
      hoursLeft: 1,
      planningEligible: true,
      requiresBreakdown: false,
      scheduleLocked: false,
      size: "medium",
      startDate: "2026-08-17",
      status: "not_started",
      workflowLane: "inbox",
    };
    expect(taskPlanningEligibility(eligible as never, new Set(), "2026-08-17")).toEqual({
      eligible: true,
      reason: null,
    });
    expect(
      taskPlanningEligibility(
        { ...eligible, scheduleLocked: true } as never,
        new Set(),
        "2026-08-17",
      ).reason,
    ).toBe("schedule_locked");
    expect(
      taskPlanningEligibility(
        { ...eligible, id: "blocked" } as never,
        new Set(["blocked"]),
        "2026-08-17",
      ).reason,
    ).toBe("blocked");
    expect(
      taskPlanningEligibility(
        { ...eligible, startDate: "2026-08-18" } as never,
        new Set(),
        "2026-08-17",
      ).reason,
    ).toBe("start_date_not_arrived");
    expect(
      taskPlanningEligibility({ ...eligible, size: "mega" } as never, new Set(), "2026-08-17")
        .reason,
    ).toBe("requires_breakdown");
  });

  it("reports every remaining eligibility exclusion explicitly", () => {
    const eligible = {
      allocatedHours: 1,
      hoursLeft: 1,
      id: "task",
      planningEligible: true,
      requiresBreakdown: false,
      scheduleLocked: false,
      size: "medium",
      startDate: null,
      status: "not_started",
      workflowLane: "inbox",
    };
    const reason = (overrides: Record<string, unknown>, lanes?: ReadonlySet<string>) =>
      taskPlanningEligibility(
        { ...eligible, ...overrides } as never,
        new Set(),
        "2026-08-17",
        lanes,
      ).reason;

    expect(reason({ workflowLane: "later" })).toBe("stage_not_eligible");
    expect(reason({ workflowLane: "done" }, new Set(["done"]))).toBe("completed_or_cancelled");
    expect(reason({ status: "on_hold" })).toBe("on_hold");
    expect(reason({ planningEligible: false })).toBe("planning_disabled");
    expect(reason({ allocatedHours: null })).toBe("effort_not_set");
    expect(reason({ hoursLeft: 0 })).toBe("no_remaining_effort");
    expect(reason({ requiresBreakdown: true })).toBe("requires_breakdown");
  });

  it("covers every score band and configured-workday boundary", () => {
    const noWork = days.map((day) => ({ ...day, enabled: false }));
    expect(nextWorkingDate("2026-08-17", days, false)).toBe("2026-08-18");
    expect(nextWorkingDate("2026-08-17", noWork)).toBeNull();
    expect(deadlineUrgencyPoints(null, "2026-08-17", days)).toBe(0);
    expect(deadlineUrgencyPoints("2026-08-17", "2026-08-17", days)).toBe(27);
    expect(deadlineUrgencyPoints("2026-08-20", "2026-08-17", days)).toBe(23);
    expect(deadlineUrgencyPoints("2026-08-22", "2026-08-17", days)).toBe(18);
    expect(deadlineUrgencyPoints("2026-08-27", "2026-08-17", days)).toBe(10);
    expect(deadlineUrgencyPoints("2026-09-20", "2026-08-17", days)).toBe(3);

    const base = {
      allocatedHours: 1,
      blocksCount: 0,
      businessValueScore: 0,
      dueDate: null,
      id: "scored",
      priorityLevel: null,
      project: null,
      size: "medium" as const,
      title: "Scored task",
    };
    const cases = [
      { expectedProject: 8, expectedRisk: 6, projectPriority: 4, status: "in_progress" },
      { expectedProject: 6, expectedRisk: 3, projectPriority: 3, status: "on_track" },
      { expectedProject: 4, expectedRisk: 1, projectPriority: 2, status: "not_started" },
      { expectedProject: 2, expectedRisk: 0, projectPriority: 1, status: "cancelled" },
    ];
    for (const [index, item] of cases.entries()) {
      const assessment = assessCandidate(
        {
          ...base,
          priorityLevel: 4 - index,
          project: {
            description: null,
            dueDate: null,
            name: "Project",
            priorityLevel: item.projectPriority,
            stageName: "In progress",
            status: item.status,
          },
          status: item.status,
        },
        "2026-08-17",
        days,
      );
      expect(assessment.projectPriorityPoints).toBe(item.expectedProject);
      expect(assessment.riskPoints).toBe(item.expectedRisk);
    }
    expect(assessCandidate(base, "2026-08-17", days).projectPriorityPoints).toBe(0);
  });

  it("finds the first and next configured working day", () => {
    const wednesdayToSunday = days.map((day) => ({
      ...day,
      enabled: !["monday", "tuesday"].includes(day.weekday),
    }));
    expect(firstWorkingWeekday(wednesdayToSunday)).toBe("wednesday");
    expect(nextWorkingDate("2026-08-17", wednesdayToSunday)).toBe("2026-08-19");
    expect(nextWorkingDate("2026-08-19", wednesdayToSunday)).toBe("2026-08-19");
    expect(firstWorkingWeekday(days.map((day) => ({ ...day, enabled: false })))).toBeNull();
  });

  it("ranks by score before LLM tie-break order and includes focus gaps in capacity", () => {
    expect(
      rankedAssessmentOrder(
        [
          { planningScore: 50, taskId: "lower" },
          { planningScore: 80, taskId: "higher" },
          { planningScore: 50, taskId: "tie-first" },
        ] as never,
        ["tie-first", "lower", "higher"],
      ),
    ).toEqual(["higher", "tie-first", "lower"]);
    expect(
      rankedAssessmentOrder(
        [
          { planningScore: 50, taskId: "zulu" },
          { planningScore: 50, taskId: "alpha" },
        ] as never,
        [],
      ),
    ).toEqual(["alpha", "zulu"]);
    expect(
      selectWithinQuotas(
        [
          { allocatedHours: 1, id: "first", size: "medium" },
          { allocatedHours: 1, id: "second", size: "medium" },
        ] as never,
        ["first", "second"],
        { large: 0, medium: 2, small: 0 },
        2,
        false,
        0.5,
      ),
    ).toEqual(["first"]);
  });
});
