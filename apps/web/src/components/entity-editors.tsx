"use client";

import { dependencyMermaid } from "@opsweave/domain/work";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import { GanttChart } from "./gantt-chart";
import { MermaidDiagram } from "./mermaid-diagram";
import { RichTextEditor } from "./rich-text-editor";
import {
  WORKFLOW_LANES,
  WORK_STATUSES,
  workStatusLabel,
  workflowLaneLabel,
  type Project,
  type Task,
  type WorkspaceData,
  type WorkflowLane,
} from "./workspace-types";
import { optionalFormNumber, optionalFormText, workspaceRequest } from "./workspace-api";

const EntityDialog = ({
  audit,
  children,
  label,
  onClose,
}: {
  audit: ReactNode;
  children: ReactNode;
  label: string;
  onClose: () => void;
}) => {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", escape);
    };
  }, [onClose]);
  return (
    <div
      aria-label={label}
      aria-modal="true"
      className="entity-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <div className="entity-modal">
        <div className="entity-modal-grid">
          <div className="entity-modal-main">{children}</div>
          {audit}
        </div>
      </div>
    </div>
  );
};

interface AuditEvent {
  action: string;
  actorName: string | null;
  createdAt: string;
  id: string;
  metadata: unknown;
}

const humanize = (value: string): string =>
  value
    .replaceAll(/([a-z])([A-Z])/gu, "$1 $2")
    .replaceAll(/[._]/gu, " ")
    .replace(/^./u, (character) => character.toUpperCase());

const priorityLevelLabel = (value: number): string =>
  ["Lowest priority", "Low priority", "Medium priority", "High priority", "Highest priority"][
    value - 1
  ] ?? "Not set";

const clientNameValue = (value: FormDataEntryValue | null): string | null => {
  const name = optionalFormText(value);
  return name?.toLocaleLowerCase() === "personal" ? null : name;
};

const AuditPanel = ({
  data,
  entityId,
  entityType,
  version,
}: {
  data: WorkspaceData;
  entityId: string;
  entityType: "project" | "task";
  version: number;
}) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void workspaceRequest(`/api/${entityType}s/${entityId}/audit`, "GET")
      .then((value) => {
        if (active) setEvents(Array.isArray(value) ? (value as AuditEvent[]) : []);
      })
      .catch(() => {
        if (active) setEvents([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entityId, entityType, version]);
  const displayValue = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "Not set";
    if (field === "workflowLane" && typeof value === "string")
      return WORKFLOW_LANES.includes(value as WorkflowLane)
        ? workflowLaneLabel(value as WorkflowLane)
        : value;
    if (field === "projectId" && typeof value === "string")
      return data.projects.find((project) => project.id === value)?.name ?? value;
    if (field === "stageId" && typeof value === "string")
      return data.stages.find((stage) => stage.id === value)?.name ?? value;
    if (field === "blockerId" && typeof value === "string")
      return (
        data.tasks.find((task) => task.id === value)?.title ??
        data.projects.find((project) => project.id === value)?.name ??
        value
      );
    if (Array.isArray(value)) return `${String(value.length)} item${value.length === 1 ? "" : "s"}`;
    if (typeof value === "object") return "Updated";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "bigint") return value.toString();
    return "Updated";
  };
  return (
    <aside aria-label="Record audit log" className="audit-panel">
      <div className="audit-panel-heading">
        <p className="eyebrow">History</p>
        <h3>Audit log</h3>
      </div>
      {loading ? <p className="muted">Loading history…</p> : null}
      {!loading && events.length === 0 ? <p className="muted">No recorded changes yet.</p> : null}
      <ol className="audit-timeline">
        {events.map((event) => {
          const metadata =
            event.metadata !== null && typeof event.metadata === "object"
              ? (event.metadata as Record<string, unknown>)
              : {};
          const changes =
            metadata.changes !== null && typeof metadata.changes === "object"
              ? (metadata.changes as Record<string, { from?: unknown; to?: unknown }>)
              : {};
          const details =
            Object.keys(changes).length > 0
              ? Object.entries(changes).map(([field, change]) => ({
                  field,
                  text: `${displayValue(field, change.from)} → ${displayValue(field, change.to)}`,
                }))
              : Object.entries(metadata)
                  .filter(([field]) => field !== "changes")
                  .map(([field, value]) => ({ field, text: displayValue(field, value) }));
          return (
            <li key={event.id}>
              <strong>{humanize(event.action.replace(`${entityType}.`, ""))}</strong>
              <time dateTime={event.createdAt}>
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(event.createdAt))}
              </time>
              <span className="muted">by {event.actorName ?? "System"}</span>
              {details.length === 0 ? null : (
                <dl>
                  {details.map((detail) => (
                    <div key={detail.field}>
                      <dt>{humanize(detail.field)}</dt>
                      <dd>{detail.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
};

const ModalHeader = ({ onClose, title }: { onClose: () => void; title: string }) => (
  <header className="entity-modal-header">
    <div>
      <p className="eyebrow">Full record</p>
      <h2>{title}</h2>
    </div>
    <button aria-label="Close details" className="secondary" onClick={onClose} type="button">
      Close
    </button>
  </header>
);

const Tabs = ({
  active,
  onChange,
  tabs,
}: {
  active: string;
  onChange: (value: string) => void;
  tabs: readonly [string, string, boolean?][];
}) => (
  <nav aria-label="Record sections" className="entity-tabs">
    {tabs.map(([value, label, required]) => (
      <button
        aria-pressed={active === value}
        className={`${active === value ? "compact" : "secondary compact"}${required === true ? " tab-required" : ""}`}
        key={value}
        onClick={() => {
          onChange(value);
        }}
        type="button"
      >
        {label}
      </button>
    ))}
  </nav>
);

interface AttachmentView {
  byteSize: number;
  createdAt: string;
  id: string;
  originalName: string;
  purgeAfter: string | null;
}

const DocumentsPanel = ({
  entityId,
  entityType,
  setMessage,
}: {
  entityId: string;
  entityType: "project" | "task";
  setMessage: (message: string) => void;
}) => {
  const [attachments, setAttachments] = useState<AttachmentView[]>([]);
  const [uploading, setUploading] = useState(false);
  const load = async () => {
    const response = await fetch(`/api/${entityType}s/${entityId}/attachments`, {
      cache: "no-store",
    });
    const body = (await response.json()) as unknown;
    if (!response.ok) throw new Error("Unable to load documents.");
    setAttachments(Array.isArray(body) ? (body as AttachmentView[]) : []);
  };
  useEffect(() => {
    void load().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Unable to load documents.");
    });
    const refresh = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as { entityId?: unknown; entityType?: unknown };
      if (detail.entityId === entityId && detail.entityType === entityType)
        void load().catch(() => {
          setMessage("Unable to refresh documents.");
        });
    };
    window.addEventListener("opsweave:attachment-created", refresh);
    return () => {
      window.removeEventListener("opsweave:attachment-created", refresh);
    };
  }, [entityId, entityType]);
  return (
    <section className="documents-panel">
      <div className="section-heading compact-heading">
        <div>
          <h3>Documents</h3>
          <p className="muted">
            Files are removed 90 days after this work becomes Done or Cancelled.
          </p>
        </div>
        <label className="upload-button">
          {uploading ? "Uploading…" : "Upload document"}
          <input
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file === undefined) return;
              const form = new FormData();
              form.set("file", file);
              setUploading(true);
              void fetch(`/api/${entityType}s/${entityId}/attachments`, {
                body: form,
                method: "POST",
              })
                .then(async (response) => {
                  const body = (await response.json()) as { message?: string };
                  if (!response.ok) throw new Error(body.message ?? "Unable to upload document.");
                  await load();
                  setMessage("Document uploaded.");
                })
                .catch((error: unknown) => {
                  setMessage(error instanceof Error ? error.message : "Unable to upload document.");
                })
                .finally(() => {
                  setUploading(false);
                  event.target.value = "";
                });
            }}
            type="file"
          />
        </label>
      </div>
      {attachments.length === 0 ? <p className="muted">No documents attached.</p> : null}
      <div className="attachment-list">
        {attachments.map((attachment) => (
          <div className="attachment-row" key={attachment.id}>
            <a href={`/api/attachments/${attachment.id}`}>{attachment.originalName}</a>
            <span>{(attachment.byteSize / 1024).toFixed(1)} KB</span>
            <span>
              {attachment.purgeAfter === null
                ? "Retained while active"
                : `Deletes ${new Date(attachment.purgeAfter).toLocaleDateString()}`}
            </span>
            <button
              className="danger compact"
              onClick={() => {
                if (!window.confirm(`Delete “${attachment.originalName}”?`)) return;
                void workspaceRequest(`/api/attachments/${attachment.id}`, "DELETE")
                  .then(load)
                  .then(() => {
                    setMessage("Document deleted.");
                  })
                  .catch((error: unknown) => {
                    setMessage(
                      error instanceof Error ? error.message : "Unable to delete document.",
                    );
                  });
              }}
              type="button"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

interface TimeEntryView {
  description: string;
  entryDate: string;
  hours: number;
  id: string;
}

const TimesheetsPanel = ({
  onChanged,
  setMessage,
  task,
}: {
  onChanged: () => Promise<void>;
  setMessage: (message: string) => void;
  task: Task;
}) => {
  const [entries, setEntries] = useState<TimeEntryView[]>([]);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);
  const load = async () => {
    const body = await workspaceRequest(`/api/tasks/${task.id}/time-entries`, "GET");
    setEntries(Array.isArray(body) ? body : []);
  };
  useEffect(() => {
    void load().catch(() => {
      setMessage("Unable to load time entries.");
    });
  }, [task.id, task.version]);
  const used = entries.reduce((total, entry) => total + entry.hours, 0);
  const allocated = task.allocatedHours ?? 0;
  return (
    <section className="timesheet-panel">
      <div className="timesheet-summary">
        <span>
          <strong>{allocated}h</strong> allocated
        </span>
        <span>
          <strong>{used}h</strong> used
        </span>
        <span>
          <strong>{Math.max(0, allocated - used)}h</strong> left
        </span>
      </div>
      <div className="timesheet-entry-form">
        <label>
          Date
          <input
            onChange={(event) => {
              setEntryDate(event.target.value);
            }}
            type="date"
            value={entryDate}
          />
        </label>
        <label className="wide-field">
          Description
          <input
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            value={description}
          />
        </label>
        <label>
          Hours
          <input
            min="0.01"
            onChange={(event) => {
              setHours(event.target.value);
            }}
            step="0.25"
            type="number"
            value={hours}
          />
        </label>
        <button
          disabled={
            saving ||
            entryDate.length === 0 ||
            description.trim().length === 0 ||
            Number(hours) <= 0
          }
          onClick={() => {
            setSaving(true);
            void workspaceRequest(`/api/tasks/${task.id}/time-entries`, "POST", {
              description,
              entryDate,
              hours: Number(hours),
            })
              .then(async () => {
                setDescription("");
                setHours("");
                await onChanged();
                await load();
                setMessage("Time entry added.");
              })
              .catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : "Unable to add time entry.");
              })
              .finally(() => {
                setSaving(false);
              });
          }}
          type="button"
        >
          {saving ? "Adding…" : "Add time"}
        </button>
      </div>
      <div className="table-scroll">
        <table className="entity-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Hours</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.entryDate}</td>
                <td>{entry.description}</td>
                <td>{entry.hours}</td>
                <td>
                  <button
                    className="danger compact"
                    onClick={() => {
                      void workspaceRequest(
                        `/api/tasks/${task.id}/time-entries/${entry.id}`,
                        "DELETE",
                      )
                        .then(async () => {
                          await onChanged();
                          await load();
                          setMessage("Time entry deleted.");
                        })
                        .catch((error: unknown) => {
                          setMessage(
                            error instanceof Error ? error.message : "Unable to delete time entry.",
                          );
                        });
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const FocusedDependencyDiagram = ({
  data,
  entityId,
  entityType,
  onOpenEntity,
}: {
  data: WorkspaceData;
  entityId: string;
  entityType: "project" | "task";
  onOpenEntity: (entity: { id: string; type: "project" | "task" }) => void;
}) => {
  const edges = data.entityDependencies.filter(
    (edge) =>
      (edge.dependentType === entityType && edge.dependentId === entityId) ||
      (edge.blockerType === entityType && edge.blockerId === entityId),
  );
  const included = new Set(
    edges.flatMap((edge) => [
      `${edge.blockerType}:${edge.blockerId}`,
      `${edge.dependentType}:${edge.dependentId}`,
    ]),
  );
  included.add(`${entityType}:${entityId}`);
  const tasks = data.tasks.filter((task) => included.has(`task:${task.id}`));
  const projects = data.projects.filter((project) => included.has(`project:${project.id}`));
  const definition = dependencyMermaid(tasks, [], projects, [], edges);
  const entities = [
    ...tasks.map((task, index) => ({
      entityId: task.id,
      entityType: "task" as const,
      mermaidId: `task_${String(index)}`,
    })),
    ...projects.flatMap((project, index) => [
      {
        entityId: project.id,
        entityType: "project" as const,
        mermaidId: `project_${String(index)}`,
      },
      { entityId: project.id, entityType: "project" as const, mermaidId: `group_${String(index)}` },
    ]),
  ];
  return (
    <div className="diagram-panel focused-diagram">
      <p className="muted">
        Direct blockers point toward this record; direct dependents appear after it.
      </p>
      <MermaidDiagram
        definition={definition}
        entities={entities}
        onEntityOpen={({ entityId: id, entityType: type }) => {
          onOpenEntity({ id, type });
        }}
      />
    </div>
  );
};

const DonutMetric = ({
  label,
  progress,
  value,
}: {
  label: string;
  progress: number;
  value: string;
}) => {
  const boundedProgress = Math.max(0, Math.min(100, progress));
  return (
    <div className="donut-metric">
      <span
        className="donut-ring"
        style={{ "--donut-progress": `${String(boundedProgress * 3.6)}deg` } as CSSProperties}
      >
        <strong>{value}</strong>
      </span>
      <span>{label}</span>
    </div>
  );
};

const formatMetricHours = (hours: number): string =>
  Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);

const SpentDonutMetric = ({ allocated, spent }: { allocated: number; spent: number }) => {
  const safeAllocated = Math.max(0, allocated);
  const safeSpent = Math.max(0, spent);
  const overrun = Math.max(0, safeSpent - safeAllocated);
  const isOver = overrun > 0;
  const greenDegrees = isOver
    ? safeSpent === 0
      ? 0
      : (safeAllocated / safeSpent) * 360
    : safeAllocated === 0
      ? 0
      : (safeSpent / safeAllocated) * 360;
  const overrunSeverity =
    safeAllocated === 0 ? 1 : Math.max(0, Math.min(1, overrun / (safeAllocated * 0.5)));
  const overrunColor = `color-mix(in srgb, #ffd166 ${String(Math.round((1 - overrunSeverity) * 100))}%, #ff453a)`;
  const status =
    safeAllocated === 0
      ? safeSpent === 0
        ? "No hours allocated"
        : `${formatMetricHours(safeSpent)}h over`
      : isOver
        ? `${formatMetricHours(overrun)}h over`
        : `${formatMetricHours(safeAllocated - safeSpent)}h left`;
  return (
    <div className="donut-metric spent-donut">
      <span
        className={`donut-ring${isOver ? " is-over" : ""}`}
        style={
          {
            "--donut-overrun-color": overrunColor,
            "--donut-progress": `${String(Math.max(0, Math.min(360, greenDegrees)))}deg`,
          } as CSSProperties
        }
      >
        <strong>
          <span>{formatMetricHours(safeSpent)}h</span>
          <small>/ {formatMetricHours(safeAllocated)}h</small>
        </strong>
      </span>
      <span>spent · {status}</span>
    </div>
  );
};

export const TaskEditor = ({
  data,
  message,
  onChanged,
  onClose,
  onDeleted,
  onOpenEntity,
  setMessage,
  task,
}: {
  data: WorkspaceData;
  message: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
  onDeleted: () => void;
  onOpenEntity: (entity: { id: string; type: "project" | "task" }) => void;
  setMessage: (message: string) => void;
  task: Task;
}) => {
  const [active, setActive] = useState("details");
  const [allocatedHours, setAllocatedHours] = useState(task.allocatedHours);
  const [checklist, setChecklist] = useState(task.checklist);
  const [notes, setNotes] = useState(task.notes);
  const [selectedProjectId, setSelectedProjectId] = useState(task.projectId ?? "");
  const [sizeManualOverride, setSizeManualOverride] = useState(task.sizeManualOverride);
  const [manualSize, setManualSize] = useState(task.size);
  const [saving, setSaving] = useState(false);
  const [splitting, setSplitting] = useState<"subtasks" | "tasks" | null>(null);
  const hoursLeft = Math.max(0, (allocatedHours ?? 0) - (task.hoursSpent ?? 0));
  const automaticSize =
    allocatedHours === null
      ? null
      : hoursLeft <= 0.5
        ? "small"
        : hoursLeft <= 1
          ? "medium"
          : hoursLeft <= 2
            ? "large"
            : "mega";
  const derivedSize = sizeManualOverride ? manualSize : automaticSize;
  const megaMissingSubtasks = derivedSize === "mega" && checklist.length === 0;
  useEffect(() => {
    setChecklist(task.checklist);
    setAllocatedHours(task.allocatedHours);
    setManualSize(task.size);
    setSizeManualOverride(task.sizeManualOverride);
  }, [task.version]);
  const directDependencies = data.entityDependencies.filter(
    (edge) => edge.dependentType === "task" && edge.dependentId === task.id,
  );
  const dependencyIds = new Set(
    directDependencies.map((edge) => `${edge.blockerType}:${edge.blockerId}`),
  );
  const candidates: DependencyCandidate[] = [
    ...data.tasks.flatMap((candidate) =>
      candidate.id === task.id || dependencyIds.has(`task:${candidate.id}`)
        ? []
        : [
            {
              id: candidate.id,
              label: candidate.title,
              pending: !["done", "cancelled"].includes(candidate.workflowLane),
              projectId: candidate.projectId,
              stage: candidate.workflowLane,
              type: "task" as const,
            },
          ],
    ),
    ...data.projects.flatMap((candidate) =>
      candidate.archivedAt !== null || dependencyIds.has(`project:${candidate.id}`)
        ? []
        : [
            {
              id: candidate.id,
              label: candidate.name,
              pending: !/(?:done|complete|cancelled)/iu.test(candidate.stageName ?? ""),
              projectId: candidate.id,
              stage: null,
              type: "project" as const,
            },
          ],
    ),
  ];
  const save = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (derivedSize === "mega" && !checklist.some(({ label }) => label.trim().length > 0)) {
      setActive("checklist");
      setMessage("Add at least one subtask before saving a Mega task.");
      return;
    }
    const values = new FormData(event.currentTarget);
    const score = optionalFormNumber(values.get("businessValueScore"));
    setSaving(true);
    try {
      await workspaceRequest(`/api/tasks/${task.id}`, "PUT", {
        allocatedHours: optionalFormNumber(values.get("allocatedHours")),
        businessValueRationale: optionalFormText(values.get("businessValueRationale")),
        businessValueScore: score,
        checklist: checklist
          .filter(({ label }) => label.trim().length > 0)
          .map(({ completed, description, label, predictedHours }, position) => ({
            completed,
            description:
              description === null || description === undefined || description.trim().length === 0
                ? null
                : description.trim(),
            label: label.trim(),
            position,
            predictedHours: predictedHours ?? null,
          })),
        clientName: clientNameValue(values.get("clientName")),
        definitionOfDone: optionalFormText(values.get("definitionOfDone")),
        dueDate: optionalFormText(values.get("dueDate")),
        endTime: optionalFormText(values.get("endTime")),
        notes,
        origin: optionalFormText(values.get("origin")),
        plannedDate: optionalFormText(values.get("plannedDate")),
        plannedEndTime: optionalFormText(values.get("plannedEndTime")),
        plannedStartTime: optionalFormText(values.get("plannedStartTime")),
        planningEligible: values.get("planningEligible") === "on",
        projectId: optionalFormText(values.get("projectId")),
        priorityLevel: optionalFormNumber(values.get("priorityLevel")),
        scheduleLocked: values.get("scheduleLocked") === "on",
        size: derivedSize,
        sizeManualOverride,
        startDate: optionalFormText(values.get("startDate")),
        startTime: optionalFormText(values.get("startTime")),
        status: values.get("status"),
        title: values.get("title"),
        valueAdd: optionalFormText(values.get("valueAdd")),
        valueSource: score === null ? null : "owner",
        version: task.version,
        workDescription: optionalFormText(values.get("workDescription")),
        workflowLane: values.get("workflowLane"),
      });
      await onChanged();
      setMessage("Task saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save task.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${task.title}”? This removes it from the workspace.`)) return;
    try {
      await workspaceRequest(`/api/tasks/${task.id}`, "DELETE", { version: task.version });
      onDeleted();
      await onChanged();
      setMessage("Task deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete task.");
    }
  };
  const splitMega = async (mode: "subtasks" | "tasks") => {
    if (
      mode === "tasks" &&
      !window.confirm(
        "Split this Mega task into tasks of at most 2 hours? The original is deleted only after every new task is created successfully.",
      )
    )
      return;
    setSplitting(mode);
    try {
      await workspaceRequest(`/api/tasks/${task.id}/split`, "POST", {
        mode,
        version: task.version,
      });
      if (mode === "tasks") onDeleted();
      await onChanged();
      setMessage(
        mode === "tasks"
          ? "Mega task split into verified tasks."
          : "Task subtasks restructured using the available workspace context.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to structure this task.");
    } finally {
      setSplitting(null);
    }
  };
  const addDependency = async (blocker: Pick<DependencyCandidate, "id" | "type">) => {
    try {
      await workspaceRequest(`/api/tasks/${task.id}/blockers`, "POST", {
        blockerId: blocker.id,
        blockerType: blocker.type,
      });
      await onChanged();
      setMessage("Task dependency added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add dependency.");
    }
  };
  const removeDependency = async (blocker: Pick<DependencyCandidate, "id" | "type">) => {
    try {
      await workspaceRequest(
        `/api/tasks/${task.id}/blockers/${blocker.type}/${blocker.id}`,
        "DELETE",
      );
      await onChanged();
      setMessage("Task dependency removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove dependency.");
    }
  };

  return (
    <EntityDialog
      audit={<AuditPanel data={data} entityId={task.id} entityType="task" version={task.version} />}
      label={`Task details: ${task.title}`}
      onClose={onClose}
    >
      <ModalHeader onClose={onClose} title={task.title} />
      <Tabs
        active={active}
        onChange={setActive}
        tabs={[
          ["details", "Details"],
          ["notes", "Notes"],
          ["timesheets", "Timesheets"],
          ["checklist", "Subtasks", megaMissingSubtasks],
          ["dependencies", "Dependencies"],
          ["documents", "Documents"],
        ]}
      />
      <p aria-live="polite" className="form-message entity-message">
        {message}
      </p>
      <form className="entity-form" onSubmit={(event) => void save(event)}>
        <div hidden={active !== "details"}>
          <div className="entity-field-grid">
            <label className="wide-field">
              Task title
              <input defaultValue={task.title} name="title" required />
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
                {data.projects
                  .filter((project) => project.archivedAt === null)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Client
              <input
                defaultValue={task.clientName ?? ""}
                disabled={selectedProjectId !== ""}
                list="task-client-names"
                name="clientName"
                placeholder={
                  selectedProjectId === "" ? "Personal or client name" : "Inherited from project"
                }
              />
              <datalist id="task-client-names">
                <option value="Personal" />
                {(data.clientNames ?? []).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label>
              Kanban stage
              <select defaultValue={task.workflowLane} name="workflowLane">
                {WORKFLOW_LANES.map((lane) => (
                  <option key={lane} value={lane}>
                    {workflowLaneLabel(lane)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input defaultValue={task.startDate ?? ""} name="startDate" type="date" />
            </label>
            <label>
              Start time
              <input defaultValue={task.startTime ?? ""} name="startTime" type="time" />
            </label>
            <label>
              End / due date
              <input defaultValue={task.dueDate ?? ""} name="dueDate" type="date" />
            </label>
            <label>
              End time
              <input defaultValue={task.endTime ?? ""} name="endTime" type="time" />
            </label>
            <label>
              Allocated hours
              <input
                onChange={(event) => {
                  setAllocatedHours(event.target.value === "" ? null : Number(event.target.value));
                }}
                value={allocatedHours ?? ""}
                min="0"
                name="allocatedHours"
                step="0.25"
                type="number"
              />
            </label>
            <label>
              Hours spent
              <input readOnly value={`${String(task.hoursSpent ?? 0)}h (from timesheets)`} />
            </label>
            <label>
              Hours left
              <input readOnly value={`${String(hoursLeft)}h`} />
            </label>
            <label>
              Task size
              <select
                aria-readonly={!sizeManualOverride}
                disabled={!sizeManualOverride}
                onChange={(event) => {
                  setManualSize(event.target.value as Task["size"]);
                }}
                value={derivedSize ?? ""}
              >
                <option value="">Not set</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="mega">Mega</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input
                checked={sizeManualOverride}
                onChange={(event) => {
                  setSizeManualOverride(event.target.checked);
                  if (event.target.checked) setManualSize(automaticSize);
                }}
                type="checkbox"
              />
              Override automatic task size
            </label>
            <label>
              Priority level (1–5)
              <select defaultValue={task.priorityLevel ?? ""} name="priorityLevel">
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
              <select defaultValue={task.status ?? "not_started"} name="status">
                {WORK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {workStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Value score (1–100)
              <input
                defaultValue={task.businessValueScore ?? ""}
                max="100"
                min="1"
                name="businessValueScore"
                type="number"
              />
            </label>
            <label className="wide-field">
              Value rationale
              <textarea
                defaultValue={task.businessValueRationale ?? ""}
                name="businessValueRationale"
              />
            </label>
            <label className="wide-field">
              Value add
              <textarea defaultValue={task.valueAdd ?? ""} name="valueAdd" />
            </label>
            <label className="wide-field">
              Work description
              <textarea defaultValue={task.workDescription ?? ""} name="workDescription" />
            </label>
            <label className="wide-field">
              Definition of done
              <textarea defaultValue={task.definitionOfDone ?? ""} name="definitionOfDone" />
            </label>
            <label className="wide-field">
              Origin
              <textarea
                defaultValue={task.origin ?? ""}
                name="origin"
                placeholder="Where this task came from"
                rows={2}
              />
            </label>
            <label className="checkbox-field">
              <input
                defaultChecked={task.planningEligible}
                name="planningEligible"
                type="checkbox"
              />
              Planning eligible
            </label>
            <label className="checkbox-field">
              <input defaultChecked={task.scheduleLocked} name="scheduleLocked" type="checkbox" />
              Lock this schedule
            </label>
            <label>
              Planned date
              <input defaultValue={task.plannedDate ?? ""} name="plannedDate" type="date" />
            </label>
            <label>
              Planned start time
              <input
                defaultValue={task.plannedStartTime ?? ""}
                name="plannedStartTime"
                type="time"
              />
            </label>
            <label>
              Planned end time
              <input defaultValue={task.plannedEndTime ?? ""} name="plannedEndTime" type="time" />
            </label>
            <label>
              Planning score
              <input readOnly value={task.planningScore ?? "Not scored"} />
            </label>
            <label className="wide-field">
              Planning rationale
              <textarea readOnly value={task.planningRationale ?? "Not planned yet."} />
            </label>
            <p className="wide-field muted">
              {task.lastPlannedAt === null
                ? "Not planned yet."
                : `Last planned by ${task.lastPlannedBy ?? "automation"} at ${new Date(task.lastPlannedAt).toLocaleString()}.`}
            </p>
          </div>
        </div>
        <div hidden={active !== "notes"}>
          <RichTextEditor
            entityId={task.id}
            entityType="task"
            label="Task notes"
            onChange={setNotes}
            value={notes}
          />
        </div>
        <div hidden={active !== "timesheets"}>
          <TimesheetsPanel onChanged={onChanged} setMessage={setMessage} task={task} />
        </div>
        <div hidden={active !== "checklist"}>
          <div className="checklist-editor">
            {megaMissingSubtasks ? (
              <p className="form-message error" role="alert">
                Mega tasks require at least one subtask.
              </p>
            ) : null}
            <div className="table-scroll">
              <table className="entity-table subtask-table">
                <thead>
                  <tr>
                    <th>Checklist</th>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Predicted hours</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {checklist.map((item, index) => (
                    <tr key={item.id || String(index)}>
                      <td>
                        <input
                          aria-label={`Complete subtask ${String(index + 1)}`}
                          checked={item.completed}
                          onChange={(event) => {
                            setChecklist((current) =>
                              current.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? { ...candidate, completed: event.target.checked }
                                  : candidate,
                              ),
                            );
                          }}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Subtask title ${String(index + 1)}`}
                          onChange={(event) => {
                            setChecklist((current) =>
                              current.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? { ...candidate, label: event.target.value }
                                  : candidate,
                              ),
                            );
                          }}
                          value={item.label}
                        />
                      </td>
                      <td>
                        <textarea
                          aria-label={`Subtask description ${String(index + 1)}`}
                          onChange={(event) => {
                            setChecklist((current) =>
                              current.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? { ...candidate, description: event.target.value }
                                  : candidate,
                              ),
                            );
                          }}
                          rows={2}
                          value={item.description ?? ""}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Subtask predicted hours ${String(index + 1)}`}
                          min="0"
                          onChange={(event) => {
                            setChecklist((current) =>
                              current.map((candidate, candidateIndex) =>
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
                            );
                          }}
                          step="0.25"
                          type="number"
                          value={item.predictedHours ?? ""}
                        />
                      </td>
                      <td>
                        <button
                          aria-label={`Remove subtask ${String(index + 1)}`}
                          className="secondary compact"
                          onClick={() => {
                            setChecklist((current) =>
                              current.filter(
                                (_candidate, candidateIndex) => candidateIndex !== index,
                              ),
                            );
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
                    <th colSpan={3}>Total predicted hours</th>
                    <td>
                      {checklist.reduce((total, item) => total + (item.predictedHours ?? 0), 0)}h
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <button
              className="secondary"
              onClick={() => {
                setChecklist((current) => [
                  ...current,
                  {
                    completed: false,
                    description: null,
                    id: `new-${String(Date.now())}`,
                    label: "",
                    position: current.length,
                    predictedHours: null,
                  },
                ]);
              }}
              type="button"
            >
              Add subtask
            </button>
          </div>
        </div>
        <div hidden={active !== "dependencies"}>
          <FocusedDependencyDiagram
            data={data}
            entityId={task.id}
            entityType="task"
            onOpenEntity={onOpenEntity}
          />
          <DependencyPicker
            candidates={candidates}
            current={directDependencies.map((edge) => ({
              id: edge.blockerId,
              label:
                edge.blockerType === "task"
                  ? (data.tasks.find((candidate) => candidate.id === edge.blockerId)?.title ??
                    "Unknown task")
                  : (data.projects.find((candidate) => candidate.id === edge.blockerId)?.name ??
                    "Unknown project"),
              type: edge.blockerType,
            }))}
            dependentProjectId={task.projectId}
            onAdd={addDependency}
            onRemove={removeDependency}
          />
        </div>
        <div hidden={active !== "documents"}>
          <DocumentsPanel entityId={task.id} entityType="task" setMessage={setMessage} />
        </div>
        <footer className="entity-modal-footer">
          <button disabled={saving} type="submit">
            {saving ? "Saving…" : "Save task"}
          </button>
          <button
            disabled={splitting !== null}
            onClick={() => void splitMega("subtasks")}
            type="button"
          >
            {splitting === "subtasks" ? "Structuring…" : "Split task into subtasks"}
          </button>
          {derivedSize === "mega" ? (
            <>
              <button
                disabled={splitting !== null}
                onClick={() => void splitMega("tasks")}
                type="button"
              >
                {splitting === "tasks" ? "Creating tasks…" : "Split into tasks"}
              </button>
            </>
          ) : null}
          <button className="danger footer-delete" onClick={() => void remove()} type="button">
            Delete task
          </button>
        </footer>
      </form>
    </EntityDialog>
  );
};

export const ProjectEditor = ({
  data,
  message,
  onChanged,
  onClose,
  onOpenEntity,
  project,
  setMessage,
}: {
  data: WorkspaceData;
  message: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
  onOpenEntity: (entity: { id: string; type: "project" | "task" }) => void;
  project: Project;
  setMessage: (message: string) => void;
}) => {
  const [active, setActive] = useState("details");
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [notes, setNotes] = useState(project.notes);
  const [saving, setSaving] = useState(false);
  const closeAfterSave = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const metrics = data.projectMetrics[project.id];
  const linkedTasks = data.tasks.filter((task) => task.projectId === project.id);
  const directDependencies = data.entityDependencies.filter(
    (edge) => edge.dependentType === "project" && edge.dependentId === project.id,
  );
  const dependencyIds = new Set(
    directDependencies.map((edge) => `${edge.blockerType}:${edge.blockerId}`),
  );
  const candidates: DependencyCandidate[] = [
    ...data.tasks.flatMap((candidate) =>
      dependencyIds.has(`task:${candidate.id}`)
        ? []
        : [
            {
              id: candidate.id,
              label: candidate.title,
              pending: !["done", "cancelled"].includes(candidate.workflowLane),
              projectId: candidate.projectId,
              stage: candidate.workflowLane,
              type: "task" as const,
            },
          ],
    ),
    ...data.projects.flatMap((candidate) =>
      candidate.id === project.id ||
      candidate.archivedAt !== null ||
      dependencyIds.has(`project:${candidate.id}`)
        ? []
        : [
            {
              id: candidate.id,
              label: candidate.name,
              pending: !/(?:done|complete|cancelled)/iu.test(candidate.stageName ?? ""),
              projectId: candidate.id,
              stage: null,
              type: "project" as const,
            },
          ],
    ),
  ];
  const save = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await workspaceRequest(`/api/projects/${project.id}`, "PUT", {
        archived: false,
        clientName: clientNameValue(values.get("clientName")),
        description: optionalFormText(values.get("description")),
        llmLink: optionalFormText(values.get("llmLink")),
        name: values.get("name"),
        notes,
        priorityLevel: optionalFormNumber(values.get("priorityLevel")),
        stageId: optionalFormText(values.get("stageId")),
        status: values.get("status"),
        version: project.version,
      });
      await onChanged();
      setMessage("Project saved.");
      if (closeAfterSave.current) onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save project.");
    } finally {
      closeAfterSave.current = false;
      setSaving(false);
    }
  };
  const requestClose = () => {
    if (saving) return;
    if (formRef.current?.reportValidity() === false) return;
    closeAfterSave.current = true;
    formRef.current?.requestSubmit();
  };
  const remove = async () => {
    if (
      !window.confirm(
        `Delete “${project.name}”? This archives it so the action remains recoverable.`,
      )
    )
      return;
    try {
      await workspaceRequest(`/api/projects/${project.id}`, "DELETE", { version: project.version });
      onClose();
      await onChanged();
      setMessage("Project deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete project.");
    }
  };
  const addDependency = async (blocker: Pick<DependencyCandidate, "id" | "type">) => {
    try {
      await workspaceRequest(`/api/projects/${project.id}/blockers`, "POST", {
        blockerId: blocker.id,
        blockerType: blocker.type,
      });
      await onChanged();
      setMessage("Project dependency added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add project dependency.");
    }
  };
  const removeDependency = async (blocker: Pick<DependencyCandidate, "id" | "type">) => {
    try {
      await workspaceRequest(
        `/api/projects/${project.id}/blockers/${blocker.type}/${blocker.id}`,
        "DELETE",
      );
      await onChanged();
      setMessage("Project dependency removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove project dependency.");
    }
  };

  return (
    <EntityDialog
      audit={
        <AuditPanel
          data={data}
          entityId={project.id}
          entityType="project"
          version={project.version}
        />
      }
      label={`Project details: ${project.name}`}
      onClose={requestClose}
    >
      <ModalHeader onClose={requestClose} title={project.name} />
      <Tabs
        active={active}
        onChange={setActive}
        tabs={[
          ["details", "Details"],
          ["notes", "Notes"],
          ["tasks", "Tasks"],
          ["gantt", "Gantt"],
          ["dependencies", "Dependencies"],
          ["documents", "Documents"],
        ]}
      />
      <p aria-live="polite" className="form-message entity-message">
        {message}
      </p>
      <form className="entity-form" onSubmit={(event) => void save(event)} ref={formRef}>
        <div hidden={active !== "details"}>
          <div className="project-visual-summary">
            <SpentDonutMetric
              allocated={metrics?.allocatedHours ?? 0}
              spent={metrics?.hoursSpent ?? 0}
            />
            <DonutMetric
              label="complete"
              progress={metrics?.progressPercent ?? 0}
              value={`${String(Math.round(metrics?.progressPercent ?? 0))}%`}
            />
            <div className="project-date-stack">
              <span>
                <small>Start</small>
                <strong>{metrics?.startDate ?? "Not set"}</strong>
              </span>
              <span>
                <small>End</small>
                <strong>{metrics?.endDate ?? "Not set"}</strong>
              </span>
            </div>
          </div>
          <div className="entity-field-grid">
            <label className="wide-field">
              Project title
              <input defaultValue={project.name} name="name" required />
            </label>
            <label>
              Stage
              <select defaultValue={project.stageId ?? ""} name="stageId">
                {data.stages
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
              <select defaultValue={project.priorityLevel ?? ""} name="priorityLevel">
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
              <select defaultValue={project.status ?? "not_started"} name="status">
                {WORK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {workStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Client
              <input
                defaultValue={project.clientName ?? ""}
                list="project-client-names"
                name="clientName"
                placeholder="Personal or client name"
              />
              <datalist id="project-client-names">
                <option value="Personal" />
                {(data.clientNames ?? []).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="wide-field">
              LLM link
              <input defaultValue={project.llmLink ?? ""} name="llmLink" type="url" />
            </label>
            {project.llmLink === null ? null : (
              <a href={project.llmLink} rel="noreferrer" target="_blank">
                Open LLM link in a new window
              </a>
            )}
            <label className="wide-field expandable-details">
              <span>
                Details{" "}
                <button
                  aria-label={detailsExpanded ? "Collapse details" : "Expand details"}
                  className="secondary compact details-toggle"
                  onClick={() => {
                    setDetailsExpanded((expanded) => !expanded);
                  }}
                  type="button"
                >
                  {detailsExpanded ? "⌄" : ">"}
                </button>
              </span>
              <textarea
                className={detailsExpanded ? "details-expanded" : ""}
                defaultValue={project.description ?? ""}
                name="description"
                rows={
                  detailsExpanded
                    ? Math.max(6, (project.description ?? "").split("\n").length + 1)
                    : 6
                }
              />
            </label>
          </div>
        </div>
        <div hidden={active !== "notes"}>
          <RichTextEditor
            entityId={project.id}
            entityType="project"
            label="Project notes"
            onChange={setNotes}
            value={notes}
          />
        </div>
        <div hidden={active !== "tasks"}>
          <div className="table-scroll">
            {linkedTasks.length === 0 ? <p className="muted">No linked tasks.</p> : null}
            {linkedTasks.length === 0 ? null : (
              <table className="entity-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Stage</th>
                    <th>Hours used</th>
                    <th>Value score</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedTasks.map((task) => (
                    <tr
                      className="clickable-row"
                      key={task.id}
                      onClick={() => {
                        onOpenEntity({ id: task.id, type: "task" });
                      }}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ")
                          onOpenEntity({ id: task.id, type: "task" });
                      }}
                    >
                      <th>{task.title}</th>
                      <td>{workflowLaneLabel(task.workflowLane)}</td>
                      <td>{task.hoursSpent ?? 0}h</td>
                      <td>{task.businessValueScore ?? "—"}</td>
                      <td>{task.priorityLevel ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div hidden={active !== "gantt"}>
          <GanttChart
            initialMode="tasks"
            onChanged={onChanged}
            onOpenEntity={onOpenEntity}
            projectId={project.id}
            projectMetrics={data.projectMetrics}
            projects={data.projects}
            showModeSwitch={false}
            tasks={data.tasks}
            workingDays={data.workingDays ?? []}
          />
        </div>
        <div hidden={active !== "dependencies"}>
          <FocusedDependencyDiagram
            data={data}
            entityId={project.id}
            entityType="project"
            onOpenEntity={onOpenEntity}
          />
          <DependencyPicker
            candidates={candidates}
            current={directDependencies.map((edge) => ({
              id: edge.blockerId,
              label:
                edge.blockerType === "project"
                  ? (data.projects.find((candidate) => candidate.id === edge.blockerId)?.name ??
                    "Unknown project")
                  : (data.tasks.find((candidate) => candidate.id === edge.blockerId)?.title ??
                    "Unknown task"),
              type: edge.blockerType,
            }))}
            dependentProjectId={project.id}
            onAdd={addDependency}
            onRemove={removeDependency}
          />
        </div>
        <div hidden={active !== "documents"}>
          <DocumentsPanel entityId={project.id} entityType="project" setMessage={setMessage} />
        </div>
        <footer className="entity-modal-footer">
          <button disabled={saving} type="submit">
            {saving ? "Saving…" : "Save project"}
          </button>
          <button className="danger footer-delete" onClick={() => void remove()} type="button">
            Delete project
          </button>
        </footer>
      </form>
    </EntityDialog>
  );
};

interface DependencyCandidate {
  id: string;
  label: string;
  pending: boolean;
  projectId: string | null;
  stage: WorkflowLane | null;
  type: "project" | "task";
}

const DependencyPicker = ({
  candidates,
  current,
  dependentProjectId,
  onAdd,
  onRemove,
}: {
  candidates: DependencyCandidate[];
  current: { id: string; label: string; type: "project" | "task" }[];
  dependentProjectId: string | null;
  onAdd: (blocker: Pick<DependencyCandidate, "id" | "type">) => Promise<void>;
  onRemove: (blocker: Pick<DependencyCandidate, "id" | "type">) => Promise<void>;
}) => {
  const listId = useId();
  const [input, setInput] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [sameProjectOnly, setSameProjectOnly] = useState(false);
  const [stages, setStages] = useState<WorkflowLane[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | "project" | "task">("all");
  const candidateValue = (candidate: DependencyCandidate): string =>
    `${candidate.type === "task" ? "Task" : "Project"} · ${candidate.label}${candidate.stage === null ? "" : ` · ${workflowLaneLabel(candidate.stage)}`}`;
  const filtered = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          (typeFilter === "all" || candidate.type === typeFilter) &&
          (!pendingOnly || candidate.pending) &&
          (!sameProjectOnly ||
            (candidate.type === "task"
              ? candidate.projectId === dependentProjectId
              : candidate.id === dependentProjectId)) &&
          (candidate.type === "project" ||
            stages.length === 0 ||
            (candidate.stage !== null && stages.includes(candidate.stage))),
      ),
    [candidates, dependentProjectId, pendingOnly, sameProjectOnly, stages, typeFilter],
  );
  const selected = filtered.find((candidate) => candidateValue(candidate) === input);
  return (
    <section className="dependency-editor">
      <h3>Blocked by</h3>
      {current.length === 0 ? <p className="muted">No direct blockers.</p> : null}
      <div className="dependency-chips">
        {current.map((item) => (
          <span className="dependency-chip" key={`${item.type}:${item.id}`}>
            <small>{item.type}</small> {item.label}
            <button
              aria-label={`Remove ${item.label}`}
              className="secondary compact"
              onClick={() => void onRemove(item)}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <fieldset className="dependency-filters">
        <legend>Available blocker filters</legend>
        <label>
          <input
            checked={sameProjectOnly}
            onChange={(event) => {
              setSameProjectOnly(event.target.checked);
              setInput("");
            }}
            type="checkbox"
          />
          Same project only
        </label>
        <label>
          <input
            checked={pendingOnly}
            onChange={(event) => {
              setPendingOnly(event.target.checked);
              setInput("");
            }}
            type="checkbox"
          />
          Pending only
        </label>
        <label className="dependency-type-filter">
          Blocker type
          <select
            onChange={(event) => {
              setTypeFilter(event.target.value as "all" | "project" | "task");
              setInput("");
            }}
            value={typeFilter}
          >
            <option value="all">All types</option>
            <option value="task">Tasks only</option>
            <option value="project">Projects only</option>
          </select>
        </label>
      </fieldset>
      <fieldset className="dependency-stage-filters">
        <legend>Task stages</legend>
        {WORKFLOW_LANES.map((lane) => (
          <label key={lane}>
            <input
              checked={stages.includes(lane)}
              onChange={(event) => {
                setStages((currentStages) =>
                  event.target.checked
                    ? [...currentStages, lane]
                    : currentStages.filter((stage) => stage !== lane),
                );
                setInput("");
              }}
              type="checkbox"
            />
            {workflowLaneLabel(lane)}
          </label>
        ))}
      </fieldset>
      <div className="dependency-picker">
        <label>
          Add blocker
          <input
            aria-autocomplete="list"
            aria-controls={listId}
            list={listId}
            onChange={(event) => {
              setInput(event.target.value);
            }}
            placeholder="Start typing a task or project"
            role="combobox"
            type="text"
            value={input}
          />
        </label>
        <datalist id={listId}>
          {filtered.map((candidate) => (
            <option key={`${candidate.type}:${candidate.id}`} value={candidateValue(candidate)} />
          ))}
        </datalist>
        <button
          disabled={selected === undefined}
          onClick={() => {
            if (selected !== undefined)
              void onAdd(selected).then(() => {
                setInput("");
              });
          }}
          type="button"
        >
          Add dependency
        </button>
      </div>
      <p className="muted">
        {String(filtered.length)} available blocker{filtered.length === 1 ? "" : "s"}{" "}
        {filtered.length === 1 ? "matches" : "match"} these filters.
      </p>
    </section>
  );
};
