import type { OpsWeaveStore, SessionRecord } from "@opsweave/db";
import { createDefaultWorkingDays } from "@opsweave/domain";
import { runScheduledAutomations } from "@opsweave/worker/automation";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@opsweave/worker/automation", () => ({ runScheduledAutomations: vi.fn() }));

import { PlanningService } from "./planning-service";

const session = { ownerId: "owner", workspaceId: "workspace" } as SessionRecord;

describe("PlanningService", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("records an immutable settings snapshot with the deterministic preview", async () => {
    const configuration = {
      general: { timezone: "UTC", version: 2 },
      prioritization: {
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
        version: 4,
        weeklyAutomationEnabled: false,
      },
      workingDays: createDefaultWorkingDays(),
    };
    const store = {
      getWorkspaceConfiguration: vi.fn(async () => configuration),
      listTaskDependencies: vi.fn(async () => []),
      listTasks: vi.fn(async () => [
        {
          allocatedHours: 2,
          businessValueScore: 50,
          dueDate: "2026-08-11",
          id: "task",
          title: "Synthetic task",
          workflowLane: "inbox",
        },
      ]),
      recordPlanningPreview: vi.fn(async () => ({ id: "run", status: "completed" as const })),
    };
    const result = await new PlanningService(store as unknown as OpsWeaveStore).preview(
      session,
      "2026-08-11",
    );
    expect(result).toMatchObject({ runId: "run", selected: [{ id: "task" }], settingsVersion: 4 });
    expect(store.recordPlanningPreview).toHaveBeenCalledWith(
      "workspace",
      4,
      configuration,
      "completed",
    );
  });

  it("validates manual planning requests", async () => {
    const service = new PlanningService({} as OpsWeaveStore);
    for (const value of [null, {}, { kind: "monthly" }])
      await expect(service.runManual(session, value)).rejects.toMatchObject({ status: 400 });
    expect(runScheduledAutomations).not.toHaveBeenCalled();
  });

  it("runs daily planning with the deterministic provider when no API key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.mocked(runScheduledAutomations).mockResolvedValueOnce([]);
    const store = {} as OpsWeaveStore;
    const result = await new PlanningService(store).runManual(session, { kind: "daily" });

    expect(result).toEqual({ completed: true, kind: "daily", result: null });
    expect(runScheduledAutomations).toHaveBeenCalledWith(
      store,
      expect.objectContaining({ name: "deterministic-fake" }),
      expect.any(Object),
      expect.any(Date),
      { kind: "daily", ownerId: "owner", workspaceId: "workspace" },
    );
  });

  it("runs weekly planning with the configured OpenAI model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-key");
    vi.stubEnv("OPENAI_DEFAULT_MODEL", "synthetic-model");
    const store = {} as OpsWeaveStore;
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    vi.mocked(runScheduledAutomations).mockResolvedValueOnce([
      {
        applied: true,
        candidateCount: 4,
        kind: "weekly",
        llmUsed: true,
        provider: "openai",
        selectedCount: 2,
        skippedReasonCounts: { blocked: 3 },
        targetDate: null,
      },
    ]);
    const result = await new PlanningService(store, logger).runManual(session, { kind: "weekly" });

    expect(result).toMatchObject({
      completed: true,
      kind: "weekly",
      result: { candidateCount: 4, llmUsed: true, selectedCount: 2 },
    });
    expect(runScheduledAutomations).toHaveBeenCalledWith(
      store,
      expect.objectContaining({ name: "openai" }),
      logger,
      expect.any(Date),
      { kind: "weekly", ownerId: "owner", workspaceId: "workspace" },
    );
  });
});
