import { planWeeklyWork } from "@opsweave/domain";
import type { OpsWeaveStore, SessionRecord } from "@opsweave/db";

export class PlanningService {
  public constructor(private readonly store: OpsWeaveStore) {}

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
}
