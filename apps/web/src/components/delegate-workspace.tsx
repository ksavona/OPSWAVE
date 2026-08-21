"use client";

import { useEffect, useMemo, useState, type SyntheticEvent } from "react";

import { workspaceRequest } from "./workspace-api";
import { DelayedTooltip } from "./delayed-tooltip";

interface Stage {
  archivedAt: string | null;
  color: string;
  id: string;
  name: string;
  semanticKind: string;
  sequence: number;
  version: number;
}

interface DelegateTask {
  accessRole: string;
  alias: string | null;
  allocatedHours: number | null;
  definitionOfDone: string | null;
  delegationNote: string | null;
  dueDate: string | null;
  hoursSpent: number;
  id: string;
  latestUpdate: string | null;
  notes: unknown;
  projectLabel: string | null;
  stageId: string;
  stateVersion: number;
  title: string;
  workDescription: string | null;
}

interface DelegateProject {
  accessRole: string;
  alias: string | null;
  delegationNote: string | null;
  description: string | null;
  id: string;
  name: string;
  notes: unknown;
}

const noteText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(noteText).filter(Boolean).join("\n");
  if (value === null || typeof value !== "object") return "";
  const node = value as { content?: unknown; text?: unknown; type?: unknown };
  if (typeof node.text === "string") return node.text;
  const content = noteText(node.content);
  return ["heading", "paragraph"].includes(String(node.type)) && content.length > 0
    ? `${content}\n`
    : content;
};

const formText = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value : "";

export const DelegateWorkspace = ({
  initial,
}: {
  initial: { projects?: DelegateProject[]; stages: Stage[]; tasks: DelegateTask[] };
}) => {
  const [projects, setProjects] = useState(initial.projects ?? []);
  const [stages, setStages] = useState(initial.stages);
  const [tasks, setTasks] = useState(initial.tasks);
  const [message, setMessage] = useState("");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const activeStages = useMemo(
    () =>
      stages.filter((stage) => stage.archivedAt === null).sort((a, b) => a.sequence - b.sequence),
    [stages],
  );

  const refresh = async () => {
    const response = await workspaceRequest("/api/delegate/workspace", "GET");
    setProjects(Array.isArray(response.projects) ? (response.projects as DelegateProject[]) : []);
    setStages(Array.isArray(response.stages) ? (response.stages as Stage[]) : []);
    setTasks(Array.isArray(response.tasks) ? (response.tasks as DelegateTask[]) : []);
  };

  const move = async (task: DelegateTask, stageId: string) => {
    setBusyTaskId(task.id);
    setMessage("");
    try {
      await workspaceRequest(`/api/delegate/tasks/${task.id}/state`, "PATCH", {
        latestUpdate: task.latestUpdate,
        stageId,
        version: task.stateVersion,
      });
      await refresh();
      setMessage(
        activeStages.find((stage) => stage.id === stageId)?.semanticKind === "ready_for_review"
          ? "The owner was notified that this task is ready for review."
          : "Your private task stage was updated.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The task stage could not be updated.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const updateLatest = async (task: DelegateTask, latestUpdate: string) => {
    setBusyTaskId(task.id);
    try {
      await workspaceRequest(`/api/delegate/tasks/${task.id}/state`, "PATCH", {
        latestUpdate,
        stageId: task.stageId,
        version: task.stateVersion,
      });
      await refresh();
      setMessage("Progress update saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The update could not be saved.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const addStage = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await workspaceRequest("/api/delegate/stages", "POST", {
        color: data.get("color"),
        name: data.get("name"),
      });
      event.currentTarget.reset();
      await refresh();
      setMessage("Private stage added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The stage could not be added.");
    }
  };

  return (
    <section className="delegate-board-shell" aria-labelledby="delegate-board-heading">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Your private workflow</p>
          <h2 id="delegate-board-heading">Delegated work</h2>
          <p>Your stage changes never overwrite the owner’s Kanban stage.</p>
        </div>
        <form className="inline-stage-form" onSubmit={(event) => void addStage(event)}>
          <label>
            New private stage
            <input maxLength={100} name="name" required />
          </label>
          <input aria-label="Stage colour" defaultValue="#5ee5b5" name="color" type="color" />
          <button className="secondary" type="submit">
            Add stage
          </button>
        </form>
      </div>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      {projects.length > 0 ? (
        <section className="delegate-projects" aria-labelledby="delegate-projects-heading">
          <h3 id="delegate-projects-heading">Shared projects</h3>
          <div className="delegate-project-grid">
            {projects.map((project) => (
              <article className="delegate-card" key={project.id}>
                <p className="eyebrow">{project.accessRole.replaceAll("_", " ")}</p>
                <h4>{project.name}</h4>
                {project.description === null ? null : <p>{project.description}</p>}
                {project.delegationNote === null ? null : (
                  <p>
                    <strong>Owner instruction:</strong> {project.delegationNote}
                  </p>
                )}
                <button
                  className="secondary compact"
                  onClick={() => {
                    setExpandedProjectId((current) => (current === project.id ? null : project.id));
                  }}
                  type="button"
                >
                  {expandedProjectId === project.id
                    ? "Close project collaboration"
                    : "Open project collaboration"}
                </button>
                {expandedProjectId === project.id ? (
                  <DelegateSubjectDetails
                    notes={project.notes}
                    subjectId={project.id}
                    subjectType="project"
                  />
                ) : null}
                {project.accessRole === "project_collaborator" ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const data = new FormData(form);
                      void workspaceRequest(`/api/delegate/projects/${project.id}/tasks`, "POST", {
                        allocatedHours:
                          formText(data.get("allocatedHours")).length === 0
                            ? null
                            : Number(data.get("allocatedHours")),
                        definitionOfDone: formText(data.get("definitionOfDone")).trim() || null,
                        description: formText(data.get("description")).trim() || null,
                        title: data.get("title"),
                      })
                        .then(async () => {
                          form.reset();
                          await refresh();
                          setMessage("Task created in the shared project.");
                        })
                        .catch((error: unknown) => {
                          setMessage(
                            error instanceof Error ? error.message : "Unable to create the task.",
                          );
                        });
                    }}
                  >
                    <h5>Create project task</h5>
                    <input aria-label="Task title" name="title" placeholder="Task title" required />
                    <textarea
                      aria-label="Task description"
                      name="description"
                      placeholder="Description"
                      rows={2}
                    />
                    <input
                      aria-label="Allocated hours"
                      min="0"
                      name="allocatedHours"
                      placeholder="Hours"
                      step="0.25"
                      type="number"
                    />
                    <textarea
                      aria-label="Definition of done"
                      name="definitionOfDone"
                      placeholder="Definition of done"
                      rows={2}
                    />
                    <button className="secondary compact" type="submit">
                      Create task
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <div className="delegate-board">
        {activeStages.map((stage) => (
          <section
            className="delegate-column"
            key={stage.id}
            style={{ borderTopColor: stage.color }}
          >
            <header>
              <h3>{stage.name}</h3>
              <span>{tasks.filter((task) => task.stageId === stage.id).length}</span>
            </header>
            <div className="delegate-card-list">
              {tasks
                .filter((task) => task.stageId === stage.id)
                .map((task) => (
                  <article className="delegate-card" key={task.id}>
                    {task.projectLabel !== null ? (
                      <p className="eyebrow">{task.projectLabel}</p>
                    ) : null}
                    <h4>{task.title}</h4>
                    <div className="delegate-card-meta">
                      <span>{task.accessRole.replaceAll("_", " ")}</span>
                      <span>
                        {task.hoursSpent}h / {task.allocatedHours ?? "—"}h
                      </span>
                      {task.dueDate !== null ? <span>Due {task.dueDate}</span> : null}
                    </div>
                    {task.workDescription !== null ? <p>{task.workDescription}</p> : null}
                    {task.delegationNote !== null ? (
                      <p>
                        <strong>Owner instruction:</strong> {task.delegationNote}
                      </p>
                    ) : null}
                    <label>
                      Your stage
                      <select
                        disabled={busyTaskId === task.id}
                        onChange={(event) => void move(task, event.target.value)}
                        value={task.stageId}
                      >
                        {activeStages
                          .filter(
                            (candidate) =>
                              task.accessRole !== "reviewer" ||
                              candidate.id === task.stageId ||
                              ["complete", "custom", "waiting_for_input"].includes(
                                candidate.semanticKind,
                              ),
                          )
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void updateLatest(task, formText(data.get("latestUpdate")).trim());
                      }}
                    >
                      <label>
                        Latest update
                        <textarea
                          defaultValue={task.latestUpdate ?? ""}
                          maxLength={2000}
                          name="latestUpdate"
                          rows={3}
                        />
                      </label>
                      <button
                        className="secondary compact"
                        disabled={busyTaskId === task.id}
                        type="submit"
                      >
                        Save update
                      </button>
                    </form>
                    <button
                      className="secondary compact"
                      onClick={() => {
                        setExpandedTaskId((current) => (current === task.id ? null : task.id));
                      }}
                      type="button"
                    >
                      {expandedTaskId === task.id ? "Close work details" : "Open work details"}
                    </button>
                    {expandedTaskId === task.id ? (
                      <DelegateSubjectDetails
                        canEditSubtasks={task.accessRole !== "reviewer"}
                        notes={task.notes}
                        subjectId={task.id}
                        subjectType="task"
                      />
                    ) : null}
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
      {tasks.length === 0 ? (
        <div className="empty-state">
          <h3>No delegated tasks yet</h3>
          <p>Accepted shared work will appear here.</p>
        </div>
      ) : null}
    </section>
  );
};

interface DelegateTimeEntry {
  actorDisplay: string;
  canEdit: boolean;
  description: string;
  entryDate: string;
  hours: number;
  id: string;
  version: number;
}

interface DelegateDocument {
  byteSize: number;
  displayName: string;
  id: string;
}

interface DelegateActivity {
  actorDisplay: string | null;
  body: string | null;
  contentStatus: string | null;
  createdAt: string;
  id: string;
  kind: string | null;
  action: string;
}

interface DelegateParticipant {
  displayName: string;
  profileDescription: string | null;
  userId: string;
}

interface DelegateSubtask {
  canEdit: boolean;
  completed: boolean;
  description: string | null;
  id: string;
  label: string;
  position: number;
  predictedHours: number | null;
  version: number;
}

const DelegateSubjectDetails = ({
  canEditSubtasks = false,
  notes,
  subjectId,
  subjectType,
}: {
  canEditSubtasks?: boolean;
  notes: unknown;
  subjectId: string;
  subjectType: "project" | "task";
}) => {
  const [entries, setEntries] = useState<DelegateTimeEntry[]>([]);
  const [documents, setDocuments] = useState<DelegateDocument[]>([]);
  const [uploadAllowed, setUploadAllowed] = useState(false);
  const [activity, setActivity] = useState<DelegateActivity[]>([]);
  const [participants, setParticipants] = useState<DelegateParticipant[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [subtasks, setSubtasks] = useState<DelegateSubtask[]>([]);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"activity" | "documents" | "notes" | "subtasks" | "timesheets">(
    "activity",
  );

  const load = async () => {
    const [timesheets, files, chatter, participantResponse] = await Promise.all([
      workspaceRequest(`/api/timesheets/${subjectType}/${subjectId}`, "GET"),
      workspaceRequest(`/api/collaboration-documents/${subjectType}/${subjectId}`, "GET"),
      workspaceRequest(
        `/api/activity?subjectType=${subjectType}&subjectId=${encodeURIComponent(subjectId)}`,
        "GET",
      ),
      workspaceRequest(
        `/api/activity/participants?subjectType=${subjectType}&subjectId=${encodeURIComponent(subjectId)}`,
        "GET",
      ),
    ]);
    setEntries(
      Array.isArray(timesheets.entries) ? (timesheets.entries as DelegateTimeEntry[]) : [],
    );
    setDocuments(Array.isArray(files.attachments) ? (files.attachments as DelegateDocument[]) : []);
    setUploadAllowed(files.uploadAllowed === true);
    setActivity(Array.isArray(chatter.events) ? (chatter.events as DelegateActivity[]) : []);
    setParticipants(
      Array.isArray(participantResponse.participants)
        ? (participantResponse.participants as DelegateParticipant[])
        : [],
    );
    if (subjectType === "task") {
      const subtaskResponse = await workspaceRequest(
        `/api/delegate/tasks/${subjectId}/subtasks`,
        "GET",
      );
      setSubtasks(
        Array.isArray(subtaskResponse.subtasks)
          ? (subtaskResponse.subtasks as DelegateSubtask[])
          : [],
      );
    }
  };

  useEffect(() => {
    void load().catch(() => {
      setMessage("Some shared details could not be loaded.");
    });
  }, [subjectId, subjectType]);

  return (
    <section className="delegate-task-details">
      <nav aria-label="Shared task details" className="button-row">
        {(subjectType === "task"
          ? (["activity", "notes", "subtasks", "timesheets", "documents"] as const)
          : (["activity", "notes", "timesheets", "documents"] as const)
        ).map((candidate) => (
          <button
            className={tab === candidate ? "compact" : "secondary compact"}
            key={candidate}
            onClick={() => {
              setTab(candidate);
            }}
            type="button"
          >
            {candidate[0]?.toUpperCase()}
            {candidate.slice(1)}
          </button>
        ))}
      </nav>
      <p aria-live="polite" className="form-message">
        {message}
      </p>
      {tab === "notes" ? (
        <div className="delegate-notes">
          <p>{noteText(notes).trim() || "No delegate-visible notes."}</p>
        </div>
      ) : null}
      {tab === "activity" ? (
        <div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const activityKind = data.get("kind");
              void workspaceRequest("/api/activity", "POST", {
                body: data.get("body"),
                kind: activityKind,
                mentionedUserIds: activityKind === "message" ? selectedUserIds : [],
                notifyUserIds: activityKind === "log_note" ? selectedUserIds : [],
                subjectId,
                subjectType,
              })
                .then(async () => {
                  form.reset();
                  setSelectedUserIds([]);
                  await load();
                  setMessage("Activity recorded.");
                })
                .catch((error: unknown) => {
                  setMessage(error instanceof Error ? error.message : "Unable to post activity.");
                });
            }}
          >
            <select aria-label="Activity type" defaultValue="message" name="kind">
              <option value="message">Message</option>
              <option value="log_note">Log note</option>
            </select>
            <textarea
              maxLength={20_000}
              name="body"
              placeholder="Message authorised participants…"
              required
              rows={3}
            />
            {participants.length > 0 ? (
              <fieldset className="activity-participants">
                <legend>Mention or notify specific participants</legend>
                {participants.map((participant) => (
                  <label key={participant.userId}>
                    <input
                      checked={selectedUserIds.includes(participant.userId)}
                      onChange={(event) => {
                        setSelectedUserIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, participant.userId])]
                            : current.filter((userId) => userId !== participant.userId),
                        );
                      }}
                      type="checkbox"
                    />
                    {participant.profileDescription === null ? (
                      `@${participant.displayName}`
                    ) : (
                      <DelayedTooltip
                        content={participant.profileDescription}
                        label={participant.displayName}
                      >
                        <span>@{participant.displayName}</span>
                      </DelayedTooltip>
                    )}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <button className="secondary compact" type="submit">
              Post
            </button>
          </form>
          <ol className="delegate-activity-list">
            {activity.map((event) => (
              <li key={event.id}>
                <strong>
                  {event.kind?.replaceAll("_", " ") ?? event.action.replaceAll(".", " ")}
                </strong>
                <span>
                  {event.actorDisplay ?? "System"} · {new Date(event.createdAt).toLocaleString()}
                </span>
                {event.body === null ? null : <p>{event.body}</p>}
                {event.contentStatus === "quarantined" ? (
                  <em>Private — awaiting owner review</em>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {tab === "timesheets" ? (
        <div>
          <form
            className="delegate-timesheet-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void workspaceRequest(`/api/timesheets/${subjectType}/${subjectId}`, "POST", {
                description: data.get("description"),
                entryDate: data.get("entryDate"),
                hours: Number(data.get("hours")),
              })
                .then(async () => {
                  form.reset();
                  await load();
                  setMessage("Time recorded.");
                })
                .catch((error: unknown) => {
                  setMessage(error instanceof Error ? error.message : "Unable to record time.");
                });
            }}
          >
            <input
              aria-label="Date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              name="entryDate"
              required
              type="date"
            />
            <input
              aria-label="Description"
              name="description"
              placeholder="Work completed"
              required
            />
            <input
              aria-label="Hours"
              max="24"
              min="0.01"
              name="hours"
              required
              step="0.25"
              type="number"
            />
            <button className="secondary compact" type="submit">
              Add time
            </button>
          </form>
          <div className="delegate-time-entry-list">
            {entries.map((entry) =>
              entry.canEdit ? (
                <form
                  className="delegate-timesheet-form"
                  key={entry.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void workspaceRequest(
                      `/api/timesheets/${subjectType}/${subjectId}/${entry.id}`,
                      "PATCH",
                      {
                        description: data.get("description"),
                        entryDate: data.get("entryDate"),
                        hours: Number(data.get("hours")),
                        version: entry.version,
                      },
                    )
                      .then(async () => {
                        await load();
                        setMessage("Time entry updated.");
                      })
                      .catch((error: unknown) => {
                        setMessage(
                          error instanceof Error ? error.message : "Unable to update time.",
                        );
                      });
                  }}
                >
                  <input
                    aria-label="Entry date"
                    defaultValue={entry.entryDate}
                    name="entryDate"
                    required
                    type="date"
                  />
                  <input
                    aria-label="Entry description"
                    defaultValue={entry.description}
                    name="description"
                    required
                  />
                  <input
                    aria-label="Entry hours"
                    defaultValue={entry.hours}
                    max="24"
                    min="0.01"
                    name="hours"
                    required
                    step="0.25"
                    type="number"
                  />
                  <button className="secondary compact" type="submit">
                    Save
                  </button>
                  <button
                    className="danger compact"
                    onClick={() =>
                      void workspaceRequest(
                        `/api/timesheets/${subjectType}/${subjectId}/${entry.id}`,
                        "DELETE",
                      )
                        .then(load)
                        .catch((error: unknown) => {
                          setMessage(
                            error instanceof Error ? error.message : "Unable to delete time.",
                          );
                        })
                    }
                    type="button"
                  >
                    Delete
                  </button>
                </form>
              ) : (
                <p key={entry.id}>
                  {entry.entryDate} · {entry.description} · {entry.hours}h · {entry.actorDisplay}
                </p>
              ),
            )}
          </div>
        </div>
      ) : null}
      {tab === "subtasks" && subjectType === "task" ? (
        <div className="delegate-subtasks">
          {canEditSubtasks ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                void workspaceRequest(`/api/delegate/tasks/${subjectId}/subtasks`, "POST", {
                  description: formText(data.get("description")).trim() || null,
                  label: data.get("label"),
                  predictedHours:
                    formText(data.get("predictedHours")).length === 0
                      ? null
                      : Number(data.get("predictedHours")),
                })
                  .then(async () => {
                    form.reset();
                    await load();
                    setMessage("Subtask added.");
                  })
                  .catch((error: unknown) => {
                    setMessage(
                      error instanceof Error ? error.message : "Unable to add the subtask.",
                    );
                  });
              }}
            >
              <input
                aria-label="New subtask title"
                maxLength={500}
                name="label"
                placeholder="Subtask title"
                required
              />
              <textarea
                aria-label="New subtask description"
                maxLength={5_000}
                name="description"
                placeholder="Description"
                rows={2}
              />
              <input
                aria-label="New subtask predicted hours"
                min="0"
                name="predictedHours"
                placeholder="Hours"
                step="0.25"
                type="number"
              />
              <button className="secondary compact" type="submit">
                Add subtask
              </button>
            </form>
          ) : null}
          <div className="delegate-subtask-list">
            {subtasks.map((subtask) =>
              subtask.canEdit ? (
                <form
                  key={subtask.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void workspaceRequest(
                      `/api/delegate/tasks/${subjectId}/subtasks/${subtask.id}`,
                      "PATCH",
                      {
                        completed: data.get("completed") === "on",
                        description: formText(data.get("description")).trim() || null,
                        label: data.get("label"),
                        predictedHours:
                          formText(data.get("predictedHours")).length === 0
                            ? null
                            : Number(data.get("predictedHours")),
                        version: subtask.version,
                      },
                    )
                      .then(async () => {
                        await load();
                        setMessage("Subtask updated.");
                      })
                      .catch((error: unknown) => {
                        setMessage(
                          error instanceof Error ? error.message : "Unable to update the subtask.",
                        );
                      });
                  }}
                >
                  <input
                    aria-label={`Complete ${subtask.label}`}
                    defaultChecked={subtask.completed}
                    name="completed"
                    type="checkbox"
                  />
                  <input
                    aria-label="Subtask title"
                    defaultValue={subtask.label}
                    name="label"
                    required
                  />
                  <textarea
                    aria-label="Subtask description"
                    defaultValue={subtask.description ?? ""}
                    name="description"
                    rows={2}
                  />
                  <input
                    aria-label="Predicted hours"
                    defaultValue={subtask.predictedHours ?? ""}
                    min="0"
                    name="predictedHours"
                    step="0.25"
                    type="number"
                  />
                  <div className="button-row">
                    <button className="secondary compact" type="submit">
                      Save
                    </button>
                    <button
                      className="danger compact"
                      onClick={() => {
                        if (!window.confirm(`Delete “${subtask.label}”?`)) return;
                        void workspaceRequest(
                          `/api/delegate/tasks/${subjectId}/subtasks/${subtask.id}`,
                          "DELETE",
                        )
                          .then(async () => {
                            await load();
                            setMessage("Subtask deleted.");
                          })
                          .catch((error: unknown) => {
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : "Unable to delete the subtask.",
                            );
                          });
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </form>
              ) : (
                <article key={subtask.id}>
                  <strong>
                    {subtask.completed ? "✓ " : ""}
                    {subtask.label}
                  </strong>
                  {subtask.description === null ? null : <p>{subtask.description}</p>}
                  <span>{subtask.predictedHours ?? "—"}h predicted · owner managed</span>
                </article>
              ),
            )}
            {subtasks.length === 0 ? <p className="muted">No delegate-visible subtasks.</p> : null}
          </div>
        </div>
      ) : null}
      {tab === "documents" ? (
        <div>
          {uploadAllowed ? (
            <label className="upload-button">
              Upload shared document
              <input
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file === undefined) return;
                  const form = new FormData();
                  form.set("file", file);
                  form.set("visibility", "shared_all_delegates");
                  void fetch(`/api/collaboration-documents/${subjectType}/${subjectId}`, {
                    body: form,
                    method: "POST",
                  })
                    .then(async (response) => {
                      const result = (await response.json()) as { message?: string };
                      if (!response.ok) throw new Error(result.message ?? "Upload failed.");
                      await load();
                      setMessage("Document uploaded.");
                    })
                    .catch((error: unknown) => {
                      setMessage(
                        error instanceof Error ? error.message : "Unable to upload document.",
                      );
                    });
                }}
                type="file"
              />
            </label>
          ) : (
            <p className="muted">Document uploads are not enabled for this workspace.</p>
          )}
          <ul>
            {documents.map((document) => (
              <li key={document.id}>
                <a href={`/api/collaboration-documents/file/${document.id}`}>
                  {document.displayName}
                </a>{" "}
                · {(document.byteSize / 1024).toFixed(1)} KB
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
