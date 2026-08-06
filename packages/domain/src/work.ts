import { z } from "zod";

export const WORKFLOW_LANES = [
  "inbox",
  "this_week",
  "today_1",
  "today_2",
  "today_3",
  "in_focus",
  "monitor_validate",
  "waiting",
  "delegated",
  "done",
  "cancelled",
] as const;

export const WORKFLOW_LANE_LABELS: Record<WorkflowLane, string> = {
  cancelled: "Cancelled",
  delegated: "Delegated",
  done: "Done",
  in_focus: "In Focus",
  inbox: "Inbox",
  monitor_validate: "Monitor / Validate",
  this_week: "This Week",
  today_1: "Today 1",
  today_2: "Today 2",
  today_3: "Today 3",
  waiting: "Waiting",
};

export const KANBAN_SORT_MODES = ["manual", "planning_priority", "greatest_value"] as const;
export const TASK_SIZES = ["small", "medium", "large"] as const;
export const VALUE_SCORE_SOURCES = ["owner", "ai_proposed", "imported"] as const;

export type KanbanSortMode = (typeof KANBAN_SORT_MODES)[number];
export type TaskSize = (typeof TASK_SIZES)[number];
export type ValueScoreSource = (typeof VALUE_SCORE_SOURCES)[number];
export type WorkflowLane = (typeof WORKFLOW_LANES)[number];

export interface DerivedTaskMetrics {
  readonly allocatedHours: number;
  readonly progressPercent: number;
}

export interface DerivedProjectMetrics extends DerivedTaskMetrics {
  readonly endDate: string | null;
  readonly startDate: string | null;
}

export const deriveTaskMetrics = (task: {
  allocatedHours: number | null;
  checklist: readonly { completed: boolean }[];
  workflowLane: WorkflowLane;
}): DerivedTaskMetrics => {
  const allocatedHours = task.allocatedHours ?? 0;
  if (task.workflowLane === "done") return { allocatedHours, progressPercent: 100 };
  if (task.checklist.length === 0) return { allocatedHours, progressPercent: 0 };
  const completed = task.checklist.filter((item) => item.completed).length;
  return { allocatedHours, progressPercent: (completed / task.checklist.length) * 100 };
};

export const deriveProjectMetrics = (
  tasks: readonly (SortableTask & {
    allocatedHours: number | null;
    checklist: readonly { completed: boolean }[];
    workflowLane: WorkflowLane;
  })[],
): DerivedProjectMetrics => {
  const dated = tasks
    .map((task) => task.dueDate)
    .filter((date): date is string => date !== null)
    .sort();
  const perTask = tasks.map(deriveTaskMetrics);
  const allocatedHours = perTask.reduce((total, metrics) => total + metrics.allocatedHours, 0);
  const weightedHours = perTask.reduce((total, metrics) => total + metrics.allocatedHours, 0);
  const progressPercent =
    weightedHours === 0
      ? perTask.length === 0
        ? 0
        : perTask.reduce((total, metrics) => total + metrics.progressPercent, 0) / perTask.length
      : perTask.reduce(
          (total, metrics) => total + metrics.progressPercent * metrics.allocatedHours,
          0,
        ) / weightedHours;
  return {
    allocatedHours,
    endDate: dated.at(-1) ?? null,
    progressPercent,
    startDate: dated[0] ?? null,
  };
};

export const toSafeMermaidLabel = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", " ").replaceAll("\r", " ");

export const dependencyMermaid = (
  tasks: readonly { id: string; title: string }[],
  edges: readonly { dependsOnTaskId: string; taskId: string }[],
): string => {
  const labels = new Map(tasks.map((task) => [task.id, toSafeMermaidLabel(task.title)]));
  const lines = edges.flatMap((edge) => {
    const dependent = labels.get(edge.taskId);
    const blocker = labels.get(edge.dependsOnTaskId);
    return dependent === undefined || blocker === undefined
      ? []
      : [`${edge.dependsOnTaskId}["${blocker}"] --> ${edge.taskId}["${dependent}"]`];
  });
  return ["flowchart LR", ...lines].join("\n");
};

export const transitiveBlockerIds = (
  taskId: string,
  edges: readonly { dependsOnTaskId: string; taskId: string }[],
): string[] => {
  const found = new Set<string>();
  const visit = (id: string): void => {
    for (const edge of edges.filter((candidate) => candidate.taskId === id))
      if (!found.has(edge.dependsOnTaskId)) {
        found.add(edge.dependsOnTaskId);
        visit(edge.dependsOnTaskId);
      }
  };
  visit(taskId);
  return [...found].sort();
};

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const projectStageSchema = z.object({
  description: nullableText(2_000),
  llmContext: nullableText(2_000),
  name: z.string().trim().min(1).max(100),
  sequence: z.number().int().min(0).max(10_000),
  version: z.number().int().positive().optional(),
});
export const projectStageUpdateSchema = projectStageSchema.extend({
  version: z.number().int().positive(),
});

export const projectCreateSchema = z.object({
  description: nullableText(10_000),
  name: z.string().trim().min(1).max(200),
  stageId: z.uuid().nullable().optional(),
});

export const projectUpdateSchema = projectCreateSchema.extend({
  archived: z.boolean().optional(),
  version: z.number().int().positive(),
});

export const taskChecklistItemSchema = z.object({
  completed: z.boolean(),
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(500),
  position: z.number().int().min(0).max(10_000),
});

const taskCoreSchema = z.object({
  allocatedHours: z.number().min(0).max(10_000).nullable().optional(),
  businessValueRationale: nullableText(10_000),
  businessValueScore: z.number().int().min(1).max(100).nullable().optional(),
  checklist: z.array(taskChecklistItemSchema).max(100).optional(),
  definitionOfDone: nullableText(10_000),
  dueDate: z.iso.date().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  size: z.enum(TASK_SIZES).nullable().optional(),
  title: z.string().trim().min(1).max(300),
  valueAdd: nullableText(10_000),
  valueSource: z.enum(VALUE_SCORE_SOURCES).nullable().optional(),
  workDescription: nullableText(10_000),
  workflowLane: z.enum(WORKFLOW_LANES).optional(),
});

export const taskCreateSchema = taskCoreSchema;
export const taskUpdateSchema = taskCoreSchema.extend({
  version: z.number().int().positive(),
  workflowLane: z.enum(WORKFLOW_LANES),
});
export const taskMoveSchema = z.object({
  workflowLane: z.enum(WORKFLOW_LANES),
  version: z.number().int().positive(),
});
export const taskReorderSchema = z.object({
  direction: z.enum(["earlier", "later"]),
  version: z.number().int().positive(),
});
export const taskDependencySchema = z.object({
  dependsOnTaskId: z.uuid(),
});
export const boardQuerySchema = z.object({
  sort: z.enum(KANBAN_SORT_MODES).optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectStageInput = z.infer<typeof projectStageSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskDependencyInput = z.infer<typeof taskDependencySchema>;
export type TaskMoveInput = z.infer<typeof taskMoveSchema>;
export type TaskReorderInput = z.infer<typeof taskReorderSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export interface SortableTask {
  readonly businessValueScore: number | null;
  readonly createdAt: Date;
  readonly dueDate: string | null;
  readonly id: string;
  readonly manualLanePosition: number;
}

const nullableDateTimestamp = (value: string | null): number =>
  value === null ? Number.POSITIVE_INFINITY : Date.parse(`${value}T00:00:00.000Z`);

export const compareTasksForBoard = (
  mode: KanbanSortMode,
  left: SortableTask,
  right: SortableTask,
) => {
  if (mode === "manual") {
    return (
      left.manualLanePosition - right.manualLanePosition ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id)
    );
  }
  if (mode === "planning_priority") {
    return (
      nullableDateTimestamp(left.dueDate) - nullableDateTimestamp(right.dueDate) ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id)
    );
  }
  return (
    Number(right.businessValueScore !== null) - Number(left.businessValueScore !== null) ||
    (right.businessValueScore ?? 0) - (left.businessValueScore ?? 0) ||
    nullableDateTimestamp(left.dueDate) - nullableDateTimestamp(right.dueDate) ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  );
};
