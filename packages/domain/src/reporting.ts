export const REPORT_METRIC_VERSION = "2026-08-06";

export const reportMetricDictionary = [
  { id: "task_total", label: "Total tasks", definition: "All tasks visible in the workspace." },
  { id: "task_completed", label: "Completed tasks", definition: "Tasks in the done lane." },
  {
    id: "value_coverage",
    label: "Value-score coverage",
    definition: "Tasks with a business value score divided by all tasks.",
  },
] as const;

export interface ReportTask {
  readonly businessValueScore: number | null;
  readonly id: string;
  readonly title: string;
  readonly valueSource: string | null;
  readonly workflowLane: string;
}

export const summarizeTasks = (tasks: readonly ReportTask[]) => {
  const scored = tasks.filter((task) => task.businessValueScore !== null);
  const byValueSource = Object.fromEntries(
    ["ai_proposed", "imported", "owner", "not_set"].map((source) => [
      source,
      tasks.filter((task) => (task.valueSource ?? "not_set") === source).length,
    ]),
  );
  return {
    completed: tasks.filter((task) => task.workflowLane === "done").length,
    metricVersion: REPORT_METRIC_VERSION,
    taskTotal: tasks.length,
    valueCoveragePercent:
      tasks.length === 0 ? 0 : Math.round((scored.length / tasks.length) * 10000) / 100,
    valueSourceCounts: byValueSource,
  };
};

/** Prevent spreadsheet formula execution while preserving human-readable CSV exports. */
export const csvCell = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  const safe = /^[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};
