"use client";

import { useEffect, useId, useMemo, useState, type DragEvent, type SyntheticEvent } from "react";

import { RichTextEditor } from "./rich-text-editor";

type SourceType = "instruction" | "meeting_note" | "other_text" | "transcript";
type TaskSize = "large" | "medium" | "small" | "mega";
type BlockerType = "existing_project" | "existing_task" | "proposed_project" | "proposed_task";

interface ProjectOption {
  archivedAt: string | null;
  id: string;
  name: string;
  stageId: string | null;
  stageName: string | null;
}

interface StageOption {
  archivedAt: string | null;
  id: string;
  name: string;
}

interface ExistingTaskOption {
  id: string;
  projectId: string | null;
  title: string;
  workflowLane: string;
}

interface DraftProject {
  clientRef: string;
  description: string;
  name: string;
  priorityLevel: number;
}

interface DraftTask {
  allocatedHours: number | null;
  assigneeName: string | null;
  blockers: { id: string; type: BlockerType }[];
  businessValueRationale: string | null;
  businessValueScore: number | null;
  checklist: {
    completed: boolean;
    description: string | null;
    label: string;
    predictedHours: number | null;
  }[];
  clientName: string | null;
  clientRef: string;
  confidence: number;
  definitionOfDone: string | null;
  dueDate: string | null;
  endTime: string | null;
  ownerTask: boolean;
  origin: string | null;
  notes: unknown;
  priorityLevel: number | null;
  projectId: string | null;
  proposedProjectRef: string | null;
  size: TaskSize | null;
  sourceSpan: string | null;
  status: "at_risk" | "in_progress" | "not_started" | "on_hold" | "on_track";
  startDate: string | null;
  startTime: string | null;
  title: string;
  valueAdd: string | null;
  workDescription: string | null;
  workflowLane:
    | "cancelled"
    | "delegated"
    | "done"
    | "in_focus"
    | "inbox"
    | "monitor_validate"
    | "this_week"
    | "today"
    | "waiting";
}

interface Proposal {
  includedProjectIds: string[];
  participants: string[];
  projects: DraftProject[];
  questions: string[];
  summary: string;
  tasks: DraftTask[];
}

interface Draft {
  approvalResult: unknown;
  createNewProjects: boolean;
  duplicateOfSourceId: string | null;
  id: string;
  proposal: Proposal;
  purgeAfter: string | null;
  selectedProjectIds: string[];
  sourceContent: string;
  sourceType: SourceType;
  status: "approved" | "declined" | "review_required" | "trashed";
}

interface FailedRun {
  duplicateOfSourceId: string | null;
  id: string;
  safeError: string;
  sourceType: SourceType;
}

interface IntakeResponse {
  drafts: Record<string, unknown>[];
  failedRuns: FailedRun[];
  projects?: ProjectOption[];
  stages?: StageOption[];
  tasks?: ExistingTaskOption[];
}

const sourceTypeLabels: Record<SourceType, string> = {
  instruction: "Instruction",
  meeting_note: "Meeting note",
  other_text: "Other text",
  transcript: "Transcript",
};

const call = async <T,>(url: string, method: string, payload?: unknown): Promise<T> => {
  const response = await fetch(url, {
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    headers: { "content-type": "application/json" },
    method,
  });
  const value = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(value.message ?? "The intake request failed.");
  return value;
};

const nullable = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeDraft = (stored: Record<string, unknown>): Draft => {
  const proposal = (stored.proposal ?? {}) as Record<string, unknown>;
  const tasks = Array.isArray(proposal.tasks) ? proposal.tasks : [];
  return {
    approvalResult: stored.approvalResult ?? null,
    createNewProjects: stored.createNewProjects === true,
    duplicateOfSourceId:
      typeof stored.duplicateOfSourceId === "string" ? stored.duplicateOfSourceId : null,
    id: String(stored.id),
    proposal: {
      includedProjectIds: Array.isArray(proposal.includedProjectIds)
        ? proposal.includedProjectIds.map(String)
        : Array.isArray(stored.selectedProjectIds)
          ? stored.selectedProjectIds.map(String)
          : [],
      participants: Array.isArray(proposal.participants) ? proposal.participants.map(String) : [],
      projects: Array.isArray(proposal.projects) ? (proposal.projects as DraftProject[]) : [],
      questions: Array.isArray(proposal.questions) ? proposal.questions.map(String) : [],
      summary: typeof proposal.summary === "string" ? proposal.summary : "",
      tasks: tasks.map((raw, index) => {
        const task = raw as Partial<DraftTask>;
        return {
          allocatedHours: task.allocatedHours ?? null,
          assigneeName: task.assigneeName ?? null,
          blockers: Array.isArray(task.blockers) ? task.blockers : [],
          businessValueRationale: task.businessValueRationale ?? null,
          businessValueScore: task.businessValueScore ?? null,
          checklist: Array.isArray(task.checklist)
            ? task.checklist.map((item) =>
                typeof item === "string"
                  ? { completed: false, description: null, label: item, predictedHours: null }
                  : item,
              )
            : [],
          clientName: task.clientName ?? null,
          clientRef: task.clientRef ?? `task-${String(index + 1)}`,
          confidence: task.confidence ?? 0,
          definitionOfDone: task.definitionOfDone ?? null,
          dueDate: task.dueDate ?? null,
          endTime: task.endTime ?? null,
          ownerTask: task.ownerTask !== false,
          origin: task.origin ?? null,
          notes: task.notes ?? { content: [], type: "doc" },
          priorityLevel: task.priorityLevel ?? null,
          projectId: task.projectId ?? null,
          proposedProjectRef: task.proposedProjectRef ?? null,
          size: task.size ?? null,
          sourceSpan: task.sourceSpan ?? null,
          status: task.status ?? "not_started",
          startDate: task.startDate ?? null,
          startTime: task.startTime ?? null,
          title: task.title ?? "Untitled task",
          valueAdd: task.valueAdd ?? null,
          workDescription: task.workDescription ?? null,
          workflowLane: task.workflowLane ?? "inbox",
        };
      }),
    },
    purgeAfter: typeof stored.purgeAfter === "string" ? stored.purgeAfter : null,
    selectedProjectIds: Array.isArray(stored.selectedProjectIds)
      ? stored.selectedProjectIds.map(String)
      : [],
    sourceContent: typeof stored.sourceContent === "string" ? stored.sourceContent : "",
    sourceType: stored.sourceType as SourceType,
    status: stored.status as Draft["status"],
  };
};

const ProjectPicker = ({
  excludedIds,
  onAdd,
  projects,
  stages,
}: {
  excludedIds: string[];
  onAdd: (projectId: string) => void;
  projects: ProjectOption[];
  stages: StageOption[];
}) => {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [stageId, setStageId] = useState("");
  const options = projects.filter(
    (project) =>
      !excludedIds.includes(project.id) && (stageId.length === 0 || project.stageId === stageId),
  );
  const optionLabel = (project: ProjectOption) =>
    `${project.name} · ${project.stageName ?? "No stage"}`;
  const selected = options.find((project) => optionLabel(project) === query);
  return (
    <div className="project-picker">
      <select
        aria-label="Filter projects by stage"
        onChange={(event) => {
          setStageId(event.target.value);
        }}
        value={stageId}
      >
        <option value="">All project stages</option>
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
      <input
        aria-label="Select project"
        list={listId}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder="Search and select a project…"
        value={query}
      />
      <datalist id={listId}>
        {options.map((project) => (
          <option key={project.id} value={optionLabel(project)} />
        ))}
      </datalist>
      <button
        className="secondary compact"
        disabled={selected === undefined}
        onClick={() => {
          if (selected !== undefined) onAdd(selected.id);
          setQuery("");
        }}
        type="button"
      >
        Add project
      </button>
    </div>
  );
};

const DraftTaskDialog = ({
  onChange,
  onClose,
  projects,
  proposal,
  task,
  workspaceTasks,
}: {
  onChange: (task: DraftTask) => void;
  onClose: () => void;
  projects: ProjectOption[];
  proposal: Proposal;
  task: DraftTask;
  workspaceTasks: ExistingTaskOption[];
}) => {
  const [value, setValue] = useState(task);
  const [blockerType, setBlockerType] = useState<BlockerType>("proposed_task");
  const [blockerId, setBlockerId] = useState("");
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  const blockerOptions = useMemo(() => {
    if (blockerType === "proposed_task")
      return proposal.tasks
        .filter((candidate) => candidate.clientRef !== task.clientRef)
        .map((candidate) => ({ id: candidate.clientRef, label: candidate.title }));
    if (blockerType === "proposed_project")
      return proposal.projects.map((project) => ({ id: project.clientRef, label: project.name }));
    if (blockerType === "existing_project")
      return projects
        .filter((project) => proposal.includedProjectIds.includes(project.id))
        .map((project) => ({ id: project.id, label: project.name }));
    return workspaceTasks
      .filter(
        (candidate) =>
          candidate.workflowLane !== "done" &&
          candidate.workflowLane !== "cancelled" &&
          (proposal.includedProjectIds.length === 0 ||
            (candidate.projectId !== null &&
              proposal.includedProjectIds.includes(candidate.projectId))),
      )
      .map((candidate) => ({ id: candidate.id, label: candidate.title }));
  }, [blockerType, projects, proposal, task.clientRef, workspaceTasks]);
  return (
    <div className="entity-modal-backdrop" role="presentation">
      <section
        aria-label={`Edit proposed task: ${task.title}`}
        aria-modal="true"
        className="entity-modal standalone-entity-modal"
        role="dialog"
      >
        <header className="entity-modal-header">
          <h2>Edit proposed task</h2>
          <button className="secondary" onClick={onClose} type="button">
            Close
          </button>
        </header>
        <div className="entity-modal-content intake-draft-editor">
          <label>
            Title
            <input
              value={value.title}
              onChange={(event) => {
                setValue({ ...value, title: event.target.value });
              }}
            />
          </label>
          <label>
            Allocated hours
            <input
              min="0"
              step="0.25"
              type="number"
              value={value.allocatedHours ?? ""}
              onChange={(event) => {
                const hours = event.target.value === "" ? null : Number(event.target.value);
                setValue({
                  ...value,
                  allocatedHours: hours,
                  size:
                    hours === null
                      ? null
                      : hours <= 0.5
                        ? "small"
                        : hours <= 1
                          ? "medium"
                          : hours <= 2
                            ? "large"
                            : "mega",
                });
              }}
            />
          </label>
          <label>
            Project
            <select
              value={value.projectId ?? ""}
              onChange={(event) => {
                setValue({
                  ...value,
                  projectId: nullable(event.target.value),
                  proposedProjectRef: null,
                });
              }}
            >
              <option value="">No existing project</option>
              {projects
                .filter((project) => proposal.includedProjectIds.includes(project.id))
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Proposed project
            <select
              value={value.proposedProjectRef ?? ""}
              onChange={(event) => {
                setValue({
                  ...value,
                  projectId: null,
                  proposedProjectRef: nullable(event.target.value),
                });
              }}
            >
              <option value="">No proposed project</option>
              {proposal.projects.map((project) => (
                <option key={project.clientRef} value={project.clientRef}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Client
            <input
              value={value.clientName ?? ""}
              onChange={(event) => {
                setValue({ ...value, clientName: nullable(event.target.value) });
              }}
            />
          </label>
          <label>
            Kanban stage
            <select
              value={value.workflowLane}
              onChange={(event) => {
                setValue({
                  ...value,
                  workflowLane: event.target.value as DraftTask["workflowLane"],
                });
              }}
            >
              <option value="inbox">Inbox</option>
              <option value="this_week">This Week</option>
              <option value="today">Today</option>
              <option value="in_focus">In Focus</option>
              <option value="monitor_validate">Monitor / Validate</option>
              <option value="waiting">Waiting</option>
              <option value="delegated">Delegated</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label>
            Priority level (1–5)
            <select
              value={value.priorityLevel ?? ""}
              onChange={(event) => {
                setValue({
                  ...value,
                  priorityLevel: event.target.value === "" ? null : Number(event.target.value),
                });
              }}
            >
              <option value="">Not set</option>
              {[1, 2, 3, 4, 5].map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={value.status}
              onChange={(event) => {
                setValue({ ...value, status: event.target.value as DraftTask["status"] });
              }}
            >
              <option value="not_started">Not started</option>
              <option value="on_track">On track</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
              <option value="at_risk">At risk</option>
            </select>
          </label>
          <label>
            Responsibility
            <select
              value={value.ownerTask ? "owner" : "third_party"}
              onChange={(event) => {
                setValue({
                  ...value,
                  ownerTask: event.target.value === "owner",
                  ...(event.target.value === "owner" ? { assigneeName: null } : {}),
                });
              }}
            >
              <option value="owner">My task</option>
              <option value="third_party">Third-party task</option>
            </select>
          </label>
          {value.ownerTask ? null : (
            <label>
              Assigned to
              <input
                value={value.assigneeName ?? ""}
                onChange={(event) => {
                  setValue({ ...value, assigneeName: nullable(event.target.value) });
                }}
              />
            </label>
          )}
          <label>
            Size
            <select
              disabled
              value={value.size ?? ""}
              onChange={(event) => {
                setValue({ ...value, size: nullable(event.target.value) as TaskSize | null });
              }}
            >
              <option value="">Not set</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
              <option value="mega">Mega</option>
            </select>
          </label>
          <label>
            Value score
            <input
              min="1"
              max="100"
              type="number"
              value={value.businessValueScore ?? ""}
              onChange={(event) => {
                setValue({
                  ...value,
                  businessValueScore: event.target.value === "" ? null : Number(event.target.value),
                });
              }}
            />
          </label>
          <label>
            Start date
            <input
              type="date"
              value={value.startDate ?? ""}
              onChange={(event) => {
                setValue({ ...value, startDate: nullable(event.target.value) });
              }}
            />
          </label>
          <label>
            Start time
            <input
              type="time"
              value={value.startTime ?? ""}
              onChange={(event) => {
                setValue({ ...value, startTime: nullable(event.target.value) });
              }}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={value.dueDate ?? ""}
              onChange={(event) => {
                setValue({ ...value, dueDate: nullable(event.target.value) });
              }}
            />
          </label>
          <label>
            End time
            <input
              type="time"
              value={value.endTime ?? ""}
              onChange={(event) => {
                setValue({ ...value, endTime: nullable(event.target.value) });
              }}
            />
          </label>
          <label className="wide-field">
            Value rationale
            <textarea
              value={value.businessValueRationale ?? ""}
              onChange={(event) => {
                setValue({ ...value, businessValueRationale: nullable(event.target.value) });
              }}
            />
          </label>
          <label className="wide-field">
            Work description
            <textarea
              value={value.workDescription ?? ""}
              onChange={(event) => {
                setValue({ ...value, workDescription: nullable(event.target.value) });
              }}
            />
          </label>
          <label className="wide-field">
            Value add
            <textarea
              value={value.valueAdd ?? ""}
              onChange={(event) => {
                setValue({ ...value, valueAdd: nullable(event.target.value) });
              }}
            />
          </label>
          <label className="wide-field">
            Definition of done
            <textarea
              value={value.definitionOfDone ?? ""}
              onChange={(event) => {
                setValue({ ...value, definitionOfDone: nullable(event.target.value) });
              }}
            />
          </label>
          <label className="wide-field">
            Origin
            <textarea
              value={value.origin ?? ""}
              onChange={(event) => {
                setValue({ ...value, origin: nullable(event.target.value) });
              }}
            />
          </label>
          <div className="wide-field">
            <RichTextEditor
              label="Task notes"
              value={value.notes}
              onChange={(notes) => {
                setValue((current) => ({ ...current, notes }));
              }}
            />
          </div>
          <fieldset className="wide-field">
            <legend>Subtasks</legend>
            {value.size === "mega" && value.checklist.length === 0 ? (
              <p className="form-message error">Mega tasks require subtasks.</p>
            ) : null}
            <div className="table-scroll">
              <table className="entity-table subtask-table">
                <thead>
                  <tr>
                    <th>Done</th>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Predicted hours</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {value.checklist.map((item, index) => (
                    <tr key={`${item.label}-${String(index)}`}>
                      <td>
                        <input
                          checked={item.completed}
                          onChange={(event) => {
                            setValue({
                              ...value,
                              checklist: value.checklist.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? { ...candidate, completed: event.target.checked }
                                  : candidate,
                              ),
                            });
                          }}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <input
                          value={item.label}
                          onChange={(event) => {
                            setValue({
                              ...value,
                              checklist: value.checklist.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? { ...candidate, label: event.target.value }
                                  : candidate,
                              ),
                            });
                          }}
                        />
                      </td>
                      <td>
                        <textarea
                          rows={2}
                          value={item.description ?? ""}
                          onChange={(event) => {
                            setValue({
                              ...value,
                              checklist: value.checklist.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? { ...candidate, description: nullable(event.target.value) }
                                  : candidate,
                              ),
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          min="0"
                          step="0.25"
                          type="number"
                          value={item.predictedHours ?? ""}
                          onChange={(event) => {
                            setValue({
                              ...value,
                              checklist: value.checklist.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? {
                                      ...candidate,
                                      predictedHours:
                                        event.target.value === ""
                                          ? null
                                          : Number(event.target.value),
                                    }
                                  : candidate,
                              ),
                            });
                          }}
                        />
                      </td>
                      <td>
                        <button
                          className="danger compact"
                          onClick={() => {
                            setValue({
                              ...value,
                              checklist: value.checklist.filter(
                                (_candidate, candidateIndex) => candidateIndex !== index,
                              ),
                            });
                          }}
                          type="button"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Total predicted</th>
                    <td>
                      {value.checklist.reduce(
                        (total, item) => total + (item.predictedHours ?? 0),
                        0,
                      )}
                      h
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <button
              className="secondary"
              onClick={() => {
                setValue({
                  ...value,
                  checklist: [
                    ...value.checklist,
                    { completed: false, description: null, label: "", predictedHours: null },
                  ],
                });
              }}
              type="button"
            >
              Add subtask
            </button>
          </fieldset>
          <fieldset className="wide-field">
            <legend>Blockers</legend>
            <ul>
              {value.blockers.map((blocker) => (
                <li key={`${blocker.type}:${blocker.id}`}>
                  {blocker.type.replaceAll("_", " ")} · {blocker.id}
                  <button
                    className="danger compact"
                    onClick={() => {
                      setValue({
                        ...value,
                        blockers: value.blockers.filter((candidate) => candidate !== blocker),
                      });
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="button-row">
              <select
                aria-label="Blocker type"
                value={blockerType}
                onChange={(event) => {
                  setBlockerType(event.target.value as BlockerType);
                  setBlockerId("");
                }}
              >
                <option value="proposed_task">Proposed task</option>
                <option value="proposed_project">Proposed project</option>
                <option value="existing_project">Existing project</option>
                <option value="existing_task">Existing task</option>
              </select>
              <input
                aria-label="Search and select blocker"
                list={`blockers-${task.clientRef}`}
                onChange={(event) => {
                  setBlockerId(event.target.value);
                }}
                placeholder="Type to filter blockers…"
                value={blockerId}
              />
              <datalist id={`blockers-${task.clientRef}`}>
                {blockerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </datalist>
              <button
                className="secondary"
                disabled={!blockerOptions.some((option) => option.id === blockerId)}
                onClick={() => {
                  if (
                    !value.blockers.some(
                      (blocker) => blocker.id === blockerId && blocker.type === blockerType,
                    )
                  )
                    setValue({
                      ...value,
                      blockers: [...value.blockers, { id: blockerId, type: blockerType }],
                    });
                  setBlockerId("");
                }}
                type="button"
              >
                Add blocker
              </button>
            </div>
          </fieldset>
          <div className="button-row wide-field">
            <button
              onClick={() => {
                onChange(value);
                onClose();
              }}
              type="button"
            >
              Apply task changes
            </button>
            <button className="secondary" onClick={onClose} type="button">
              Cancel
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

type ReviewColumn =
  | { id: string; kind: "existing"; name: string }
  | { id: string; kind: "proposed"; name: string }
  | { id: "unassigned"; kind: "unassigned"; name: "Unassigned" };

const ReviewBoard = ({
  draft,
  onChange,
  onDecision,
  onRetry,
  projects,
  stages,
  workspaceTasks,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onDecision: (draft: Draft, action: "approve" | "decline") => Promise<void>;
  onRetry: (draftId: string) => Promise<void>;
  projects: ProjectOption[];
  stages: StageOption[];
  workspaceTasks: ExistingTaskOption[];
}) => {
  const [editingTaskRef, setEditingTaskRef] = useState<string | null>(null);
  const proposal = draft.proposal;
  const isExtractionFallback = proposal.tasks.some(
    (task) => task.clientRef === "fallback-review-1",
  );
  const existingIds = [
    ...new Set([
      ...proposal.includedProjectIds,
      ...proposal.tasks.flatMap((task) => (task.projectId === null ? [] : [task.projectId])),
    ]),
  ];
  const columns: ReviewColumn[] = [
    ...existingIds.flatMap((id): ReviewColumn[] => {
      const project = projects.find((candidate) => candidate.id === id);
      return project === undefined ? [] : [{ id, kind: "existing", name: project.name }];
    }),
    ...proposal.projects.map((project): ReviewColumn => ({
      id: project.clientRef,
      kind: "proposed",
      name: project.name,
    })),
    { id: "unassigned", kind: "unassigned", name: "Unassigned" },
  ];
  const updateProposal = (next: Proposal) => {
    onChange({ ...draft, proposal: next });
  };
  const tasksFor = (column: ReviewColumn) =>
    proposal.tasks.filter(
      (task) =>
        task.ownerTask &&
        (column.kind === "existing"
          ? task.projectId === column.id
          : column.kind === "proposed"
            ? task.proposedProjectRef === column.id
            : task.projectId === null && task.proposedProjectRef === null),
    );
  const thirdPartyTasks = proposal.tasks.filter((task) => !task.ownerTask);
  const drop = (event: DragEvent<HTMLElement>, column: ReviewColumn) => {
    event.preventDefault();
    const clientRef = event.dataTransfer.getData("application/x-opsweave-draft-task");
    updateProposal({
      ...proposal,
      tasks: proposal.tasks.map((task) =>
        task.clientRef !== clientRef
          ? task
          : {
              ...task,
              projectId: column.kind === "existing" ? column.id : null,
              proposedProjectRef: column.kind === "proposed" ? column.id : null,
            },
      ),
    });
  };
  const editingTask = proposal.tasks.find((task) => task.clientRef === editingTaskRef) ?? null;
  return (
    <article className="intake-review">
      <p className="eyebrow">{sourceTypeLabels[draft.sourceType]} · Review required</p>
      {draft.duplicateOfSourceId === null ? null : (
        <p role="status">Possible duplicate of an earlier intake source. It was not merged.</p>
      )}
      {isExtractionFallback ? (
        <div className="intake-extraction-warning" role="alert">
          <div>
            <strong>No action items were extracted.</strong>
            <p>
              This is a recovery placeholder, not an extracted task. The original source is still
              retained and can be processed again.
            </p>
          </div>
          <button onClick={() => void onRetry(draft.id)} type="button">
            Retry full extraction
          </button>
        </div>
      ) : null}
      <p>{proposal.summary}</p>
      {proposal.participants.length === 0 ? null : (
        <div className="participant-list" aria-label="Meeting participants">
          <strong>People identified:</strong>
          {proposal.participants.map((participant) => (
            <span className="tag" key={participant}>
              {participant}
            </span>
          ))}
        </div>
      )}
      <ProjectPicker
        excludedIds={existingIds}
        projects={projects}
        stages={stages}
        onAdd={(projectId) => {
          updateProposal({
            ...proposal,
            includedProjectIds: [...proposal.includedProjectIds, projectId],
          });
        }}
      />
      <div aria-label="Intake approval project board" className="intake-review-board">
        {columns.map((column) => (
          <section
            className="intake-review-column"
            key={`${column.kind}:${column.id}`}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              drop(event, column);
            }}
          >
            <header>
              <div>
                <span className="eyebrow">
                  {column.kind === "proposed"
                    ? "New project"
                    : column.kind === "existing"
                      ? "Existing project"
                      : "No project"}
                </span>
                <h3>{column.name}</h3>
              </div>
              {column.kind === "unassigned" ? null : (
                <button
                  className="danger compact"
                  onClick={() => {
                    if (column.kind === "proposed")
                      updateProposal({
                        ...proposal,
                        projects: proposal.projects.filter(
                          (project) => project.clientRef !== column.id,
                        ),
                        tasks: proposal.tasks.filter(
                          (task) => task.proposedProjectRef !== column.id,
                        ),
                      });
                    else
                      updateProposal({
                        ...proposal,
                        includedProjectIds: proposal.includedProjectIds.filter(
                          (id) => id !== column.id,
                        ),
                        tasks: proposal.tasks.map((task) =>
                          task.projectId === column.id ? { ...task, projectId: null } : task,
                        ),
                      });
                  }}
                  type="button"
                >
                  Remove column
                </button>
              )}
            </header>
            {tasksFor(column).map((task) => (
              <article
                className="intake-task compact-card"
                draggable
                key={task.clientRef}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-opsweave-draft-task", task.clientRef);
                }}
                onDoubleClick={() => {
                  setEditingTaskRef(task.clientRef);
                }}
              >
                <strong>{task.title}</strong>
                <span>
                  {task.businessValueScore === null
                    ? "Value not scored"
                    : `Value ${String(task.businessValueScore)}/100`}
                </span>
                <span>
                  {task.allocatedHours === null ? "Hours —" : `${String(task.allocatedHours)}h`} ·{" "}
                  {task.size ?? "size —"}
                </span>
                <span>Confidence {String(Math.round(task.confidence * 100))}%</span>
                {task.businessValueRationale === null ? null : <p>{task.businessValueRationale}</p>}
                {task.workDescription === null ? null : <p>{task.workDescription}</p>}
                {task.checklist.length === 0 ? null : (
                  <details>
                    <summary>Proposed subtasks ({String(task.checklist.length)})</summary>
                    <ul>
                      {task.checklist.map((item, index) => (
                        <li key={`${item.label}-${String(index)}`}>
                          {item.label}{" "}
                          {item.predictedHours === null ? "" : `(${String(item.predictedHours)}h)`}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="button-row">
                  <button
                    className="secondary compact"
                    onClick={() => {
                      setEditingTaskRef(task.clientRef);
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="danger compact"
                    onClick={() => {
                      updateProposal({
                        ...proposal,
                        tasks: proposal.tasks.filter(
                          (candidate) => candidate.clientRef !== task.clientRef,
                        ),
                      });
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
      {thirdPartyTasks.length === 0 ? null : (
        <section className="third-party-tasks" aria-label="Third-party tasks">
          <header>
            <div>
              <p className="eyebrow">Other participants</p>
              <h3>Third-party tasks</h3>
            </div>
            <span className="muted">Not created unless you move them into your tasks.</span>
          </header>
          <div className="third-party-task-grid">
            {thirdPartyTasks.map((task) => (
              <article className="intake-task compact-card" key={task.clientRef}>
                <strong>{task.title}</strong>
                <span>Assigned to {task.assigneeName ?? "another participant"}</span>
                <span>
                  {task.allocatedHours === null ? "Hours —" : `${String(task.allocatedHours)}h`} ·{" "}
                  {task.size ?? "size —"}
                </span>
                <div className="button-row">
                  <button
                    onClick={() => {
                      updateProposal({
                        ...proposal,
                        tasks: proposal.tasks.map((candidate) =>
                          candidate.clientRef === task.clientRef
                            ? { ...candidate, assigneeName: null, ownerTask: true }
                            : candidate,
                        ),
                      });
                    }}
                    type="button"
                  >
                    Move to my tasks
                  </button>
                  <button
                    className="secondary compact"
                    onClick={() => {
                      setEditingTaskRef(task.clientRef);
                    }}
                    type="button"
                  >
                    Review details
                  </button>
                  <button
                    className="danger compact"
                    onClick={() => {
                      updateProposal({
                        ...proposal,
                        tasks: proposal.tasks.filter(
                          (candidate) => candidate.clientRef !== task.clientRef,
                        ),
                      });
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {proposal.questions.length === 0 ? null : (
        <details>
          <summary>Open questions ({String(proposal.questions.length)})</summary>
          <ul>
            {proposal.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="button-row">
        <button
          disabled={isExtractionFallback}
          onClick={() => void onDecision(draft, "approve")}
          type="button"
        >
          Approve to Inbox
        </button>
        <button className="danger" onClick={() => void onDecision(draft, "decline")} type="button">
          Decline to Trash
        </button>
      </div>
      {editingTask === null ? null : (
        <DraftTaskDialog
          task={editingTask}
          proposal={proposal}
          projects={projects}
          workspaceTasks={workspaceTasks}
          onClose={() => {
            setEditingTaskRef(null);
          }}
          onChange={(task) => {
            updateProposal({
              ...proposal,
              tasks: proposal.tasks.map((candidate) =>
                candidate.clientRef === task.clientRef ? task : candidate,
              ),
            });
          }}
        />
      )}
    </article>
  );
};

export const IntakePanel = () => {
  const [content, setContent] = useState("");
  const [createNewProjects, setCreateNewProjects] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [failedRuns, setFailedRuns] = useState<FailedRun[]>([]);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("instruction");
  const [workspaceTasks, setWorkspaceTasks] = useState<ExistingTaskOption[]>([]);

  const refresh = async () => {
    const value = await call<IntakeResponse>("/api/intake", "GET");
    setDrafts(value.drafts.map(normalizeDraft));
    setFailedRuns(value.failedRuns);
    setProjects(value.projects ?? []);
    setStages(value.stages ?? []);
    setWorkspaceTasks(value.tasks ?? []);
  };
  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Unable to load intake drafts.");
    });
    const refreshTimer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 10_000);
    return () => {
      window.clearInterval(refreshTimer);
    };
  }, []);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await call<{ duplicateOfSourceId: string | null }>("/api/intake", "POST", {
        content,
        ...(createNewProjects ? { createNewProjects: true } : {}),
        ...(selectedProjectIds.length === 0 ? {} : { selectedProjectIds }),
        sourceType,
      });
      setContent("");
      setMessage(
        result.duplicateOfSourceId === null
          ? "Queued for extraction. Large transcripts are processed in sections and may take a few minutes."
          : "Queued for extraction. A matching earlier intake source was found; proposals will remain separate for review. Large transcripts may take a few minutes.",
      );
      window.setTimeout(() => {
        void refresh().catch(() => undefined);
      }, 2_500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to queue intake.");
    } finally {
      setSubmitting(false);
    }
  };
  const updateLocal = (updated: Draft) => {
    setDrafts((current) => current.map((draft) => (draft.id === updated.id ? updated : draft)));
  };
  const decide = async (draft: Draft, action: "approve" | "decline") => {
    try {
      if (action === "approve") await call(`/api/intake/${draft.id}`, "PUT", draft.proposal);
      await call(`/api/intake/${draft.id}/${action}`, "POST");
      await refresh();
      setMessage(
        action === "approve"
          ? "Approved tasks were added to Inbox."
          : "Draft moved to Trash for 30 days.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update draft.");
    }
  };
  const restore = async (id: string) => {
    try {
      await call(`/api/intake/${id}/restore`, "POST");
      await refresh();
      setMessage("Draft restored for review.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to restore draft.");
    }
  };
  const retry = async (id: string) => {
    try {
      await call(`/api/intake/runs/${id}/retry`, "POST");
      await refresh();
      setMessage("Extraction queued for retry.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to retry extraction.");
    }
  };
  const retryFallback = async (id: string) => {
    try {
      await call(`/api/intake/${id}/retry`, "POST");
      await refresh();
      setMessage("The retained source was queued for a full extraction retry.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to retry extraction.");
    }
  };
  const reviewDrafts = drafts.filter((draft) => draft.status === "review_required");
  const trashedDrafts = drafts.filter((draft) => draft.status === "trashed");
  const approvedDrafts = drafts.filter((draft) => draft.status === "approved");
  const history = approvedDrafts.find((draft) => draft.id === historyId) ?? null;

  return (
    <section aria-labelledby="intake-heading" className="workspace-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI-assisted, owner-approved</p>
          <h2 id="intake-heading">Intake</h2>
        </div>
        <button
          className="secondary"
          onClick={() => {
            void refresh()
              .then(() => {
                setMessage("Intake status refreshed.");
              })
              .catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : "Unable to refresh intake.");
              });
          }}
          type="button"
        >
          Refresh status
        </button>
      </div>
      <form className="compact-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="intake-source-type">Source type</label>
        <select
          id="intake-source-type"
          value={sourceType}
          onChange={(event) => {
            setSourceType(event.target.value as SourceType);
          }}
        >
          {Object.entries(sourceTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label>Related projects</label>
        <ProjectPicker
          excludedIds={selectedProjectIds}
          projects={projects}
          stages={stages}
          onAdd={(projectId) => {
            setSelectedProjectIds((current) => [...current, projectId]);
          }}
        />
        <div className="tag-list">
          {selectedProjectIds.map((id) => (
            <button
              className="tag"
              key={id}
              onClick={() => {
                setSelectedProjectIds((current) => current.filter((projectId) => projectId !== id));
              }}
              type="button"
            >
              {projects.find((project) => project.id === id)?.name ?? id} ×
            </button>
          ))}
        </div>
        <label className="checkbox-label">
          <input
            checked={createNewProjects}
            onChange={(event) => {
              setCreateNewProjects(event.target.checked);
            }}
            type="checkbox"
          />{" "}
          Create new projects when the source requires them
        </label>
        <label htmlFor="intake-content">Paste the source text</label>
        <textarea
          id="intake-content"
          maxLength={100000}
          required
          rows={8}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
          }}
        />
        <button disabled={submitting || content.trim().length === 0} type="submit">
          {submitting ? "Queuing…" : "Queue extraction"}
        </button>
      </form>
      <p aria-live="polite" className="form-message">
        {message}
      </p>
      <h3>Review required</h3>
      {reviewDrafts.length === 0 ? <p className="muted">No drafts await review.</p> : null}
      {reviewDrafts.map((draft) => (
        <ReviewBoard
          draft={draft}
          key={draft.id}
          onChange={updateLocal}
          onDecision={decide}
          onRetry={retryFallback}
          projects={projects}
          stages={stages}
          workspaceTasks={workspaceTasks}
        />
      ))}
      {failedRuns.length === 0 ? null : (
        <section>
          <h3>Failed extraction</h3>
          {failedRuns.map((run) => (
            <article className="task-card" key={run.id}>
              <p>
                {sourceTypeLabels[run.sourceType]}: {run.safeError}
              </p>
              <button onClick={() => void retry(run.id)} type="button">
                Retry extraction
              </button>
            </article>
          ))}
        </section>
      )}
      {trashedDrafts.length === 0 ? null : (
        <section>
          <h3>Trash</h3>
          {trashedDrafts.map((draft) => (
            <article className="task-card" key={draft.id}>
              <p>{draft.proposal.summary}</p>
              <p className="muted">
                {draft.purgeAfter === null
                  ? "Retention deadline unavailable."
                  : `Scheduled for purge after ${new Date(draft.purgeAfter).toLocaleDateString()}.`}
              </p>
              <button onClick={() => void restore(draft.id)} type="button">
                Restore for review
              </button>
            </article>
          ))}
        </section>
      )}
      {approvedDrafts.length === 0 ? null : (
        <details>
          <summary>Approved intake history ({approvedDrafts.length})</summary>
          <ul className="approval-history">
            {approvedDrafts.map((draft) => (
              <li key={draft.id}>
                <button
                  className="link-button"
                  onClick={() => {
                    setHistoryId(draft.id);
                  }}
                  type="button"
                >
                  {draft.proposal.summary || "Approved intake"}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {history === null ? null : (
        <div className="entity-modal-backdrop" role="presentation">
          <section
            aria-label="Approved intake details"
            aria-modal="true"
            className="entity-modal standalone-entity-modal"
            role="dialog"
          >
            <header className="entity-modal-header">
              <h2>Approved intake</h2>
              <button
                className="secondary"
                onClick={() => {
                  setHistoryId(null);
                }}
                type="button"
              >
                Close
              </button>
            </header>
            <div className="entity-modal-content">
              <h3>Original source</h3>
              <pre className="source-preview">{history.sourceContent}</pre>
              <h3>Reviewed proposal</h3>
              <pre className="source-preview">{JSON.stringify(history.proposal, null, 2)}</pre>
              <h3>Created records</h3>
              <pre className="source-preview">
                {JSON.stringify(history.approvalResult, null, 2)}
              </pre>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};
