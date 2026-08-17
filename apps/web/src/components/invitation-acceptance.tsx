"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";

interface InvitationSummary {
  accessRole: string;
  accountExists: boolean;
  expiresAt: string | null;
  invitationExpiresAt: string;
  subjectTitle: string;
  subjectType: "project" | "task";
  workspaceDisplayName: string;
}

const request = async (url: string, payload: unknown) => {
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof result.message === "string" ? result.message : "The request failed.");
  }
  return result;
};

export const InvitationAcceptance = () => {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<InvitationSummary | null>(null);
  const [message, setMessage] = useState("Checking the invitation…");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/u, ""));
    const fragmentToken = fragment.get("token") ?? window.sessionStorage.getItem("opsweave-invite");
    window.history.replaceState(null, "", window.location.pathname);
    if (fragmentToken === null) {
      setMessage("The invitation link is missing or invalid.");
      setBusy(false);
      return;
    }
    window.sessionStorage.setItem("opsweave-invite", fragmentToken);
    setToken(fragmentToken);
    void request("/api/invitations/exchange", { token: fragmentToken })
      .then((result) => {
        setSummary(result as unknown as InvitationSummary);
        setMessage("");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "The invitation is unavailable.");
      })
      .finally(() => {
        setBusy(false);
      });
  }, []);

  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (token === null || summary === null) return;
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      if (summary.accountExists) {
        await request("/api/auth/login", {
          password: data.get("password"),
          username: data.get("login"),
        });
        await request("/api/invitations/accept", { token });
      } else {
        await request("/api/invitations/accept", {
          fullName: data.get("fullName"),
          password: data.get("password"),
          passwordConfirmation: data.get("passwordConfirmation"),
          token,
        });
      }
      window.sessionStorage.removeItem("opsweave-invite");
      router.replace("/delegated");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be accepted.");
      setBusy(false);
    }
  };

  const decline = async () => {
    if (token === null || !window.confirm("Decline this access invitation?")) return;
    setBusy(true);
    setMessage("");
    try {
      await request("/api/invitations/decline", { token });
      window.sessionStorage.removeItem("opsweave-invite");
      setSummary(null);
      setToken(null);
      setMessage("The invitation was declined and its link is no longer valid.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be declined.");
    } finally {
      setBusy(false);
    }
  };

  if (summary === null) {
    return (
      <section className="auth-card invitation-card">
        <p className="eyebrow">Secure invitation</p>
        <h1>{busy ? "Checking access" : "Invitation unavailable"}</h1>
        <p role="status">{message}</p>
      </section>
    );
  }

  return (
    <section className="auth-card invitation-card">
      <p className="eyebrow">Secure invitation</p>
      <h1>Join {summary.workspaceDisplayName}</h1>
      <div className="invitation-summary">
        <span className="scope-badge">{summary.subjectType}</span>
        <h2>{summary.subjectTitle}</h2>
        <p>
          Role: {summary.accessRole.replaceAll("_", " ")}. Invitation expires{" "}
          {summary.invitationExpiresAt.slice(0, 10)}.
        </p>
      </div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {summary.accountExists ? (
          <label>
            Invited account email or username
            <input autoComplete="username" name="login" required />
          </label>
        ) : (
          <label>
            Your name
            <input autoComplete="name" maxLength={200} name="fullName" required />
          </label>
        )}
        <label>
          Password
          <input
            autoComplete={summary.accountExists ? "current-password" : "new-password"}
            minLength={12}
            name="password"
            required
            type="password"
          />
        </label>
        {!summary.accountExists ? (
          <label>
            Confirm password
            <input
              autoComplete="new-password"
              minLength={12}
              name="passwordConfirmation"
              required
              type="password"
            />
          </label>
        ) : null}
        {message ? (
          <p className="form-message error" role="alert">
            {message}
          </p>
        ) : null}
        <button disabled={busy} type="submit">
          {busy ? "Activating…" : "Accept secure access"}
        </button>
        <button className="secondary" disabled={busy} onClick={() => void decline()} type="button">
          Decline invitation
        </button>
      </form>
    </section>
  );
};
