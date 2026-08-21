import { describe, expect, it, vi } from "vitest";

import { DeterministicFakeAiProvider, type AiProvider } from "@opsweave/ai";
import type { OpsWeaveStore } from "@opsweave/db";

import { runScheduledAutomations } from "./automation-scheduler.ts";

const workingDays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
].map((weekday) => ({
  availableHours: 8,
  enabled: true,
  endTime: "17:00",
  startTime: "09:00",
  weekday,
}));

describe("scheduled automations", () => {
  it("runs weekly and daily planning after midnight on the first working day", async () => {
    const applyAutomationRun = vi.fn().mockResolvedValue(true);
    const store = {
      applyAutomationRun,
      getWorkspaceConfiguration: vi.fn().mockResolvedValue({
        prioritization: {
          allowMissingSizeSubstitution: true,
          dailyAutomationEnabled: true,
          dailyLargeQuota: 1,
          dailyMediumQuota: 2,
          dailySmallQuota: 3,
          planningBufferPercent: 0,
          version: 1,
          weeklyAutomationEnabled: true,
        },
        workingDays,
      }),
      hasAutomationRun: vi.fn().mockResolvedValue(false),
      listAutomationWorkspaces: vi
        .fn()
        .mockResolvedValue([{ ownerId: "owner", timezone: "UTC", workspaceId: "workspace" }]),
      listEntityDependencies: vi.fn().mockResolvedValue([]),
      listProjects: vi.fn().mockResolvedValue([]),
      listTasks: vi.fn().mockResolvedValue([]),
    } as unknown as OpsWeaveStore;
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const prioritize = vi.fn();
    const provider = {
      extract: vi.fn(),
      name: "synthetic",
      prioritize,
    } as unknown as AiProvider;

    const results = await runScheduledAutomations(
      store,
      provider,
      logger,
      new Date("2026-08-17T01:30:00.000Z"),
    );

    expect(applyAutomationRun).toHaveBeenCalledTimes(3);
    expect(applyAutomationRun.mock.calls[0]?.[0]).toMatchObject({
      kind: "weekly_selection",
      localDate: "2026-08-17",
      resetFromLanes: ["this_week", "today"],
    });
    expect(
      applyAutomationRun.mock.calls.map(([input]) => (input as { kind: string }).kind),
    ).toEqual(["weekly_selection", "daily_rollover", "daily_selection"]);
    expect(results).toEqual([
      expect.objectContaining({
        candidateCount: 0,
        kind: "weekly",
        provider: "not-run-no-candidates",
        selectedCount: 0,
      }),
      expect.objectContaining({
        candidateCount: 0,
        kind: "daily",
        provider: "not-run-no-candidates",
        selectedCount: 0,
      }),
    ]);
    expect(prioritize).not.toHaveBeenCalled();
  });

  it("runs rollover and daily selection after 02:10", async () => {
    const applyAutomationRun = vi.fn().mockResolvedValue(true);
    const store = {
      applyAutomationRun,
      getWorkspaceConfiguration: vi.fn().mockResolvedValue({
        prioritization: {
          allowMissingSizeSubstitution: true,
          dailyAutomationEnabled: true,
          dailyLargeQuota: 1,
          dailyMediumQuota: 2,
          dailySmallQuota: 3,
          planningBufferPercent: 0,
          version: 1,
          weeklyAutomationEnabled: false,
        },
        workingDays,
      }),
      hasAutomationRun: vi.fn().mockResolvedValue(false),
      listAutomationWorkspaces: vi
        .fn()
        .mockResolvedValue([{ ownerId: "owner", timezone: "UTC", workspaceId: "workspace" }]),
      listEntityDependencies: vi.fn().mockResolvedValue([]),
      listProjects: vi.fn().mockResolvedValue([]),
      listTasks: vi.fn().mockResolvedValue([]),
    } as unknown as OpsWeaveStore;

    await runScheduledAutomations(
      store,
      new DeterministicFakeAiProvider(),
      { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      new Date("2026-08-18T02:10:00.000Z"),
    );

    expect(
      applyAutomationRun.mock.calls.map(([input]) => (input as { kind: string }).kind),
    ).toEqual(["daily_rollover", "daily_selection"]);
  });

  it("uses AI assessments while keeping the deterministic planning score authoritative", async () => {
    const applyAutomationRun = vi.fn().mockResolvedValue(false);
    const tasks = [
      {
        allocatedHours: 2,
        businessValueScore: 80,
        dueDate: "2026-08-20",
        hoursLeft: 2,
        id: "eligible",
        planningEligible: true,
        priorityLevel: 4,
        projectId: "planned",
        requiresBreakdown: false,
        scheduleLocked: false,
        size: "medium",
        title: "Eligible",
        workflowLane: "inbox",
      },
      {
        allocatedHours: 1,
        hoursLeft: 1,
        id: "unlinked",
        planningEligible: true,
        projectId: null,
        requiresBreakdown: false,
        scheduleLocked: false,
        size: null,
        title: "Unlinked",
        workflowLane: "today",
      },
      { id: "wrong-project", projectId: "done", title: "Wrong project", workflowLane: "inbox" },
      { id: "wrong-lane", projectId: "planned", title: "Wrong lane", workflowLane: "later" },
      { id: "blocked", projectId: "planned", title: "Blocked", workflowLane: "in_focus" },
      { id: "blocker", projectId: "planned", title: "Blocker", workflowLane: "in_progress" },
    ] as never;
    const store = {
      applyAutomationRun,
      getWorkspaceConfiguration: vi.fn().mockResolvedValue({
        prioritization: {
          aiTieBreakingEnabled: true,
          allowMissingSizeSubstitution: true,
          dailyAutomationEnabled: false,
          dailyLargeQuota: 1,
          dailyMediumQuota: 2,
          dailySmallQuota: 3,
          planningBufferPercent: 25,
          version: 2,
          weeklyAutomationEnabled: true,
        },
        workingDays,
      }),
      hasAutomationRun: vi.fn().mockResolvedValue(false),
      listAutomationWorkspaces: vi
        .fn()
        .mockResolvedValue([{ ownerId: "owner", timezone: "UTC", workspaceId: "workspace" }]),
      listEntityDependencies: vi.fn().mockResolvedValue([
        {
          blockerId: "blocker",
          blockerType: "task",
          dependentId: "blocked",
          dependentType: "task",
        },
      ]),
      listProjects: vi.fn().mockResolvedValue([
        { id: "planned", stageName: " Planned " },
        { id: "progress", stageName: "In progress" },
        { id: "done", stageName: "Done" },
        { id: "unset", stageName: null },
      ]),
      listTasks: vi.fn().mockResolvedValue(tasks),
    } as unknown as OpsWeaveStore;
    const prioritize = vi.fn().mockResolvedValue({
      assessments: [
        {
          rationale: "Highest strategic fit for the current plan.",
          strategicFitScore: 8,
          taskId: "eligible",
        },
        {
          rationale: "Useful supporting work.",
          strategicFitScore: 4,
          taskId: "unlinked",
        },
      ],
      orderedTaskIds: ["unlinked", "eligible"],
      provider: "synthetic",
    });
    const provider = {
      extract: vi.fn(),
      name: "synthetic",
      prioritize,
    } as unknown as AiProvider;
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

    await runScheduledAutomations(store, provider, logger, new Date("2026-08-17T01:30:00.000Z"));

    expect(prioritize).toHaveBeenCalledOnce();
    const prioritizationRequest = prioritize.mock.calls[0]?.[0] as
      { candidates: { id: string }[]; mode: string } | undefined;
    expect(prioritizationRequest?.mode).toBe("weekly");
    expect(prioritizationRequest?.candidates.map((candidate) => candidate.id)).toEqual([
      "eligible",
      "unlinked",
    ]);
    expect(applyAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "weekly_selection",
        selectedIds: ["eligible", "unlinked"],
      }),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("falls back when daily AI ordering fails and respects a disabled workday", async () => {
    const applyAutomationRun = vi.fn().mockResolvedValue(false);
    const disabledTuesday = workingDays.map((day) =>
      day.weekday === "tuesday" ? { ...day, enabled: false } : day,
    );
    const store = {
      applyAutomationRun,
      getWorkspaceConfiguration: vi.fn().mockResolvedValue({
        prioritization: {
          aiTieBreakingEnabled: true,
          allowMissingSizeSubstitution: false,
          dailyAutomationEnabled: true,
          dailyLargeQuota: 1,
          dailyMediumQuota: 2,
          dailySmallQuota: 3,
          planningBufferPercent: 0,
          version: 3,
          weeklyAutomationEnabled: false,
        },
        workingDays: disabledTuesday,
      }),
      hasAutomationRun: vi.fn().mockResolvedValue(false),
      listAutomationWorkspaces: vi
        .fn()
        .mockResolvedValue([{ ownerId: "owner", timezone: "UTC", workspaceId: "workspace" }]),
      listEntityDependencies: vi.fn().mockResolvedValue([
        {
          blockerId: "active-project",
          blockerType: "project",
          dependentId: "blocked",
          dependentType: "task",
        },
      ]),
      listProjects: vi.fn().mockResolvedValue([{ id: "active-project", stageName: "In progress" }]),
      listTasks: vi.fn().mockResolvedValue([
        {
          allocatedHours: 1,
          hoursLeft: 1,
          id: "candidate",
          planningEligible: true,
          projectId: null,
          requiresBreakdown: false,
          scheduleLocked: false,
          size: "medium",
          startDate: null,
          status: "not_started",
          title: "Candidate",
          workflowLane: "this_week",
        },
        { id: "blocked", projectId: null, title: "Blocked", workflowLane: "this_week" },
        { id: "inbox", projectId: null, title: "Inbox", workflowLane: "inbox" },
      ]),
    } as unknown as OpsWeaveStore;
    const provider = {
      extract: vi.fn(),
      name: "synthetic",
      prioritize: vi.fn().mockRejectedValue(new Error("synthetic provider failure")),
    } as unknown as AiProvider;
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

    await runScheduledAutomations(store, provider, logger, new Date("2026-08-18T02:10:00.000Z"));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "daily" }),
      "LLM prioritization failed; deterministic ranking used",
    );
    expect(applyAutomationRun).toHaveBeenCalledTimes(2);
    expect(applyAutomationRun.mock.calls[1]?.[0]).toMatchObject({
      kind: "daily_selection",
      scheduleFromDate: "2026-08-19",
      selectedIds: ["candidate"],
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("does not repeat jobs that already ran for the local date", async () => {
    const applyAutomationRun = vi.fn();
    const hasAutomationRun = vi.fn().mockResolvedValue(true);
    const listTasks = vi.fn();
    const store = {
      applyAutomationRun,
      getWorkspaceConfiguration: vi.fn().mockResolvedValue({
        prioritization: {
          dailyAutomationEnabled: true,
          weeklyAutomationEnabled: true,
        },
        workingDays,
      }),
      hasAutomationRun,
      listAutomationWorkspaces: vi
        .fn()
        .mockResolvedValue([{ ownerId: "owner", timezone: "UTC", workspaceId: "workspace" }]),
      listEntityDependencies: vi.fn(),
      listProjects: vi.fn(),
      listTasks,
    } as unknown as OpsWeaveStore;

    await runScheduledAutomations(
      store,
      new DeterministicFakeAiProvider(),
      { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      new Date("2026-08-17T02:10:00.000Z"),
    );

    expect(applyAutomationRun).not.toHaveBeenCalled();
    expect(listTasks).not.toHaveBeenCalled();
    expect(hasAutomationRun).toHaveBeenCalledTimes(3);
  });
});
