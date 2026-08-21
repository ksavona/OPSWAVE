"use client";

import { useEffect, useState } from "react";

import type { WorkspaceData, WorkflowLane } from "./workspace-types";
import { WORKFLOW_LANES, workflowLaneLabel } from "./workspace-types";
import { workspaceRequest } from "./workspace-api";
import { DelayedTooltip } from "./delayed-tooltip";

interface ActivityEventView {
  action: string;
  actorDisplay: string | null;
  body: string | null;
  category: string;
  contentStatus: "approved" | "quarantined" | "rejected" | null;
  createdAt: string;
  id: string;
  kind: "message" | "log_note" | null;
  metadata: unknown;
  userGenerated: boolean;
}

interface ParticipantView {
  alias: string | null;
  displayName: string;
  profileDescription: string | null;
  userId: string;
}

const humanize = (value: string): string =>
  value
    .replaceAll(/([a-z])([A-Z])/gu, "$1 $2")
    .replaceAll(/[._]/gu, " ")
    .replace(/^./u, (character) => character.toUpperCase());

export const ActivityTimeline = ({
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
  const [events, setEvents] = useState<ActivityEventView[]>([]);
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"message" | "log_note">("message");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [userGenerated, setUserGenerated] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = async () => {
    const parameters = new URLSearchParams({ subjectId: entityId, subjectType: entityType });
    if (category.length > 0) parameters.set("category", category);
    if (query.trim().length > 0) parameters.set("q", query.trim());
    if (userGenerated.length > 0) parameters.set("userGenerated", userGenerated);
    if (actorUserId.length > 0) parameters.set("userId", actorUserId);
    if (dateFrom.length > 0) parameters.set("dateFrom", dateFrom);
    if (dateTo.length > 0) parameters.set("dateTo", dateTo);
    const [activity, participantResponse] = await Promise.all([
      workspaceRequest(`/api/activity?${parameters.toString()}`, "GET"),
      workspaceRequest(
        `/api/activity/participants?subjectId=${encodeURIComponent(entityId)}&subjectType=${entityType}`,
        "GET",
      ),
    ]);
    setEvents(Array.isArray(activity.events) ? (activity.events as ActivityEventView[]) : []);
    setParticipants(
      Array.isArray(participantResponse.participants)
        ? (participantResponse.participants as ParticipantView[])
        : [],
    );
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch(() => {
        if (active) setMessage("Unable to load activity.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    actorUserId,
    category,
    dateFrom,
    dateTo,
    entityId,
    entityType,
    query,
    userGenerated,
    version,
  ]);

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
    if (Array.isArray(value)) return `${String(value.length)} item${value.length === 1 ? "" : "s"}`;
    if (typeof value === "object") return "Updated";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return typeof value === "string" || typeof value === "number" ? String(value) : "Updated";
  };

  return (
    <aside aria-label="Chatter and activity timeline" className="audit-panel activity-panel">
      <div className="audit-panel-heading">
        <p className="eyebrow">Shared history</p>
        <h3>Chatter / Activity</h3>
      </div>
      <div className="activity-compose">
        <div className="button-row">
          <button
            className={kind === "message" ? "compact" : "secondary compact"}
            onClick={() => {
              setKind("message");
            }}
            type="button"
          >
            Message
          </button>
          <button
            className={kind === "log_note" ? "compact" : "secondary compact"}
            onClick={() => {
              setKind("log_note");
            }}
            type="button"
          >
            Log note
          </button>
        </div>
        <label>
          {kind === "message" ? "Shared message" : "Operational note"}
          <textarea
            maxLength={20_000}
            onChange={(event) => {
              setBody(event.target.value);
            }}
            placeholder={
              kind === "message"
                ? "Write a message. With no mentions, all authorised participants are notified."
                : "Record an immutable note. Select people only if they should be notified."
            }
            rows={4}
            value={body}
          />
        </label>
        {participants.length > 0 ? (
          <fieldset className="activity-participants">
            <legend>{kind === "message" ? "Mention" : "Notify (optional)"}</legend>
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
                    if (
                      event.target.checked &&
                      kind === "message" &&
                      !body.includes(`@${participant.displayName}`)
                    ) {
                      setBody(
                        (current) =>
                          `${current}${current.endsWith(" ") || current.length === 0 ? "" : " "}@${participant.displayName} `,
                      );
                    }
                  }}
                  type="checkbox"
                />
                {participant.profileDescription === null ? (
                  participant.displayName
                ) : (
                  <DelayedTooltip
                    content={participant.profileDescription}
                    label={participant.displayName}
                  >
                    <span>{participant.displayName}</span>
                  </DelayedTooltip>
                )}
              </label>
            ))}
          </fieldset>
        ) : null}
        <button
          disabled={saving || body.trim().length === 0}
          onClick={() => {
            setSaving(true);
            setMessage("");
            void workspaceRequest("/api/activity", "POST", {
              body,
              kind,
              mentionedUserIds: kind === "message" ? selectedUserIds : [],
              notifyUserIds: kind === "log_note" ? selectedUserIds : [],
              subjectId: entityId,
              subjectType: entityType,
            })
              .then(async () => {
                setBody("");
                setSelectedUserIds([]);
                await load();
                setMessage("Activity recorded.");
              })
              .catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : "Unable to record activity.");
              })
              .finally(() => {
                setSaving(false);
              });
          }}
          type="button"
        >
          {saving ? "Posting…" : kind === "message" ? "Post message" : "Add log note"}
        </button>
      </div>
      <div className="activity-filters">
        <label>
          Type
          <select
            onChange={(event) => {
              setCategory(event.target.value);
            }}
            value={category}
          >
            <option value="">All activity</option>
            <option value="message">Messages</option>
            <option value="log_note">Log notes</option>
            <option value="timesheet">Timesheets</option>
            <option value="delegation">Delegation</option>
            <option value="status">Status / Kanban</option>
            <option value="document">Documents</option>
            <option value="compliance">Compliance</option>
          </select>
        </label>
        <label>
          Source
          <select
            onChange={(event) => {
              setUserGenerated(event.target.value);
            }}
            value={userGenerated}
          >
            <option value="">People and system</option>
            <option value="true">User-generated</option>
            <option value="false">Automatic logs</option>
          </select>
        </label>
        <label>
          User or alias
          <select
            onChange={(event) => {
              setActorUserId(event.target.value);
            }}
            value={actorUserId}
          >
            <option value="">Everyone</option>
            {participants.map((participant) => (
              <option key={participant.userId} value={participant.userId}>
                {participant.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            onChange={(event) => {
              setDateFrom(event.target.value);
            }}
            type="date"
            value={dateFrom}
          />
        </label>
        <label>
          To
          <input
            onChange={(event) => {
              setDateTo(event.target.value);
            }}
            type="date"
            value={dateTo}
          />
        </label>
        <label>
          Search
          <input
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            value={query}
          />
        </label>
      </div>
      <p aria-live="polite" className="form-message">
        {message}
      </p>
      {loading ? <p className="muted">Loading activity…</p> : null}
      {!loading && events.length === 0 ? <p className="muted">No matching activity yet.</p> : null}
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
                  .filter(([field]) => field !== "changes" && field !== "quarantined")
                  .map(([field, value]) => ({ field, text: displayValue(field, value) }));
          return (
            <li key={event.id}>
              <strong>{event.kind === null ? humanize(event.action) : humanize(event.kind)}</strong>
              <time dateTime={event.createdAt}>
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(event.createdAt))}
              </time>
              <span className="muted">by {event.actorDisplay ?? "System"}</span>
              {event.contentStatus === "quarantined" ? (
                <span className="activity-warning">Private — awaiting owner review</span>
              ) : null}
              {event.body === null ? null : <p className="activity-body">{event.body}</p>}
              {event.kind !== null || details.length === 0 ? null : (
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
