import { csvCell, reportMetricDictionary, summarizeTasks } from "@opsweave/domain";
import type { OpsWeaveStore, SessionRecord } from "@opsweave/db";

export class ReportingService {
  public constructor(private readonly store: OpsWeaveStore) {}

  public async report(session: SessionRecord) {
    const tasks = await this.store.listTasks(session.workspaceId, "manual");
    return { metrics: summarizeTasks(tasks), metricDictionary: reportMetricDictionary };
  }

  public async taskCsv(session: SessionRecord) {
    const tasks = await this.store.listTasks(session.workspaceId, "manual");
    return [
      ["Task", "Lane", "Value score", "Value source"].map(csvCell).join(","),
      ...tasks.map((task) =>
        [task.title, task.workflowLane, task.businessValueScore, task.valueSource]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n");
  }
}
