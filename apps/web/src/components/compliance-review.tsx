"use client";

import { useState } from "react";

import { workspaceRequest } from "./workspace-api";

interface FlagView {
  categories: string[];
  createdAt: string;
  delegateAlias: string | null;
  id: string;
  reason: string;
  riskLevel: string;
  status: string;
  subjectTitle: string;
  subjectType: string | null;
}

export const ComplianceReview = ({ initial }: { initial: FlagView[] }) => {
  const [flags, setFlags] = useState(initial);
  const [message, setMessage] = useState("");
  const refresh = async () => {
    const response = await workspaceRequest("/api/compliance", "GET");
    setFlags(Array.isArray(response.flags) ? (response.flags as FlagView[]) : []);
  };
  const review = async (id: string, action: "dismiss" | "restrict" | "revoke" | "warn") => {
    if (
      (action === "restrict" || action === "revoke") &&
      !window.confirm(
        `${action === "revoke" ? "Revoke access" : "Restrict to reviewer access"} now?`,
      )
    )
      return;
    try {
      await workspaceRequest(`/api/compliance/${id}`, "PATCH", { action });
      await refresh();
      setMessage(`Flag ${action === "dismiss" ? "dismissed" : `${action} action recorded`}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to review the flag.");
    }
  };
  return (
    <section className="settings-card">
      <p className="eyebrow">Private owner review</p>
      <h2>Compliance flags</h2>
      <p>
        Flags are triage signals, not accusations. No model result changes access automatically.
      </p>
      <p aria-live="polite" className="form-message">
        {message}
      </p>
      <div className="table-scroll">
        <table className="delegation-table">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Work</th>
              <th>Alias</th>
              <th>Reason</th>
              <th>Category</th>
              <th>Date</th>
              <th>Status / actions</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => (
              <tr key={flag.id}>
                <td>{flag.riskLevel}</td>
                <td>
                  {flag.subjectType ?? "work"}: {flag.subjectTitle}
                </td>
                <td>{flag.delegateAlias ?? "Participant"}</td>
                <td>{flag.reason}</td>
                <td>{flag.categories.join(", ") || "Review"}</td>
                <td>{new Date(flag.createdAt).toLocaleString()}</td>
                <td>
                  {flag.status === "open" ? (
                    <div className="table-actions">
                      <button
                        className="secondary compact"
                        onClick={() => void review(flag.id, "dismiss")}
                        type="button"
                      >
                        Dismiss
                      </button>
                      <button
                        className="secondary compact"
                        onClick={() => void review(flag.id, "warn")}
                        type="button"
                      >
                        Warn
                      </button>
                      <button
                        className="secondary compact"
                        onClick={() => void review(flag.id, "restrict")}
                        type="button"
                      >
                        Restrict
                      </button>
                      <button
                        className="danger compact"
                        onClick={() => void review(flag.id, "revoke")}
                        type="button"
                      >
                        Revoke access
                      </button>
                    </div>
                  ) : (
                    flag.status
                  )}
                </td>
              </tr>
            ))}
            {flags.length === 0 ? (
              <tr>
                <td colSpan={7}>No compliance flags.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
};
