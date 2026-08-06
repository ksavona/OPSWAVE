"use client";

import { useEffect, useState, type SyntheticEvent } from "react";

interface Draft {
  id: string;
  proposal: {
    questions: string[];
    summary: string;
    tasks: { confidence: number; sourceSpan: string | null; title: string }[];
  };
  sourceType: string;
  status: string;
}

const call = async (url: string, method: string, payload?: unknown) => {
  const response = await fetch(url, {
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    headers: { "content-type": "application/json" },
    method,
  });
  const value = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(value.message ?? "The intake request failed.");
};

export const IntakePanel = () => {
  const [content, setContent] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [message, setMessage] = useState("");
  const refresh = async () => {
    const response = await fetch("/api/intake", { cache: "no-store" });
    if (response.ok) setDrafts((await response.json()) as Draft[]);
  };
  useEffect(() => {
    void refresh();
  }, []);
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await call("/api/intake", "POST", { content, sourceType: "instruction" });
      setContent("");
      setMessage("Queued for extraction. Refresh shortly to review the proposed tasks.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to queue intake.");
    }
  };
  const decide = async (id: string, action: "approve" | "decline") => {
    try {
      await call(`/api/intake/${id}/${action}`, "POST");
      await refresh();
      setMessage(action === "approve" ? "Approved tasks were added to Inbox." : "Draft declined.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update draft.");
    }
  };
  return (
    <section aria-labelledby="intake-heading" className="workspace-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI-assisted, owner-approved</p>
          <h2 id="intake-heading">Intake</h2>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label htmlFor="intake-content">Paste an instruction, meeting note, or transcript</label>
        <textarea
          id="intake-content"
          maxLength={100000}
          onChange={(event) => {
            setContent(event.target.value);
          }}
          required
          rows={5}
          value={content}
        />
        <button type="submit">Queue extraction</button>
      </form>
      <p aria-live="polite" className="form-message">
        {message}
      </p>
      {drafts
        .filter((draft) => draft.status === "review_required")
        .map((draft) => (
          <article key={draft.id} className="task-card">
            <p className="eyebrow">{draft.sourceType.replaceAll("_", " ")} · Review required</p>
            <p>{draft.proposal.summary}</p>
            <ul>
              {draft.proposal.tasks.map((task) => (
                <li key={`${draft.id}-${task.title}`}>
                  <strong>{task.title}</strong> — confidence {Math.round(task.confidence * 100)}%
                  {task.sourceSpan === null ? "" : ` · source: ${task.sourceSpan}`}
                </li>
              ))}
            </ul>
            <button onClick={() => void decide(draft.id, "approve")} type="button">
              Approve to Inbox
            </button>
            <button onClick={() => void decide(draft.id, "decline")} type="button">
              Decline
            </button>
          </article>
        ))}
    </section>
  );
};
