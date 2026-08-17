import { SafeApplicationError, planWeeklyWork } from "@opsweave/domain";
import type { OpsWeaveStore, SessionRecord } from "@opsweave/db";
import { DeterministicFakeAiProvider, OpenAiProvider } from "@opsweave/ai";
import { runScheduledAutomations } from "@opsweave/worker/automation";

interface PlanningLogger {
  error(payload: unknown, message: string): void;
  info(payload: unknown, message: string): void;
  warn(payload: unknown, message: string): void;
}

export class PlanningService {
  public constructor(
    private readonly store: OpsWeaveStore,
    private readonly logger: PlanningLogger = {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    },
  ) {}

  public async preview(session: SessionRecord, today = new Date().toISOString().slice(0, 10)) {
    const configuration = await this.store.getWorkspaceConfiguration(session.workspaceId);
    const [tasks, dependencies] = await Promise.all([
      this.store.listTasks(session.workspaceId, "manual"),
      this.store.listTaskDependencies(session.workspaceId),
    ]);
    const result = planWeeklyWork(
      tasks,
      dependencies,
      configuration.workingDays,
      configuration.prioritization,
      today,
    );
    const run = await this.store.recordPlanningPreview(
      session.workspaceId,
      configuration.prioritization.version,
      {
        general: configuration.general,
        prioritization: configuration.prioritization,
        workingDays: configuration.workingDays,
      },
      result.status,
    );
    return { ...result, runId: run.id, settingsVersion: configuration.prioritization.version };
  }

  public async runManual(session: SessionRecord, value: unknown) {
    if (
      value === null ||
      typeof value !== "object" ||
      !("kind" in value) ||
      !["daily", "weekly"].includes(String(value.kind))
    )
      throw new SafeApplicationError(
        "validation_error",
        "Select the daily or weekly planning automation.",
        400,
      );
    const kind = String(value.kind) as "daily" | "weekly";
    const apiKey = process.env.OPENAI_API_KEY;
    const provider =
      apiKey === undefined || apiKey.length === 0
        ? new DeterministicFakeAiProvider()
        : new OpenAiProvider({
            apiKey,
            model: process.env.OPENAI_DEFAULT_MODEL ?? "gpt-5.6",
          });
    const results = await runScheduledAutomations(this.store, provider, this.logger, new Date(), {
      kind,
      ownerId: session.ownerId,
      workspaceId: session.workspaceId,
    });
    return { completed: true, kind, result: results[0] ?? null };
  }
}
