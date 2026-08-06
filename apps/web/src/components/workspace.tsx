"use client";
/* eslint-disable security/detect-object-injection -- keys are constrained to local literal unions. */

import { useState, type SyntheticEvent } from "react";

const WORKFLOW_LANES = [
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
type KanbanSortMode = "greatest_value" | "manual" | "planning_priority";
const WORKFLOW_LANE_LABELS: Record<(typeof WORKFLOW_LANES)[number], string> = {
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

interface Stage {
  archivedAt: string | null;
  description: string | null;
  id: string;
  llmContext: string | null;
  name: string;
  sequence: number;
  version: number;
}
interface Project {
  archivedAt: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  name: string;
  stageId: string | null;
  stageName: string | null;
  version: number;
}
interface Task {
  allocatedHours: number | null;
  businessValueRationale: string | null;
  businessValueScore: number | null;
  checklist: { completed: boolean; id: string; label: string; position: number }[];
  definitionOfDone: string | null;
  dueDate: string | null;
  id: string;
  manualLanePosition: number;
  projectId: string | null;
  size: "large" | "medium" | "small" | null;
  title: string;
  valueAdd: string | null;
  valueSource: "ai_proposed" | "imported" | "owner" | null;
  version: number;
  workDescription: string | null;
  workflowLane: (typeof WORKFLOW_LANES)[number];
}
interface WorkspaceData {
  blockerCounts: Record<string, number>;
  dependencies: { dependsOnTaskId: string; taskId: string }[];
  projectMetrics: Record<
    string,
    {
      allocatedHours: number;
      endDate: string | null;
      progressPercent: number;
      startDate: string | null;
    }
  >;
  projects: Project[];
  sort: KanbanSortMode;
  stages: Stage[];
  tasks: Task[];
}

const request = async (url: string, method: string, payload?: unknown) => {
  const response = await fetch(url, {
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    cache: "no-store",
    headers: { "content-type": "application/json" },
    method,
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(
      typeof body.message === "string" ? body.message : "The request failed.",
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return body;
};

const optionalInput = (value: FormDataEntryValue | null): FormDataEntryValue | null =>
  value === "" ? null : value;

const sortLabels: Record<KanbanSortMode, string> = {
  greatest_value: "Greatest value",
  manual: "Manual",
  planning_priority: "Planning priority",
};

export const Workspace = ({ initial }: { initial: WorkspaceData }) => {
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState("");
  const refresh = async (sort = data.sort) => {
    try {
      const result = (await request(
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
    await refresh(sort);
  };
  return (
    <div className="workspace-layout">
      <p className="form-message" aria-live="polite">
        {message}
      </p>
      <section aria-labelledby="projects-heading" className="workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Project Kanban</p>
            <h1 id="projects-heading">Projects</h1>
          </div>
          <ProjectForm stages={data.stages} onCreated={refresh} setMessage={setMessage} />
        </div>
        <ProjectBoard
          projectMetrics={data.projectMetrics}
          projects={data.projects}
          stages={data.stages}
          onChanged={() => void refresh()}
          setMessage={setMessage}
        />
      </section>
      <section aria-labelledby="tasks-heading" className="workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Global task board</p>
            <h2 id="tasks-heading">Tasks</h2>
          </div>
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
        </div>
        <p className="board-explanation">
          {data.sort === "manual"
            ? "Manual order is persisted independently in every lane. Use the earlier/later controls to reorder a task."
            : `${sortLabels[data.sort]} is computed by the server within each lane. Cross-lane movement is available; manual positions are unchanged.`}
        </p>
        <TaskForm projects={data.projects} onCreated={refresh} setMessage={setMessage} />
        <TaskBoard data={data} onChanged={() => void refresh()} setMessage={setMessage} />
      </section>
      <StageManager stages={data.stages} onChanged={() => void refresh()} setMessage={setMessage} />
      <TaskTimeline tasks={data.tasks} />
      <DependencyGraph
        blockerCounts={data.blockerCounts}
        dependencies={data.dependencies}
        onChanged={() => void refresh()}
        setMessage={setMessage}
        tasks={data.tasks}
      />
    </div>
  );
};

const TaskTimeline = ({ tasks }: { tasks: Task[] }) => {
  const [scale, setScale] = useState("month");
  const dated = tasks
    .filter((task) => task.dueDate !== null)
    .sort((left, right) => left.dueDate?.localeCompare(right.dueDate ?? "") ?? 0);
  return (
    <section className="workspace-section" aria-labelledby="timeline-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Task Gantt</p>
          <h2 id="timeline-heading">Timeline</h2>
        </div>
        <label className="sort-control">
          Timeline scale
          <select
            onChange={(event) => {
              setScale(event.target.value);
            }}
            value={scale}
          >
            {["day", "week", "month", "three_month", "six_month", "one_year"].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        {scale.replaceAll("_", " ")} view. Project dates are derived from task dates.
      </p>
      {dated.length === 0 ? (
        <p>No dated tasks yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Due date</th>
              <th>Allocated hours</th>
            </tr>
          </thead>
          <tbody>
            {dated.map((task) => (
              <tr key={task.id}>
                <td>{task.title}</td>
                <td>{task.dueDate}</td>
                <td>{task.allocatedHours ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tasks.some((task) => task.dueDate === null) ? (
        <p className="muted">
          Undated tasks are not placed on the timeline:{" "}
          {tasks
            .filter((task) => task.dueDate === null)
            .map((task) => task.title)
            .join(", ")}
        </p>
      ) : null}
    </section>
  );
};

const DependencyGraph = ({
  blockerCounts,
  dependencies,
  onChanged,
  setMessage,
  tasks,
}: {
  blockerCounts: WorkspaceData["blockerCounts"];
  dependencies: WorkspaceData["dependencies"];
  onChanged: () => void;
  setMessage: (value: string) => void;
  tasks: Task[];
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const selected = selectedId === null ? null : (tasksById.get(selectedId) ?? null);
  const selectedEdges =
    selected === null ? [] : dependencies.filter((edge) => edge.taskId === selected.id);
  const add = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (selected === null) return;
    const dependsOnTaskId = new FormData(event.currentTarget).get("dependsOnTaskId");
    try {
      await request(`/api/tasks/${selected.id}/dependencies`, "POST", { dependsOnTaskId });
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create dependency.");
    }
  };
  const remove = async (dependsOnTaskId: string) => {
    if (selected === null) return;
    try {
      await request(`/api/tasks/${selected.id}/dependencies/${dependsOnTaskId}`, "DELETE");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove dependency.");
    }
  };
  return (
    <section className="workspace-section" aria-labelledby="dependencies-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Task graph</p>
          <h2 id="dependencies-heading">Dependencies</h2>
        </div>
      </div>
      <p className="muted">
        Select a task to inspect its direct blockers. Dependency edges are validated on the server
        and cannot form cycles.
      </p>
      <ul className="stage-list">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              className="secondary"
              onClick={() => {
                setSelectedId(task.id);
              }}
              type="button"
            >
              {task.title}
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <aside aria-live="polite">
          <h3>{selected.title}</h3>
          <p>
            {selectedEdges.length === 0
              ? "No direct blockers."
              : `Blocked by: ${selectedEdges
                  .map((edge) => tasksById.get(edge.dependsOnTaskId)?.title ?? "Unknown task")
                  .join(", ")}`}
          </p>
          <p className="muted">Transitive blockers: {blockerCounts[selected.id] ?? 0}</p>
          <form
            className="move-form"
            onSubmit={(event) => {
              void add(event);
            }}
          >
            <label>
              Add blocker
              <select name="dependsOnTaskId" required>
                <option value="">Choose task</option>
                {tasks
                  .filter(
                    (task) =>
                      task.id !== selected.id &&
                      !selectedEdges.some((edge) => edge.dependsOnTaskId === task.id),
                  )
                  .map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
              </select>
            </label>
            <button disabled={tasks.length < 2} type="submit">
              Add dependency
            </button>
          </form>
          {selectedEdges.map((edge) => (
            <button
              className="secondary"
              key={edge.dependsOnTaskId}
              onClick={() => void remove(edge.dependsOnTaskId)}
              type="button"
            >
              Remove {tasksById.get(edge.dependsOnTaskId)?.title ?? "dependency"}
            </button>
          ))}
        </aside>
      ) : null}
      <details>
        <summary>Mermaid export</summary>
        <textarea
          aria-label="Mermaid dependency export"
          readOnly
          value={[
            "flowchart LR",
            ...dependencies.flatMap((edge) => {
              const task = tasksById.get(edge.taskId);
              const blocker = tasksById.get(edge.dependsOnTaskId);
              return task === undefined || blocker === undefined
                ? []
                : [
                    `${edge.dependsOnTaskId}["${blocker.title.replaceAll('"', '\\"')}"] --> ${edge.taskId}["${task.title.replaceAll('"', '\\"')}"]`,
                  ];
            }),
          ].join("\n")}
        />
      </details>
    </section>
  );
};

const ProjectForm = ({
  stages,
  onCreated,
  setMessage,
}: {
  onCreated: () => Promise<void>;
  setMessage: (value: string) => void;
  stages: Stage[];
}) => {
  const [open, setOpen] = useState(false);
  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    form.reset();
    try {
      await request("/api/projects", "POST", {
        description: optionalInput(values.get("description")),
        name: values.get("name"),
        stageId: optionalInput(values.get("stageId")),
      });
      setOpen(false);
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create project.");
    }
  };
  return open ? (
    <form
      className="compact-form"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label>
        Project name
        <input name="name" required />
      </label>
      <label>
        Stage
        <select name="stageId">
          <option value="">First active stage</option>
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
        Description
        <textarea name="description" maxLength={10000} />
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
  ) : (
    <button
      onClick={() => {
        setOpen(true);
      }}
      type="button"
    >
      New project
    </button>
  );
};

const ProjectBoard = ({
  projectMetrics,
  projects,
  stages,
  onChanged,
  setMessage,
}: {
  onChanged: () => void;
  projectMetrics: WorkspaceData["projectMetrics"];
  projects: Project[];
  setMessage: (value: string) => void;
  stages: Stage[];
}) => (
  <div className="project-board" aria-label="Project stages">
    {stages
      .filter((stage) => stage.archivedAt === null)
      .map((stage) => (
        <section
          className="project-column"
          key={stage.id}
          aria-label={`Project stage: ${stage.name}`}
        >
          <h2 id={`stage-${stage.id}`}>{stage.name}</h2>
          {projects
            .filter((project) => project.stageId === stage.id && project.archivedAt === null)
            .map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                metrics={projectMetrics[project.id]}
                stages={stages}
                onChanged={onChanged}
                setMessage={setMessage}
              />
            ))}
        </section>
      ))}
  </div>
);

const ProjectCard = ({
  metrics,
  onChanged,
  project,
  setMessage,
  stages,
}: {
  metrics: WorkspaceData["projectMetrics"][string] | undefined;
  onChanged: () => void;
  project: Project;
  setMessage: (value: string) => void;
  stages: Stage[];
}) => {
  const [editing, setEditing] = useState(false);
  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await request(`/api/projects/${project.id}`, "PUT", {
        archived: false,
        description: optionalInput(values.get("description")),
        name: values.get("name"),
        stageId: optionalInput(values.get("stageId")),
        version: project.version,
      });
      setEditing(false);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update project.");
    }
  };
  if (editing)
    return (
      <form
        className="project-card"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label>
          Project name
          <input defaultValue={project.name} name="name" required />
        </label>
        <label>
          Stage
          <select defaultValue={project.stageId ?? ""} name="stageId">
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
          Description
          <textarea defaultValue={project.description ?? ""} name="description" />
        </label>
        <div className="button-row">
          <button type="submit">Save project</button>
          <button
            className="secondary"
            onClick={() => {
              setEditing(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  return (
    <article className="project-card">
      <h3>{project.name}</h3>
      {metrics ? (
        <p className="muted">
          {metrics.allocatedHours}h · {Math.round(metrics.progressPercent)}% complete ·{" "}
          {metrics.startDate ?? "No start date"} to {metrics.endDate ?? "No end date"}
        </p>
      ) : null}
      {project.description ? (
        <p>{project.description}</p>
      ) : (
        <p className="muted">No description yet.</p>
      )}
      <button
        className="secondary"
        onClick={() => {
          setEditing(true);
        }}
        type="button"
      >
        Edit project
      </button>
    </article>
  );
};

const TaskForm = ({
  onCreated,
  projects,
  setMessage,
}: {
  onCreated: () => Promise<void>;
  projects: Project[];
  setMessage: (value: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    form.reset();
    const score = values.get("businessValueScore");
    try {
      await request("/api/tasks", "POST", {
        businessValueRationale: optionalInput(values.get("businessValueRationale")),
        businessValueScore: score === "" ? null : Number(score),
        dueDate: optionalInput(values.get("dueDate")),
        projectId: optionalInput(values.get("projectId")),
        title: values.get("title"),
        valueAdd: optionalInput(values.get("valueAdd")),
        valueSource: score === "" ? null : "owner",
        workflowLane: values.get("workflowLane"),
      });
      setOpen(false);
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create task.");
    }
  };
  return open ? (
    <form
      className="task-form"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <label>
        Task title
        <input name="title" required />
      </label>
      <label>
        Project
        <select name="projectId">
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
      <label>
        Lane
        <select defaultValue="inbox" name="workflowLane">
          {WORKFLOW_LANES.map((lane) => (
            <option key={lane} value={lane}>
              {WORKFLOW_LANE_LABELS[lane]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Due date
        <input name="dueDate" type="date" />
      </label>
      <label>
        Value score (1–100)
        <input max="100" min="1" name="businessValueScore" type="number" />
      </label>
      <label>
        Value rationale
        <textarea name="businessValueRationale" />
      </label>
      <label>
        Value add
        <textarea name="valueAdd" />
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
  ) : (
    <button
      onClick={() => {
        setOpen(true);
      }}
      type="button"
    >
      New task
    </button>
  );
};

const TaskBoard = ({
  data,
  onChanged,
  setMessage,
}: {
  data: WorkspaceData;
  onChanged: () => void;
  setMessage: (value: string) => void;
}) => (
  <div className="task-board" aria-label="Global task Kanban">
    {WORKFLOW_LANES.map((lane) => (
      <section
        className="task-lane"
        key={lane}
        aria-label={`Task lane: ${WORKFLOW_LANE_LABELS[lane]}`}
      >
        <h3 id={`lane-${lane}`}>{WORKFLOW_LANE_LABELS[lane]}</h3>
        {data.tasks
          .filter((task) => task.workflowLane === lane)
          .map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              projects={data.projects}
              sort={data.sort}
              onChanged={onChanged}
              setMessage={setMessage}
            />
          ))}
      </section>
    ))}
  </div>
);

const TaskCard = ({
  onChanged,
  projects,
  setMessage,
  sort,
  task,
}: {
  onChanged: () => void;
  projects: Project[];
  setMessage: (value: string) => void;
  sort: KanbanSortMode;
  task: Task;
}) => {
  const [editing, setEditing] = useState(false);
  const move = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const lane = new FormData(event.currentTarget).get("lane");
    try {
      await request(`/api/tasks/${task.id}/move`, "POST", {
        version: task.version,
        workflowLane: lane,
      });
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to move task.");
    }
  };
  const reorder = async (direction: "earlier" | "later") => {
    try {
      await request(`/api/tasks/${task.id}/reorder`, "POST", { direction, version: task.version });
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reorder task.");
    }
  };
  const save = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const score = values.get("businessValueScore");
    try {
      await request(`/api/tasks/${task.id}`, "PUT", {
        allocatedHours: task.allocatedHours,
        businessValueRationale: optionalInput(values.get("businessValueRationale")),
        businessValueScore: score === "" ? null : Number(score),
        checklist: task.checklist.map(({ completed, label, position }) => ({
          completed,
          label,
          position,
        })),
        definitionOfDone: task.definitionOfDone,
        dueDate: optionalInput(values.get("dueDate")),
        projectId: optionalInput(values.get("projectId")),
        size: task.size,
        title: values.get("title"),
        valueAdd: task.valueAdd,
        valueSource: score === "" ? null : "owner",
        version: task.version,
        workDescription: task.workDescription,
        workflowLane: task.workflowLane,
      });
      setEditing(false);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update task.");
    }
  };
  if (editing)
    return (
      <form
        className="task-card"
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <label>
          Task title
          <input defaultValue={task.title} name="title" required />
        </label>
        <label>
          Project
          <select defaultValue={task.projectId ?? ""} name="projectId">
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input defaultValue={task.dueDate ?? ""} name="dueDate" type="date" />
        </label>
        <label>
          Value score
          <input
            defaultValue={task.businessValueScore ?? ""}
            max="100"
            min="1"
            name="businessValueScore"
            type="number"
          />
        </label>
        <label>
          Value rationale
          <textarea
            defaultValue={task.businessValueRationale ?? ""}
            name="businessValueRationale"
          />
        </label>
        <div className="button-row">
          <button type="submit">Save task</button>
          <button
            className="secondary"
            onClick={() => {
              setEditing(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  return (
    <article className="task-card">
      <h4>{task.title}</h4>
      <p className={task.businessValueScore === null ? "value-unset" : "value-score"}>
        {task.businessValueScore === null
          ? "Value not set"
          : `Value ${String(task.businessValueScore)}/100`}
      </p>
      {task.businessValueRationale ? <p>{task.businessValueRationale}</p> : null}
      {task.dueDate ? <p>Due {task.dueDate}</p> : null}
      <button
        className="secondary"
        onClick={() => {
          setEditing(true);
        }}
        type="button"
      >
        Edit task
      </button>
      <form
        className="move-form"
        onSubmit={(event) => {
          void move(event);
        }}
      >
        <label>
          Move to
          <select defaultValue={task.workflowLane} name="lane">
            {WORKFLOW_LANES.map((lane) => (
              <option key={lane} value={lane}>
                {WORKFLOW_LANE_LABELS[lane]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Move</button>
      </form>
      {sort === "manual" ? (
        <div className="button-row">
          <button className="secondary" onClick={() => void reorder("earlier")} type="button">
            Move earlier
          </button>
          <button className="secondary" onClick={() => void reorder("later")} type="button">
            Move later
          </button>
        </div>
      ) : (
        <p className="muted">Within-lane order is computed in {sortLabels[sort]} mode.</p>
      )}
    </article>
  );
};

const StageManager = ({
  onChanged,
  setMessage,
  stages,
}: {
  onChanged: () => void;
  setMessage: (value: string) => void;
  stages: Stage[];
}) => {
  const [open, setOpen] = useState(false);
  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await request("/api/project-stages", "POST", {
        description: optionalInput(values.get("description")),
        llmContext: optionalInput(values.get("llmContext")),
        name: values.get("name"),
        sequence: Number(values.get("sequence")),
      });
      event.currentTarget.reset();
      setOpen(false);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create stage.");
    }
  };
  return (
    <section className="workspace-section" aria-labelledby="stages-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Project configuration</p>
          <h2 id="stages-heading">Project stages</h2>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setOpen(!open);
          }}
          type="button"
        >
          {open ? "Close" : "Add stage"}
        </button>
      </div>
      {open ? (
        <form
          className="compact-form"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label>
            Stage name
            <input name="name" required />
          </label>
          <label>
            Sequence
            <input defaultValue={stages.length} min="0" name="sequence" type="number" />
          </label>
          <label>
            Human description
            <textarea name="description" />
          </label>
          <label>
            LLM context
            <textarea name="llmContext" />
          </label>
          <button type="submit">Create stage</button>
        </form>
      ) : null}
      <div className="stage-list">
        {stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} onChanged={onChanged} setMessage={setMessage} />
        ))}
      </div>
    </section>
  );
};

const StageRow = ({
  onChanged,
  setMessage,
  stage,
}: {
  onChanged: () => void;
  setMessage: (value: string) => void;
  stage: Stage;
}) => {
  const [editing, setEditing] = useState(false);
  const save = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await request(`/api/project-stages/${stage.id}`, "PUT", {
        description: optionalInput(values.get("description")),
        llmContext: optionalInput(values.get("llmContext")),
        name: values.get("name"),
        sequence: Number(values.get("sequence")),
        version: stage.version,
      });
      setEditing(false);
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update stage.");
    }
  };
  const archive = async () => {
    try {
      await request(`/api/project-stages/${stage.id}`, "DELETE");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to archive stage.");
    }
  };
  if (editing)
    return (
      <form
        className="compact-form"
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <label>
          Name
          <input defaultValue={stage.name} name="name" required />
        </label>
        <label>
          Sequence
          <input defaultValue={stage.sequence} min="0" name="sequence" type="number" />
        </label>
        <label>
          Description
          <textarea defaultValue={stage.description ?? ""} name="description" />
        </label>
        <label>
          LLM context
          <textarea defaultValue={stage.llmContext ?? ""} name="llmContext" />
        </label>
        <div className="button-row">
          <button type="submit">Save stage</button>
          <button
            className="secondary"
            onClick={() => {
              setEditing(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  return (
    <article className="project-card">
      <strong>{stage.name}</strong>
      <span className="muted">
        {stage.archivedAt ? "Archived" : `Sequence ${String(stage.sequence)}`}
      </span>
      {stage.description ? <span>{stage.description}</span> : null}
      {stage.archivedAt ? null : (
        <div className="button-row">
          <button
            className="secondary"
            onClick={() => {
              setEditing(true);
            }}
            type="button"
          >
            Edit
          </button>
          <button className="secondary" onClick={() => void archive()} type="button">
            Archive
          </button>
        </div>
      )}
    </article>
  );
};
