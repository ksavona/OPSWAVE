"use client";

import { useState, type SyntheticEvent } from "react";

import type { Stage } from "./workspace-types";

const request = async (url: string, method: string, payload?: unknown) => {
  const response = await fetch(url, {
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    headers: { "content-type": "application/json" },
    method,
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(typeof result.message === "string" ? result.message : "The request failed.");
  return result;
};

const optional = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

export const ProjectStageSettings = ({ initial }: { initial: Stage[] }) => {
  const [stages, setStages] = useState(initial);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const refresh = async () => {
    const workspace = (await request("/api/workspace", "GET")) as unknown as { stages: Stage[] };
    setStages(workspace.stages);
  };
  const create = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await request("/api/project-stages", "POST", {
        description: optional(values.get("description")),
        llmContext: optional(values.get("llmContext")),
        name: values.get("name"),
        sequence: Number(values.get("sequence")),
      });
      form.reset();
      setAdding(false);
      setMessage("Stage created.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create stage.");
    }
  };
  return (
    <section aria-labelledby="project-stage-settings-heading">
      <div className="section-heading">
        <div>
          <h2 id="project-stage-settings-heading">Project configuration</h2>
          <p>
            Configure the stages used by the project Kanban and provide context for AI matching.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setAdding((value) => !value);
          }}
          type="button"
        >
          {adding ? "Close" : "Add stage"}
        </button>
      </div>
      {adding ? (
        <form className="compact-form" onSubmit={(event) => void create(event)}>
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
          <StageEditor key={stage.id} onChanged={refresh} setMessage={setMessage} stage={stage} />
        ))}
      </div>
      <p aria-live="polite" className="form-message">
        {message}
      </p>
    </section>
  );
};

const StageEditor = ({
  onChanged,
  setMessage,
  stage,
}: {
  onChanged: () => Promise<void>;
  setMessage: (message: string) => void;
  stage: Stage;
}) => {
  const [editing, setEditing] = useState(false);
  const save = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await request(`/api/project-stages/${stage.id}`, "PUT", {
        description: optional(values.get("description")),
        llmContext: optional(values.get("llmContext")),
        name: values.get("name"),
        sequence: Number(values.get("sequence")),
        version: stage.version,
      });
      setEditing(false);
      setMessage("Stage saved.");
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save stage.");
    }
  };
  const archive = async () => {
    try {
      await request(`/api/project-stages/${stage.id}`, "DELETE");
      setMessage("Stage archived.");
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to archive stage.");
    }
  };
  if (editing)
    return (
      <form className="stage-settings-card" onSubmit={(event) => void save(event)}>
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
    <article className="stage-settings-card">
      <strong>{stage.name}</strong>
      <span className="muted">
        {stage.archivedAt === null ? `Sequence ${String(stage.sequence)}` : "Archived"}
      </span>
      {stage.description === null ? null : <span>{stage.description}</span>}
      {stage.archivedAt === null ? (
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
      ) : null}
    </article>
  );
};
