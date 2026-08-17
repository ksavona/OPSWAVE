import { z } from "zod";

export const WORKFLOW_LANES = [
  "inbox",
  "this_week",
  "today",
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
  today: "Today",
  waiting: "Waiting",
};

export const KANBAN_SORT_MODES = [
  "manual",
  "planning_priority",
  "greatest_value",
  "dependency",
] as const;
export const TASK_SIZES = ["small", "medium", "large", "mega"] as const;
export const WORK_STATUSES = [
  "not_started",
  "on_track",
  "in_progress",
  "on_hold",
  "at_risk",
] as const;
export const VALUE_SCORE_SOURCES = ["owner", "ai_proposed", "imported"] as const;
export const entityIdSchema = z.uuid();

export type KanbanSortMode = (typeof KANBAN_SORT_MODES)[number];
export type TaskSize = (typeof TASK_SIZES)[number];
export type WorkStatus = (typeof WORK_STATUSES)[number];
export type ValueScoreSource = (typeof VALUE_SCORE_SOURCES)[number];
export type WorkflowLane = (typeof WORKFLOW_LANES)[number];

export const taskSizeForHours = (hours: number | null | undefined): TaskSize | null => {
  if (hours === null || hours === undefined) return null;
  if (hours <= 0.5) return "small";
  if (hours <= 1) return "medium";
  if (hours <= 2) return "large";
  return "mega";
};

export interface DerivedTaskMetrics {
  readonly allocatedHours: number;
  readonly hoursSpent: number;
  readonly progressPercent: number;
}

export interface DerivedProjectMetrics extends DerivedTaskMetrics {
  readonly endDate: string | null;
  readonly startDate: string | null;
}

export const deriveTaskMetrics = (task: {
  allocatedHours: number | null;
  checklist: readonly { completed: boolean }[];
  hoursSpent?: number | null;
  workflowLane: WorkflowLane;
}): DerivedTaskMetrics => {
  const allocatedHours = task.allocatedHours ?? 0;
  const hoursSpent = task.hoursSpent ?? 0;
  if (task.workflowLane === "done") return { allocatedHours, hoursSpent, progressPercent: 100 };
  if (task.checklist.length === 0) return { allocatedHours, hoursSpent, progressPercent: 0 };
  const completed = task.checklist.filter((item) => item.completed).length;
  return {
    allocatedHours,
    hoursSpent,
    progressPercent: (completed / task.checklist.length) * 100,
  };
};

export const deriveProjectMetrics = (
  tasks: readonly (SortableTask & {
    allocatedHours: number | null;
    checklist: readonly { completed: boolean }[];
    hoursSpent?: number | null;
    plannedDate?: string | null;
    startDate?: string | null;
    workflowLane: WorkflowLane;
  })[],
): DerivedProjectMetrics => {
  const includedTasks = tasks.filter((task) => task.workflowLane !== "cancelled");
  const starts = includedTasks
    .map((task) => task.plannedDate ?? task.startDate ?? task.dueDate)
    .filter((date): date is string => date !== null)
    .sort();
  const ends = includedTasks
    .map((task) => task.plannedDate ?? task.dueDate ?? task.startDate ?? null)
    .filter((date): date is string => date !== null)
    .sort();
  const perTask = includedTasks.map((task) => ({ task, metrics: deriveTaskMetrics(task) }));
  const allocatedHours = perTask.reduce((total, { metrics }) => total + metrics.allocatedHours, 0);
  const hoursSpent = perTask.reduce((total, { metrics }) => total + metrics.hoursSpent, 0);
  const completedHours = perTask.reduce(
    (total, { metrics, task }) =>
      total +
      (task.workflowLane === "done"
        ? metrics.allocatedHours
        : Math.min(metrics.hoursSpent, metrics.allocatedHours)),
    0,
  );
  const progressPercent =
    allocatedHours === 0
      ? perTask.length === 0
        ? 0
        : (perTask.filter(({ task }) => task.workflowLane === "done").length / perTask.length) * 100
      : (completedHours / allocatedHours) * 100;
  return {
    allocatedHours,
    endDate: ends.at(-1) ?? null,
    hoursSpent,
    progressPercent,
    startDate: starts[0] ?? null,
  };
};

export const toSafeMermaidLabel = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", " ").replaceAll("\r", " ");

export const dependencyMermaid = (
  tasks: readonly { id: string; projectId?: string | null; title: string }[],
  edges: readonly { dependsOnTaskId: string; taskId: string }[],
  projects: readonly { id: string; name: string }[] = [],
  projectEdges: readonly { dependsOnProjectId: string; projectId: string }[] = [],
  entityEdges?: readonly {
    blockerId: string;
    blockerType: "project" | "task";
    dependentId: string;
    dependentType: "project" | "task";
  }[],
): string => {
  const aliases = new Map(tasks.map((task, index) => [task.id, `task_${String(index)}`]));
  const projectAliases = new Map(
    projects.map((project, index) => [project.id, `project_${String(index)}`]),
  );
  const groupedTaskIds = new Set<string>();
  const projectGroups = projects.flatMap((project, projectIndex) => {
    const grouped = tasks
      .map((task, taskIndex) => ({ task, taskIndex }))
      .filter(({ task }) => task.projectId === project.id);
    for (const { task } of grouped) groupedTaskIds.add(task.id);
    return [
      `  subgraph group_${String(projectIndex)}["${toSafeMermaidLabel(project.name)}"]`,
      "    direction TB",
      `    project_${String(projectIndex)}(["Project: ${toSafeMermaidLabel(project.name)}"])`,
      ...grouped.map(
        ({ task, taskIndex }) =>
          `    task_${String(taskIndex)}["${toSafeMermaidLabel(task.title)}"]`,
      ),
      "  end",
    ];
  });
  const ungrouped = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => !groupedTaskIds.has(task.id));
  const ungroupedNodes =
    ungrouped.length === 0
      ? []
      : [
          '  subgraph unassigned["Unassigned"]',
          ...ungrouped.map(
            ({ task, index }) => `    task_${String(index)}["${toSafeMermaidLabel(task.title)}"]`,
          ),
          "  end",
        ];
  const aliasFor = (type: "project" | "task", id: string) =>
    type === "task" ? aliases.get(id) : projectAliases.get(id);
  const links =
    entityEdges === undefined
      ? [
          ...edges.flatMap((edge) => {
            const dependent = aliases.get(edge.taskId);
            const blocker = aliases.get(edge.dependsOnTaskId);
            return dependent === undefined || blocker === undefined
              ? []
              : [`  ${blocker} --> ${dependent}`];
          }),
          ...projectEdges.flatMap((edge) => {
            const dependent = projectAliases.get(edge.projectId);
            const blocker = projectAliases.get(edge.dependsOnProjectId);
            return dependent === undefined || blocker === undefined
              ? []
              : [`  ${blocker} --> ${dependent}`];
          }),
        ]
      : entityEdges.flatMap((edge) => {
          const dependent = aliasFor(edge.dependentType, edge.dependentId);
          const blocker = aliasFor(edge.blockerType, edge.blockerId);
          return dependent === undefined || blocker === undefined
            ? []
            : [`  ${blocker} --> ${dependent}`];
        });
  const palette = [
    ["#122433", "#4cc9f0"],
    ["#271936", "#b77bff"],
    ["#2c2015", "#ffb454"],
    ["#132b25", "#58d6a6"],
    ["#301a24", "#ff719a"],
    ["#20243a", "#7f9cff"],
    ["#2d2915", "#e7d45a"],
    ["#172c2e", "#52d2d8"],
  ] as const;
  const groupStyles = projects.map((_, index) => {
    const colors = palette[index % palette.length] ?? palette[0];
    return `  style group_${String(index)} fill:${colors[0]},stroke:${colors[1]},stroke-width:2px`;
  });
  const unassignedStyle =
    ungrouped.length === 0
      ? []
      : ["  style unassigned fill:#20242a,stroke:#8a939d,stroke-width:2px"];
  return [
    "flowchart LR",
    ...projectGroups,
    ...ungroupedNodes,
    ...links,
    ...groupStyles,
    ...unassignedStyle,
  ].join("\n");
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
const richTextDocumentSchema = z
  .unknown()
  .refine(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "doc" &&
      JSON.stringify(value).length <= 100_000,
    "Rich text content is invalid or too large.",
  )
  .optional();
const nullableUrl = z.url().max(2_048).nullable().optional();

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
  clientName: nullableText(200),
  description: nullableText(10_000),
  llmLink: nullableUrl,
  name: z.string().trim().min(1).max(200),
  notes: richTextDocumentSchema,
  priorityLevel: z.number().int().min(1).max(5).nullable().optional(),
  stageId: z.uuid().nullable().optional(),
  status: z.enum(WORK_STATUSES).optional(),
});

export const projectUpdateSchema = projectCreateSchema.extend({
  archived: z.boolean().optional(),
  version: z.number().int().positive(),
});

export const taskChecklistItemSchema = z.object({
  completed: z.boolean(),
  description: nullableText(5_000),
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(500),
  position: z.number().int().min(0).max(10_000),
  predictedHours: z.number().min(0).max(10_000).nullable().optional(),
});

export const taskTimeEntryCreateSchema = z.object({
  description: z.string().trim().min(1).max(5_000),
  entryDate: z.iso.date(),
  hours: z.number().positive().max(24),
});

export const taskSplitSchema = z.object({
  mode: z.enum(["subtasks", "tasks"]),
  version: z.number().int().positive(),
});

const taskCoreSchema = z.object({
  allocatedHours: z.number().min(0).max(10_000).nullable().optional(),
  businessValueRationale: nullableText(10_000),
  businessValueScore: z.number().int().min(1).max(100).nullable().optional(),
  checklist: z.array(taskChecklistItemSchema).max(100).optional(),
  clientName: nullableText(200),
  definitionOfDone: nullableText(10_000),
  dueDate: z.iso.date().nullable().optional(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
    .nullable()
    .optional(),
  notes: richTextDocumentSchema,
  origin: nullableText(10_000),
  plannedDate: z.iso.date().nullable().optional(),
  plannedEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
    .nullable()
    .optional(),
  plannedStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
    .nullable()
    .optional(),
  planningEligible: z.boolean().optional(),
  planningRationale: nullableText(10_000),
  planningScore: z.number().int().min(0).max(100).nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  priorityLevel: z.number().int().min(1).max(5).nullable().optional(),
  size: z.enum(TASK_SIZES).nullable().optional(),
  sizeManualOverride: z.boolean().optional(),
  startDate: z.iso.date().nullable().optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
    .nullable()
    .optional(),
  status: z.enum(WORK_STATUSES).optional(),
  scheduleLocked: z.boolean().optional(),
  title: z.string().trim().min(1).max(300),
  valueAdd: nullableText(10_000),
  valueSource: z.enum(VALUE_SCORE_SOURCES).nullable().optional(),
  workDescription: nullableText(10_000),
  workflowLane: z.enum(WORKFLOW_LANES).optional(),
});

const validTaskDateOrder = (value: {
  dueDate?: string | null | undefined;
  endTime?: string | null | undefined;
  startDate?: string | null | undefined;
  startTime?: string | null | undefined;
}) => {
  if (
    value.startDate === undefined ||
    value.startDate === null ||
    value.dueDate === undefined ||
    value.dueDate === null
  )
    return true;
  if (value.startDate < value.dueDate) return true;
  if (value.startDate > value.dueDate) return false;
  return (
    value.startTime === undefined ||
    value.startTime === null ||
    value.endTime === undefined ||
    value.endTime === null ||
    value.startTime <= value.endTime
  );
};

export const taskCreateSchema = taskCoreSchema.refine(validTaskDateOrder, {
  message: "Task start date must be on or before its due date.",
  path: ["dueDate"],
});
export const taskUpdateSchema = taskCoreSchema
  .extend({
    version: z.number().int().positive(),
    workflowLane: z.enum(WORKFLOW_LANES),
  })
  .refine(validTaskDateOrder, {
    message: "Task start date must be on or before its due date.",
    path: ["dueDate"],
  });
export const taskMoveSchema = z.object({
  workflowLane: z.enum(WORKFLOW_LANES),
  version: z.number().int().positive(),
});
export const taskReorderSchema = z.object({
  direction: z.enum(["earlier", "later"]),
  version: z.number().int().positive(),
});
export const taskScheduleMoveSchema = z.object({
  startAt: z.iso.datetime({ offset: true }),
  version: z.number().int().positive(),
});
export const projectScheduleMoveSchema = z.object({
  deltaMinutes: z.number().int().min(-2_628_000).max(2_628_000),
  version: z.number().int().positive(),
});
export const taskDependencySchema = z.object({
  dependsOnTaskId: z.uuid(),
});
export const projectDependencySchema = z.object({
  dependsOnProjectId: z.uuid(),
});
export const entityDependencySchema = z.object({
  blockerId: z.uuid(),
  blockerType: z.enum(["task", "project"]),
});
export const boardQuerySchema = z.object({
  sort: z.enum(KANBAN_SORT_MODES).optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectDependencyInput = z.infer<typeof projectDependencySchema>;
export type EntityDependencyInput = z.infer<typeof entityDependencySchema>;
export type ProjectStageInput = z.infer<typeof projectStageSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskDependencyInput = z.infer<typeof taskDependencySchema>;
export type TaskMoveInput = z.infer<typeof taskMoveSchema>;
export type TaskReorderInput = z.infer<typeof taskReorderSchema>;
export type TaskScheduleMoveInput = z.infer<typeof taskScheduleMoveSchema>;
export type ProjectScheduleMoveInput = z.infer<typeof projectScheduleMoveSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export interface SortableTask {
  readonly businessValueScore: number | null;
  readonly createdAt: Date;
  readonly dueDate: string | null;
  readonly id: string;
  readonly manualLanePosition: number;
  readonly planningScore?: number | null;
}

const nullableDateTimestamp = (value: string | null): number =>
  value === null ? Number.POSITIVE_INFINITY : Date.parse(`${value}T00:00:00.000Z`);

export const compareTasksForBoard = (
  mode: KanbanSortMode,
  left: SortableTask,
  right: SortableTask,
) => {
  if (mode === "manual" || mode === "dependency") {
    return (
      left.manualLanePosition - right.manualLanePosition ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id)
    );
  }
  if (mode === "planning_priority") {
    return (
      (right.planningScore ?? -1) - (left.planningScore ?? -1) ||
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
