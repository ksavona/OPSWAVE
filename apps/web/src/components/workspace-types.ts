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

export type WorkflowLane = (typeof WORKFLOW_LANES)[number];
export type KanbanSortMode = "dependency" | "greatest_value" | "manual" | "planning_priority";
export type WorkStatus = "at_risk" | "in_progress" | "not_started" | "on_hold" | "on_track";

export const WORK_STATUSES: readonly WorkStatus[] = [
  "not_started",
  "on_track",
  "in_progress",
  "on_hold",
  "at_risk",
];

export const workStatusLabel = (status: WorkStatus): string =>
  status.replaceAll("_", " ").replace(/^./u, (character) => character.toUpperCase());

export const workflowLaneLabel = (lane: WorkflowLane): string => {
  switch (lane) {
    case "cancelled":
      return "Cancelled";
    case "delegated":
      return "Delegated";
    case "done":
      return "Done";
    case "in_focus":
      return "In Focus";
    case "inbox":
      return "Inbox";
    case "monitor_validate":
      return "Monitor / Validate";
    case "this_week":
      return "This Week";
    case "today":
      return "Today";
    case "waiting":
      return "Waiting";
  }
};

export interface Stage {
  archivedAt: string | null;
  description: string | null;
  id: string;
  llmContext: string | null;
  name: string;
  sequence: number;
  version: number;
}

export interface Project {
  archivedAt: string | null;
  clientName?: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  llmLink: string | null;
  name: string;
  notes: unknown;
  priorityLevel?: number | null;
  stageId: string | null;
  stageName: string | null;
  status?: WorkStatus;
  version: number;
}

export interface Task {
  allocatedHours: number | null;
  businessValueRationale: string | null;
  businessValueScore: number | null;
  checklist: {
    completed: boolean;
    createdByUserId?: string | null;
    delegateVisible?: boolean;
    description?: string | null;
    id: string;
    label: string;
    position: number;
    predictedHours?: number | null;
    version?: number;
  }[];
  clientName?: string | null;
  createdAt: string;
  definitionOfDone: string | null;
  delegateReviewPending?: boolean;
  dueDate: string | null;
  endTime?: string | null;
  hoursSpent: number | null;
  hoursLeft: number;
  id: string;
  manualLanePosition: number;
  lastPlannedAt: string | null;
  lastPlannedBy: "automation" | "llm" | "user" | null;
  notes: unknown;
  origin?: string | null;
  projectId: string | null;
  priorityLevel?: number | null;
  plannedDate: string | null;
  plannedEndTime: string | null;
  plannedStartTime: string | null;
  planningEligible: boolean;
  planningRationale: string | null;
  planningScore: number | null;
  requiresBreakdown: boolean;
  scheduleLocked: boolean;
  size: "large" | "medium" | "small" | "mega" | null;
  sizeManualOverride: boolean;
  startDate: string | null;
  startTime?: string | null;
  status?: WorkStatus;
  title: string;
  valueAdd: string | null;
  valueSource: "ai_proposed" | "imported" | "owner" | null;
  version: number;
  workDescription: string | null;
  workflowLane: WorkflowLane;
}

export interface ProjectMetrics {
  allocatedHours: number;
  endDate: string | null;
  hoursSpent: number;
  progressPercent: number;
  startDate: string | null;
}

export interface WorkspaceData {
  blockerCounts: Record<string, number>;
  clientNames?: string[];
  dependencies: { dependsOnTaskId: string; taskId: string }[];
  delegations?: {
    delegates: {
      alias: string | null;
      displayName: string;
      profileDescription: string | null;
      status: "active" | "invite_pending";
    }[];
    subjectId: string;
    subjectType: "project" | "task";
  }[];
  entityDependencies: {
    blockerId: string;
    blockerType: "project" | "task";
    dependentId: string;
    dependentType: "project" | "task";
  }[];
  projectDependencies: { dependsOnProjectId: string; projectId: string }[];
  projectMetrics: Record<string, ProjectMetrics>;
  projects: Project[];
  sort: KanbanSortMode;
  stages: Stage[];
  tasks: Task[];
  workingDays?: {
    availableHours: number;
    endTime: string;
    enabled: boolean;
    startTime: string;
    weekday: string;
  }[];
}

export const emptyRichDocument = { content: [], type: "doc" } as const;
