"use client";

import { dependencyMermaid } from "@opsweave/domain/work";
import {
  useMemo,
  useId,
  useRef,
  useState,
  type DragEvent,
  type CSSProperties,
  type MouseEvent,
  type SyntheticEvent,
} from "react";

import { ProjectEditor, TaskEditor } from "./entity-editors";
import { GanttChart } from "./gantt-chart";
import { KanbanBoard } from "./kanban-board";
import { MermaidDiagram } from "./mermaid-diagram";
import { DelegationIndicator, type DelegateTooltipView } from "./delayed-tooltip";
import {
  WORKFLOW_LANES,
  WORK_STATUSES,
  workStatusLabel,
  workflowLaneLabel,
  type KanbanSortMode,
  type Project,
  type ProjectMetrics,
  type Stage,
  type Task,
  type WorkspaceData,
  type WorkflowLane,
} from "./workspace-types";
import {
  automationRunMessage,
  optionalFormNumber,
  optionalFormText,
  workspaceRequest,
} from "./workspace-api";

type Selection = { id: string; type: "project" | "task" } | null;
type OpenRecord = Selection;

const DAY_MS = 86_400_000;
export const taskDeadlineVisual = (
  task: Pick<Task, "dueDate" | "workflowLane">,
  now = Date.now(),
): { color: string | null; overdue: boolean } => {
  if (task.dueDate === null || task.workflowLane === "done" || task.workflowLane === "cancelled")
    return { color: null, overdue: false };
  const deadline = Date.parse(`${task.dueDate}T23:59:59.999Z`);
  const daysRemaining = (deadline - now) / DAY_MS;
  if (daysRemaining < 0) return { color: "#ff453a", overdue: true };
  if (daysRemaining > 60) return { color: "#edf3ef", overdue: false };
  if (daysRemaining > 30) {
    const yellowPercent = ((60 - daysRemaining) / 30) * 100;
    return {
      color: `color-mix(in srgb, #edf3ef ${String(100 - yellowPercent)}%, #ffd166 ${String(yellowPercent)}%)`,
      overdue: false,
    };
  }
  const hue = Math.max(0, (daysRemaining / 30) * 48);
  return { color: `hsl(${String(hue)} 92% 62%)`, overdue: false };
};

const sortLabels: Record<KanbanSortMode, string> = {
  dependency: "Dependency order",
  greatest_value: "Greatest value",
  manual: "Manual",
  planning_priority: "Planning priority",
};

const clientValue = (value: FormDataEntryValue | null): string | null => {
  const normalized = optionalFormText(value);
  return normalized?.toLocaleLowerCase() === "personal" ? null : normalized;
};

const priorityLevelLabel = (value: number | null | undefined): string => {
  const labels = [
    "Lowest priority",
    "Low priority",
    "Medium priority",
    "High priority",
    "Highest priority",
  ];
  return value === null || value === undefined ? "Not set" : (labels[value - 1] ?? "Not set");
};

const ClientField = ({
  clientNames,
  defaultValue,
  disabled = false,
}: {
  clientNames: string[];
  defaultValue?: string | null | undefined;
  disabled?: boolean;
}) => {
  const listId = useId();
  return (
    <label>
      Client
      <input
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        list={listId}
        name="clientName"
        placeholder={disabled ? "Inherited from project" : "Personal or client name"}
      />
      <datalist id={listId}>
        <option value="Personal" />
        {clientNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </label>
  );
};

export const Workspace = ({
  initial,
  initialOpenRecord = null,
}: {
  initial: WorkspaceData;
  initialOpenRecord?: OpenRecord;
}) => {
  const [data, setData] = useState(initial);
  const [automationRunning, setAutomationRunning] = useState<"daily" | "weekly" | null>(null);
  const [message, setMessage] = useState("");
  const [openRecord, setOpenRecord] = useState<OpenRecord>(() => {
    if (initialOpenRecord === null) return null;
    return initialOpenRecord.type === "task"
      ? initial.tasks.some((task) => task.id === initialOpenRecord.id)
        ? initialOpenRecord
        : null
      : initial.projects.some((project) => project.id === initialOpenRecord.id)
        ? initialOpenRecord
        : null;
  });
  const [selection, setSelection] = useState<Selection>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectCondensed, setProjectCondensed] = useState(true);
  const [projectOrder, setProjectOrder] = useState<"manual" | "next_deadline">("manual");
  const [sortChanging, setSortChanging] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskCondensed, setTaskCondensed] = useState(true);
  const lastCardClick = useRef<{ at: number; id: string; type: "project" | "task" } | null>(null);
  const activateCard = (record: { id: string }, type: "project" | "task") => {
    const now = Date.now();
    const previous = lastCardClick.current;
    if (
      previous !== null &&
      previous.id === record.id &&
      previous.type === type &&
      now - previous.at <= 600
    ) {
      lastCardClick.current = null;
      setMessage("");
      setOpenRecord({ id: record.id, type });
      return;
    }
    lastCardClick.current = { at: now, id: record.id, type };
    setSelection({ id: record.id, type });
  };
  const refresh = async (sort = data.sort) => {
    try {
      const result = (await workspaceRequest(
        `/api/workspace?sort=${sort}`,
        "GET",
      )) as unknown as WorkspaceData;
      setData(result);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to refresh the workspace.");
    }
  };
  const changeSort = async (sort: KanbanSortMode) => {
    window.history.replaceState(null, "", `/?sort=${sort}`);
    setSortChanging(true);
    try {
      await refresh(sort);
    } finally {
      setSortChanging(false);
    }
  };
  const runAutomation = async (kind: "daily" | "weekly") => {
    if (
      kind === "weekly" &&
      !window.confirm(
        "Run weekly planning now? Unlocked incomplete Today and This Week tasks will be re-prioritised.",
      )
    )
      return;
    setAutomationRunning(kind);
    try {
      const result = await workspaceRequest("/api/planning/run", "POST", { kind });
      await refresh();
      setMessage(automationRunMessage(result, kind));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to run planning.");
    } finally {
      setAutomationRunning(null);
    }
  };

  const filtered = useMemo(() => {
    if (selection === null) {
      const matches = (haystack: string, query: string) =>
        query.trim() === "" ||
        haystack.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
      const projectText = (project: Project) =>
        `${project.name} ${project.clientName ?? "personal"} ${project.stageName ?? ""} ${project.status ?? "not_started"} ${priorityLevelLabel(project.priorityLevel)}`;
      const taskText = (task: Task) => {
        const project = data.projects.find((candidate) => candidate.id === task.projectId);
        return `${task.title} ${task.clientName ?? "personal"} ${task.size ?? ""} ${task.status ?? "not_started"} ${priorityLevelLabel(task.priorityLevel)} ${project?.name ?? ""}`;
      };
      const projectScopedTasks = data.tasks.filter((task) => {
        const project = data.projects.find((candidate) => candidate.id === task.projectId);
        return matches(
          `${task.clientName ?? "personal"} ${project === undefined ? "" : projectText(project)}`,
          projectSearch,
        );
      });
      const tasks = projectScopedTasks.filter((task) => matches(taskText(task), taskSearch));
      const taskProjectIds = new Set(tasks.flatMap((task) => task.projectId ?? []));
      return {
        projects: data.projects.filter(
          (project) =>
            matches(projectText(project), projectSearch) &&
            (taskSearch.trim() === "" || taskProjectIds.has(project.id)),
        ),
        tasks,
      };
    }
    if (selection.type === "project")
      return {
        projects: data.projects.filter((project) => project.id === selection.id),
        tasks: data.tasks.filter((task) => task.projectId === selection.id),
      };
    const selectedTask = data.tasks.find((task) => task.id === selection.id);
    const relatedTaskIds = new Set([
      selection.id,
      ...data.dependencies.flatMap((edge) =>
        edge.taskId === selection.id
          ? [edge.dependsOnTaskId]
          : edge.dependsOnTaskId === selection.id
            ? [edge.taskId]
            : [],
      ),
    ]);
    return {
      projects: data.projects.filter((project) => project.id === selectedTask?.projectId),
      tasks: data.tasks.filter((task) => relatedTaskIds.has(task.id)),
    };
  }, [data, projectSearch, selection, taskSearch]);
  const openTask =
    openRecord?.type === "task"
      ? (data.tasks.find((task) => task.id === openRecord.id) ?? null)
      : null;
  const openProject =
    openRecord?.type === "project"
      ? (data.projects.find((project) => project.id === openRecord.id) ?? null)
      : null;
  const deselectOutsideCards = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest("[data-selectable-card]") === null &&
      target.closest(".entity-modal") === null
    )
      setSelection(null);
  };

  return (
    <div className="workspace-layout" onClick={deselectOutsideCards}>
      <p className="form-message" aria-live="polite">
        {message}
      </p>
      <details className="automation-menu">
        <summary>Automations</summary>
        <div className="button-row">
          <button
            disabled={automationRunning !== null}
            onClick={() => void runAutomation("daily")}
            type="button"
          >
            {automationRunning === "daily" ? "Planning…" : "Run daily planning"}
          </button>
          <button
            className="secondary"
            disabled={automationRunning !== null}
            onClick={() => void runAutomation("weekly")}
            type="button"
          >
            {automationRunning === "weekly" ? "Planning…" : "Run weekly planning"}
          </button>
        </div>
        {automationRunning === null ? null : (
          <p aria-live="assertive" className="automation-progress" role="status">
            Waiting for planning and any required LLM response…
          </p>
        )}
      </details>
      {selection === null ? null : (
        <div className="selection-banner" role="status">
          Showing records related to the selected {selection.type}. Click outside a card to clear.
          <button
            className="secondary compact"
            onClick={() => {
              setSelection(null);
            }}
            type="button"
          >
            Show all
          </button>
        </div>
      )}
      <section aria-labelledby="projects-heading" className="workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Project Kanban</p>
            <h1 id="projects-heading">Projects</h1>
          </div>
        </div>
        <p className="interaction-hint">
          Single-click filters related work. Double-click opens all project details.
        </p>
        <div className="board-toolbar">
          <label className="board-search">
            Search projects
            <input
              onChange={(event) => {
                setProjectSearch(event.target.value);
              }}
              placeholder="Client, name, priority, status…"
              type="search"
              value={projectSearch}
            />
          </label>
          <label className="project-sort-control">
            Project board order
            <select
              aria-label="Project sorting"
              onChange={(event) => {
                setProjectOrder(event.target.value as "manual" | "next_deadline");
              }}
              value={projectOrder}
            >
              <option value="manual">Manual</option>
              <option value="next_deadline">Next deadline</option>
            </select>
          </label>
          <button
            aria-label={projectCondensed ? "Expand project stages" : "Condense project stages"}
            className="secondary icon-button kanban-limit-toggle"
            onClick={() => {
              setProjectCondensed((current) => !current);
            }}
            title={projectCondensed ? "Expand project stages" : "Condense project stages"}
            type="button"
          >
            {projectCondensed ? "⇲" : "⇱"}
          </button>
        </div>
        <ProjectBoard
          clientNames={data.clientNames ?? []}
          condensed={projectCondensed}
          delegations={data.delegations ?? []}
          metrics={data.projectMetrics}
          onChanged={refresh}
          onOpen={(project) => {
            setMessage("");
            setOpenRecord({ id: project.id, type: "project" });
          }}
          onSelect={(project) => {
            activateCard(project, "project");
          }}
          projects={filtered.projects}
          projectOrder={projectOrder}
          selected={selection}
          setMessage={setMessage}
          stages={data.stages}
        />
      </section>
      <section aria-labelledby="tasks-heading" className="workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Global task board</p>
            <h2 id="tasks-heading">Tasks</h2>
          </div>
        </div>
        <p className="interaction-hint">
          Drag tasks between stages. Single-click filters related records; double-click opens the
          full task.
        </p>
        <div className="board-toolbar">
          <label className="board-search">
            Search tasks
            <input
              onChange={(event) => {
                setTaskSearch(event.target.value);
              }}
              placeholder="Title, size, project, priority, status…"
              type="search"
              value={taskSearch}
            />
          </label>
          <label className="sort-control">
            Board order
            <select
              onChange={(event) => void changeSort(event.target.value as KanbanSortMode)}
              value={data.sort}
            >
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-label={taskCondensed ? "Expand task stages" : "Condense task stages"}
            className="secondary icon-button kanban-limit-toggle"
            onClick={() => {
              setTaskCondensed((current) => !current);
            }}
            title={taskCondensed ? "Expand task stages" : "Condense task stages"}
            type="button"
          >
            {taskCondensed ? "⇲" : "⇱"}
          </button>
        </div>
        <TaskBoard
          clientNames={data.clientNames ?? []}
          condensed={taskCondensed}
          delegations={data.delegations ?? []}
          onChanged={refresh}
          onOpen={(task) => {
            setMessage("");
            setOpenRecord({ id: task.id, type: "task" });
          }}
          onSelect={(task) => {
            activateCard(task, "task");
          }}
          selected={selection}
          setMessage={setMessage}
          tasks={filtered.tasks}
          projects={data.projects}
          updating={sortChanging}
        />
      </section>
      <section className="workspace-section" aria-labelledby="timeline-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Task Gantt</p>
            <h2 id="timeline-heading">Schedule</h2>
          </div>
        </div>
        <GanttChart
          delegations={data.delegations ?? []}
          onChanged={refresh}
          onOpenEntity={({ id, type }) => {
            setMessage("");
            setOpenRecord({ id, type });
          }}
          {...(selection?.type === "project" ? { projectId: selection.id } : {})}
          projectMetrics={data.projectMetrics}
          projects={data.projects.filter((project) => project.archivedAt === null)}
          tasks={selection?.type === "project" ? filtered.tasks : data.tasks}
          workingDays={data.workingDays ?? []}
        />
      </section>
      <DependencyMap
        data={data}
        onOpenEntity={({ id, type }) => {
          setMessage("");
          setOpenRecord({ id, type });
        }}
      />
      {openTask === null ? null : (
        <TaskEditor
          data={data}
          message={message}
          onChanged={refresh}
          onClose={() => {
            setOpenRecord(null);
          }}
          onDeleted={() => {
            setOpenRecord(null);
            setSelection(null);
          }}
          onOpenEntity={({ id, type }) => {
            setMessage("");
            setOpenRecord({ id, type });
          }}
          setMessage={setMessage}
          task={openTask}
        />
      )}
      {openProject === null ? null : (
        <ProjectEditor
          data={data}
          message={message}
          onChanged={refresh}
          onClose={() => {
            setOpenRecord(null);
          }}
          onOpenEntity={({ id, type }) => {
            setMessage("");
            setOpenRecord({ id, type });
          }}
          project={openProject}
          setMessage={setMessage}
        />
      )}
    </div>
  );
};

const ProjectForm = ({
  clientNames,
  defaultStageId,
  onCreated,
  setMessage,
  stages,
}: {
  clientNames: string[];
  defaultStageId: string;
  onCreated: () => Promise<void>;
  setMessage: (message: string) => void;
  stages: Stage[];
}) => {
  const [open, setOpen] = useState(false);
  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await workspaceRequest("/api/projects", "POST", {
        clientName: clientValue(values.get("clientName")),
        description: optionalFormText(values.get("description")),
        llmLink: optionalFormText(values.get("llmLink")),
        name: values.get("name"),
        priorityLevel: optionalFormNumber(values.get("priorityLevel")),
        stageId: optionalFormText(values.get("stageId")),
        status: values.get("status"),
      });
      form.reset();
      setOpen(false);
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create project.");
    }
  };
  if (!open)
    return (
      <button
        aria-label="Add project to this stage"
        className="kanban-add-button"
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        +
      </button>
    );
  return (
    <div
      aria-label="Create project"
      aria-modal="true"
      className="create-dialog-backdrop"
      role="dialog"
    >
      <form
        className="compact-form create-popover create-dialog"
        onSubmit={(event) => void submit(event)}
      >
        <h2>New project</h2>
        <label>
          Project title
          <input name="name" required />
        </label>
        <label>
          Stage
          <select defaultValue={defaultStageId} name="stageId">
            {stages
              .filter((stage) => stage.archivedAt === null)
              .map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Priority level (1–5)
          <select name="priorityLevel">
            <option value="">Not set</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {priorityLevelLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select defaultValue="not_started" name="status">
            {WORK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {workStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <ClientField clientNames={clientNames} />
        <label>
          Description
          <textarea name="description" />
        </label>
        <label>
          LLM link
          <input name="llmLink" type="url" />
        </label>
        <div className="button-row">
          <button type="submit">Create project</button>
          <button
            className="secondary"
            onClick={() => {
              setOpen(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const ProjectBoard = ({
  clientNames,
  condensed,
  delegations,
  metrics,
  onChanged,
  onOpen,
  onSelect,
  projects,
  projectOrder,
  selected,
  setMessage,
  stages,
}: {
  clientNames: string[];
  condensed: boolean;
  delegations: NonNullable<WorkspaceData["delegations"]>;
  metrics: Record<string, ProjectMetrics>;
  onChanged: () => Promise<void>;
  onOpen: (project: Project) => void;
  onSelect: (project: Project) => void;
  projects: Project[];
  projectOrder: "manual" | "next_deadline";
  selected: Selection;
  setMessage: (message: string) => void;
  stages: Stage[];
}) => {
  const draggedProjectId = useRef<string | null>(null);
  const [collapsedStageIds, setCollapsedStageIds] = useState(
    () =>
      new Set(
        stages
          .filter((stage) => /^(done|cancelled)$/iu.test(stage.name.trim()))
          .map((stage) => stage.id),
      ),
  );
  const drop = async (event: DragEvent<HTMLElement>, stageId: string) => {
    event.preventDefault();
    const id =
      draggedProjectId.current ?? event.dataTransfer.getData("application/x-opsweave-project");
    draggedProjectId.current = null;
    const project = projects.find((candidate) => candidate.id === id);
    if (project === undefined || project.stageId === stageId) return;
    try {
      await workspaceRequest(`/api/projects/${project.id}`, "PUT", {
        archived: false,
        clientName: project.clientName ?? null,
        description: project.description,
        llmLink: project.llmLink,
        name: project.name,
        notes: project.notes,
        priorityLevel: project.priorityLevel ?? null,
        stageId,
        status: project.status ?? "not_started",
        version: project.version,
      });
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to move project.");
    }
  };
  return (
    <div>
      <KanbanBoard className="project-board" condensed={condensed} label="Project stages">
        {stages
          .filter((stage) => stage.archivedAt === null)
          .map((stage) => {
            const collapsed = collapsedStageIds.has(stage.id);
            const stageProjects = projects
              .filter((project) => project.archivedAt === null && project.stageId === stage.id)
              .sort((left, right) =>
                projectOrder === "next_deadline"
                  ? (metrics[left.id]?.endDate ?? "9999-12-31").localeCompare(
                      metrics[right.id]?.endDate ?? "9999-12-31",
                    )
                  : 0,
              );
            return (
              <section
                aria-label={`Project stage: ${stage.name}`}
                className={`project-column${collapsed ? " collapsed" : ""}`}
                key={stage.id}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => void drop(event, stage.id)}
              >
                <div className="kanban-stage-heading">
                  <h2 className="kanban-stage-title">
                    <button
                      aria-expanded={!collapsed}
                      className="kanban-column-heading"
                      onClick={() => {
                        setCollapsedStageIds((current) => {
                          const next = new Set(current);
                          if (next.has(stage.id)) next.delete(stage.id);
                          else next.add(stage.id);
                          return next;
                        });
                      }}
                      type="button"
                    >
                      <span>{stage.name}</span>
                    </button>
                  </h2>
                  <ProjectForm
                    clientNames={clientNames}
                    defaultStageId={stage.id}
                    onCreated={onChanged}
                    setMessage={setMessage}
                    stages={stages}
                  />
                  <button
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? "Expand" : "Collapse"} ${stage.name}`}
                    className="kanban-column-count"
                    onClick={() => {
                      setCollapsedStageIds((current) => {
                        const next = new Set(current);
                        if (next.has(stage.id)) next.delete(stage.id);
                        else next.add(stage.id);
                        return next;
                      });
                    }}
                    type="button"
                  >
                    {String(stageProjects.length)} {collapsed ? "▸" : "▾"}
                  </button>
                </div>
                {collapsed ? null : (
                  <div className="kanban-lane-content">
                    {stageProjects.map((project) => (
                      <ProjectCard
                        delegates={
                          delegations.find(
                            (item) =>
                              item.subjectType === "project" && item.subjectId === project.id,
                          )?.delegates ?? []
                        }
                        key={project.id}
                        metrics={metrics[project.id]}
                        onOpen={onOpen}
                        onSelect={onSelect}
                        onDragStart={(projectId) => {
                          draggedProjectId.current = projectId;
                        }}
                        project={project}
                        selected={selected?.type === "project" && selected.id === project.id}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
      </KanbanBoard>
    </div>
  );
};

const ProjectCard = ({
  delegates,
  metrics,
  onOpen,
  onSelect,
  onDragStart,
  project,
  selected,
}: {
  delegates: readonly DelegateTooltipView[];
  metrics: ProjectMetrics | undefined;
  onOpen: (project: Project) => void;
  onSelect: (project: Project) => void;
  onDragStart: (projectId: string) => void;
  project: Project;
  selected: boolean;
}) => (
  <div
    aria-label={`Project: ${project.name}`}
    aria-pressed={selected}
    className={`project-card compact-card status-${project.status ?? "not_started"}${selected ? " selected" : ""}`}
    data-selectable-card
    draggable
    onClick={(event) => {
      event.stopPropagation();
      onSelect(project);
    }}
    onDragStart={(event) => {
      onDragStart(project.id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-opsweave-project", project.id);
    }}
    onDoubleClick={(event) => {
      event.stopPropagation();
      onOpen(project);
    }}
    onKeyDown={(event) => {
      if (event.key === "Enter") onOpen(project);
    }}
    onMouseDown={(event) => {
      if (event.detail >= 2) {
        event.preventDefault();
        event.stopPropagation();
        onOpen(project);
      }
    }}
    role="button"
    tabIndex={0}
  >
    <div className="card-title-row">
      <h3>{project.name}</h3>
      <DelegationIndicator compact delegates={delegates} />
    </div>
    <dl className="card-metrics">
      <div>
        <dt>Spent</dt>
        <dd>{metrics?.hoursSpent ?? 0}h</dd>
      </div>
      <div>
        <dt>Complete</dt>
        <dd>{Math.round(metrics?.progressPercent ?? 0)}%</dd>
      </div>
      <div>
        <dt>Start</dt>
        <dd>{metrics?.startDate ?? "—"}</dd>
      </div>
      <div>
        <dt>End</dt>
        <dd>{metrics?.endDate ?? "—"}</dd>
      </div>
      <div>
        <dt>Priority</dt>
        <dd>{priorityLevelLabel(project.priorityLevel)}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{workStatusLabel(project.status ?? "not_started")}</dd>
      </div>
      <div>
        <dt>Client</dt>
        <dd>{project.clientName ?? "Personal"}</dd>
      </div>
    </dl>
  </div>
);

const TaskForm = ({
  clientNames,
  defaultWorkflowLane,
  onCreated,
  projects,
  setMessage,
}: {
  clientNames: string[];
  defaultWorkflowLane: WorkflowLane;
  onCreated: () => Promise<void>;
  projects: Project[];
  setMessage: (message: string) => void;
}) => {
  const [allocatedHours, setAllocatedHours] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const score = optionalFormNumber(values.get("businessValueScore"));
    try {
      await workspaceRequest("/api/tasks", "POST", {
        allocatedHours: optionalFormNumber(values.get("allocatedHours")),
        businessValueRationale: optionalFormText(values.get("businessValueRationale")),
        businessValueScore: score,
        clientName: clientValue(values.get("clientName")),
        dueDate: optionalFormText(values.get("dueDate")),
        endTime: optionalFormText(values.get("endTime")),
        projectId: optionalFormText(values.get("projectId")),
        priorityLevel: optionalFormNumber(values.get("priorityLevel")),
        startDate: optionalFormText(values.get("startDate")),
        startTime: optionalFormText(values.get("startTime")),
        status: values.get("status"),
        title: values.get("title"),
        valueSource: score === null ? null : "owner",
        workflowLane: values.get("workflowLane"),
      });
      form.reset();
      setAllocatedHours(null);
      setOpen(false);
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create task.");
    }
  };
  if (!open)
    return (
      <button
        aria-label="Add task to this stage"
        className="kanban-add-button"
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        +
      </button>
    );
  return (
    <div
      aria-label="Create task"
      aria-modal="true"
      className="create-dialog-backdrop"
      role="dialog"
    >
      <form
        className="task-form create-popover create-dialog"
        onSubmit={(event) => void submit(event)}
      >
        <h2>New task</h2>
        <label>
          Task title
          <input name="title" required />
        </label>
        <label>
          Project
          <select
            aria-label="Project"
            name="projectId"
            onChange={(event) => {
              setSelectedProjectId(event.target.value);
            }}
            value={selectedProjectId}
          >
            <option value="">No project</option>
            {projects
              .filter((project) => project.archivedAt === null)
              .map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
          </select>
        </label>
        <ClientField
          clientNames={clientNames}
          defaultValue={projects.find((project) => project.id === selectedProjectId)?.clientName}
          disabled={selectedProjectId !== ""}
        />
        <label>
          Stage
          <select defaultValue={defaultWorkflowLane} name="workflowLane">
            {WORKFLOW_LANES.map((lane) => (
              <option key={lane} value={lane}>
                {workflowLaneLabel(lane)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start date
          <input name="startDate" type="date" />
        </label>
        <label>
          Start time
          <input name="startTime" type="time" />
        </label>
        <label>
          End / due date
          <input name="dueDate" type="date" />
        </label>
        <label>
          End time
          <input name="endTime" type="time" />
        </label>
        <label>
          Allocated hours
          <input
            min="0"
            name="allocatedHours"
            onChange={(event) => {
              setAllocatedHours(event.target.value === "" ? null : Number(event.target.value));
            }}
            step="0.25"
            type="number"
            value={allocatedHours ?? ""}
          />
        </label>
        <label>
          Task size
          <select
            aria-readonly="true"
            onChange={() => undefined}
            value={
              allocatedHours === null
                ? ""
                : allocatedHours <= 0.5
                  ? "small"
                  : allocatedHours <= 1
                    ? "medium"
                    : allocatedHours <= 2
                      ? "large"
                      : "mega"
            }
          >
            <option value="">Not set</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
            <option value="mega">Mega</option>
          </select>
        </label>
        <label>
          Priority level (1–5)
          <select name="priorityLevel">
            <option value="">Not set</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {priorityLevelLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select defaultValue="not_started" name="status">
            {WORK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {workStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Value score (1–100)
          <input max="100" min="1" name="businessValueScore" type="number" />
        </label>
        <label>
          Value rationale
          <textarea name="businessValueRationale" />
        </label>
        <div className="button-row">
          <button type="submit">Create task</button>
          <button
            className="secondary"
            onClick={() => {
              setOpen(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const TaskBoard = ({
  clientNames,
  condensed,
  delegations,
  onChanged,
  onOpen,
  onSelect,
  projects,
  selected,
  setMessage,
  tasks,
  updating,
}: {
  clientNames: string[];
  condensed: boolean;
  delegations: NonNullable<WorkspaceData["delegations"]>;
  onChanged: () => Promise<void>;
  onOpen: (task: Task) => void;
  onSelect: (task: Task) => void;
  projects: Project[];
  selected: Selection;
  setMessage: (message: string) => void;
  tasks: Task[];
  updating: boolean;
}) => {
  const draggedTaskId = useRef<string | null>(null);
  const [collapsedLanes, setCollapsedLanes] = useState(
    () => new Set<WorkflowLane>(["done", "cancelled"]),
  );
  const drop = async (event: DragEvent<HTMLElement>, workflowLane: WorkflowLane) => {
    event.preventDefault();
    const id = draggedTaskId.current ?? event.dataTransfer.getData("application/x-opsweave-task");
    draggedTaskId.current = null;
    const task = tasks.find((candidate) => candidate.id === id);
    if (task === undefined || task.workflowLane === workflowLane) return;
    try {
      await workspaceRequest(`/api/tasks/${task.id}/move`, "POST", {
        version: task.version,
        workflowLane,
      });
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to move task.");
    }
  };
  return (
    <div aria-busy={updating} className={updating ? "kanban-updating" : undefined}>
      <KanbanBoard className="task-board" condensed={condensed} label="Global task Kanban">
        {WORKFLOW_LANES.map((lane) => {
          const laneTasks = tasks.filter((task) => task.workflowLane === lane);
          const collapsed = collapsedLanes.has(lane);
          return (
            <section
              aria-label={`Task lane: ${workflowLaneLabel(lane)}`}
              className={`task-lane${collapsed ? " collapsed" : ""}`}
              key={lane}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => void drop(event, lane)}
            >
              <div className="task-lane-heading">
                <h3 className="kanban-stage-title">
                  <button
                    aria-expanded={!collapsed}
                    className="kanban-column-heading"
                    onClick={() => {
                      setCollapsedLanes((current) => {
                        const next = new Set(current);
                        if (next.has(lane)) next.delete(lane);
                        else next.add(lane);
                        return next;
                      });
                    }}
                    type="button"
                  >
                    <span>{workflowLaneLabel(lane)}</span>
                  </button>
                </h3>
                <TaskForm
                  clientNames={clientNames}
                  defaultWorkflowLane={lane}
                  onCreated={onChanged}
                  projects={projects}
                  setMessage={setMessage}
                />
                <button
                  aria-expanded={!collapsed}
                  className="kanban-column-count"
                  onClick={() => {
                    setCollapsedLanes((current) => {
                      const next = new Set(current);
                      if (next.has(lane)) next.delete(lane);
                      else next.add(lane);
                      return next;
                    });
                  }}
                  type="button"
                >
                  {String(laneTasks.length)} {collapsed ? "▸" : "▾"}
                </button>
              </div>
              {collapsed ? null : (
                <div className="kanban-lane-content">
                  {laneTasks.map((task) => (
                    <TaskCard
                      delegates={
                        delegations.find(
                          (item) => item.subjectType === "task" && item.subjectId === task.id,
                        )?.delegates ?? []
                      }
                      key={task.id}
                      onOpen={onOpen}
                      onSelect={onSelect}
                      onDragStart={(taskId) => {
                        draggedTaskId.current = taskId;
                      }}
                      selected={selected?.type === "task" && selected.id === task.id}
                      task={task}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </KanbanBoard>
    </div>
  );
};

const TaskCard = ({
  delegates,
  onOpen,
  onSelect,
  onDragStart,
  selected,
  task,
}: {
  delegates: readonly DelegateTooltipView[];
  onOpen: (task: Task) => void;
  onSelect: (task: Task) => void;
  onDragStart: (taskId: string) => void;
  selected: boolean;
  task: Task;
}) => {
  const deadline = taskDeadlineVisual(task);
  return (
    <div
      aria-label={`Task: ${task.title}`}
      aria-pressed={selected}
      className={`task-card compact-card status-${task.status ?? "not_started"}${selected ? " selected" : ""}${deadline.overdue ? " overdue" : ""}${task.delegateReviewPending ? " delegate-review-pending" : ""}`}
      data-selectable-card
      draggable
      onClick={(event) => {
        event.stopPropagation();
        onSelect(task);
      }}
      onDragStart={(event) => {
        onDragStart(task.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-opsweave-task", task.id);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onOpen(task);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(task);
      }}
      onMouseDown={(event) => {
        if (event.detail >= 2) {
          event.preventDefault();
          event.stopPropagation();
          onOpen(task);
        }
      }}
      role="button"
      style={
        deadline.color === null
          ? undefined
          : ({ "--deadline-color": deadline.color } as CSSProperties)
      }
      tabIndex={0}
    >
      {task.delegateReviewPending ? (
        <span className="review-ready-badge">Ready for review</span>
      ) : null}
      <div className="card-title-row">
        <h4>{task.title}</h4>
        <DelegationIndicator compact delegates={delegates} />
      </div>
      <dl className="task-card-facts">
        <div>
          <dt>Value</dt>
          <dd>{task.businessValueScore ?? "—"}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{task.dueDate ?? "—"}</dd>
        </div>
        <div>
          <dt>Hours</dt>
          <dd>{task.allocatedHours === null ? "—" : `${String(task.hoursLeft)}h left`}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{task.size ?? "—"}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{priorityLevelLabel(task.priorityLevel)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{workStatusLabel(task.status ?? "not_started")}</dd>
        </div>
        <div>
          <dt>Planning</dt>
          <dd title={task.planningRationale ?? undefined}>
            {task.planningScore === null ? "Not scored" : `${String(task.planningScore)}/100`}
            {task.scheduleLocked ? " · Locked" : ""}
          </dd>
        </div>
        <div>
          <dt>Client</dt>
          <dd>{task.clientName ?? "Personal"}</dd>
        </div>
      </dl>
    </div>
  );
};

const DependencyMap = ({
  data,
  onOpenEntity,
}: {
  data: WorkspaceData;
  onOpenEntity: (entity: { id: string; type: "project" | "task" }) => void;
}) => {
  const projects = data.projects.filter((project) => project.archivedAt === null);
  const definition = dependencyMermaid(
    data.tasks,
    data.dependencies,
    projects,
    data.projectDependencies,
    data.entityDependencies,
  );
  const entities = [
    ...data.tasks.map((task, index) => ({
      delegates:
        data.delegations?.find((item) => item.subjectType === "task" && item.subjectId === task.id)
          ?.delegates ?? [],
      entityId: task.id,
      entityType: "task" as const,
      mermaidId: `task_${String(index)}`,
    })),
    ...projects.flatMap((project, index) => [
      {
        delegates:
          data.delegations?.find(
            (item) => item.subjectType === "project" && item.subjectId === project.id,
          )?.delegates ?? [],
        entityId: project.id,
        entityType: "project" as const,
        mermaidId: `project_${String(index)}`,
      },
      {
        entityId: project.id,
        entityType: "project" as const,
        mermaidId: `group_${String(index)}`,
      },
    ]),
  ];
  return (
    <section className="workspace-section" aria-labelledby="dependencies-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Task graph</p>
          <h2 id="dependencies-heading">Dependency map</h2>
        </div>
      </div>
      <p className="muted">
        Tasks are framed by project. Manage blockers inside a task or project record; pan, zoom, or
        search this map to navigate.
      </p>
      <div className="diagram-panel">
        <MermaidDiagram
          definition={definition}
          entities={entities}
          onEntityOpen={({ entityId, entityType }) => {
            onOpenEntity({ id: entityId, type: entityType });
          }}
        />
        <details className="diagram-source">
          <summary>Show Mermaid source</summary>
          <textarea aria-label="Mermaid dependency source" readOnly value={definition} />
        </details>
      </div>
    </section>
  );
};
