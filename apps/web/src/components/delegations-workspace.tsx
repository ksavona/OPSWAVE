"use client";

import { useMemo, useState, type SyntheticEvent } from "react";

import { workspaceRequest } from "./workspace-api";
import { DelayedTooltip, HelpTip } from "./delayed-tooltip";

interface Grant {
  accessRole: "contributor" | "project_collaborator" | "reviewer";
  activatedAt: string | null;
  alias: string | null;
  createdAt: string;
  delegateEmail: string;
  delegateFullName: string | null;
  delegateUserId: string | null;
  delegationNote: string | null;
  privacyKeywords: string[];
  profileDescription: string | null;
  expiresAt: string | null;
  id: string;
  invitedAt: string;
  projectName: string | null;
  scope: "project" | "task";
  status: "active" | "declined" | "expired" | "invite_pending" | "revoked";
  subjectId: string;
  subjectTitle: string;
  subjectType: "project" | "task";
  taskTitle: string | null;
  version: number;
}

interface UserRecord {
  activeGrantCount: number;
  createdAt: string;
  email: string | null;
  fullName: string | null;
  membershipId: string;
  membershipStatus: string;
  role: "admin" | "delegate" | "owner";
  userId: string;
  userStatus: string;
  username: string | null;
}

interface Subject {
  id: string;
  label: string;
  type: "project" | "task";
}

interface Presentation {
  neutralClientLabel: string | null;
  neutralProjectLabel: string | null;
  safeDefinitionOfDone: string | null;
  safeDescription: string | null;
  safeNotes: unknown;
  safeTitle: string;
  safeWorkDescription: string | null;
  sourceVersion: number;
  status: "approved" | "blocked" | "draft" | "stale";
  subjectId: string;
  subjectType: "project" | "task";
  version: number;
}

const dateValue = (value: string | null): string => (value === null ? "—" : value.slice(0, 10));
const formText = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value : "";
const privacyKeywordValues = (value: FormDataEntryValue | null): string[] => [
  ...new Set(
    formText(value)
      .split(/[\n,]/u)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
  ),
];

export const DelegationsWorkspace = ({
  initialGrants,
  initialUsers,
  subjects,
}: {
  initialGrants: Grant[];
  initialUsers: UserRecord[];
  subjects: Subject[];
}) => {
  const [grants, setGrants] = useState(initialGrants);
  const [users, setUsers] = useState(initialUsers);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [scope, setScope] = useState<"project" | "task">("task");
  const [selectedGrantId, setSelectedGrantId] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [grantEdits, setGrantEdits] = useState<
    Record<string, { accessRole: Grant["accessRole"]; expiresAt: string }>
  >({});

  const visibleSubjects = useMemo(
    () => subjects.filter((subject) => subject.type === scope),
    [scope, subjects],
  );

  const refresh = async () => {
    const [grantResponse, userResponse] = await Promise.all([
      workspaceRequest("/api/delegations", "GET"),
      workspaceRequest("/api/users", "GET"),
    ]);
    setGrants(Array.isArray(grantResponse.grants) ? (grantResponse.grants as Grant[]) : []);
    setUsers(Array.isArray(userResponse.users) ? (userResponse.users as UserRecord[]) : []);
  };

  const create = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setInviteLink(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await workspaceRequest("/api/delegations", "POST", {
        accessRole: data.get("accessRole"),
        anonymise: data.get("anonymise") === "on",
        delegateEmail: data.get("delegateEmail"),
        delegationNote: formText(data.get("delegationNote")).trim() || null,
        privacyKeywords: privacyKeywordValues(data.get("privacyKeywords")),
        profileDescription: formText(data.get("profileDescription")).trim() || null,
        expiresAt:
          formText(data.get("expiresAt")).length === 0
            ? null
            : new Date(formText(data.get("expiresAt"))).toISOString(),
        subjectId: data.get("subjectId"),
        subjectType: scope,
      });
      const link = typeof response.invitationUrl === "string" ? response.invitationUrl : null;
      setInviteLink(link);
      setMessage(
        response.delivery === "queued"
          ? "Invitation created and queued for email delivery."
          : "Invitation created. Email delivery is disabled, so copy the secure link below.",
      );
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grantId: string) => {
    if (!window.confirm("Revoke this access immediately? The delegate's sessions will end."))
      return;
    setBusy(true);
    try {
      await workspaceRequest(`/api/delegations/${grantId}`, "DELETE");
      setMessage("Access revoked immediately.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Access could not be revoked.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async (grantId: string) => {
    setBusy(true);
    try {
      const response = await workspaceRequest(`/api/delegations/${grantId}/resend`, "POST", {});
      setInviteLink(typeof response.invitationUrl === "string" ? response.invitationUrl : null);
      setMessage("The previous invitation link was invalidated and a new link was created.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be resent.");
    } finally {
      setBusy(false);
    }
  };

  const saveGrant = async (grant: Grant) => {
    const edit = grantEdits[grant.id] ?? {
      accessRole: grant.accessRole,
      expiresAt: grant.expiresAt?.slice(0, 16) ?? "",
    };
    setBusy(true);
    try {
      await workspaceRequest(`/api/delegations/${grant.id}`, "PATCH", {
        accessRole: edit.accessRole,
        expiresAt: edit.expiresAt.length === 0 ? null : new Date(edit.expiresAt).toISOString(),
        version: grant.version,
      });
      setGrantEdits((current) => {
        return Object.fromEntries(
          Object.entries(current).filter(([grantId]) => grantId !== grant.id),
        );
      });
      await refresh();
      setMessage("Delegation role and expiry updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The delegation could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const changeDelegate = async (grant: Grant) => {
    const delegateEmail = window.prompt(
      "Enter the replacement delegate's email address. The current access will be revoked immediately.",
    );
    if (delegateEmail === null || delegateEmail.trim().length === 0) return;
    if (
      !window.confirm(
        `Replace ${grant.delegateFullName ?? grant.delegateEmail} with ${delegateEmail.trim()}?`,
      )
    )
      return;
    setBusy(true);
    setInviteLink(null);
    try {
      const response = await workspaceRequest(`/api/delegations/${grant.id}`, "PATCH", {
        delegateEmail: delegateEmail.trim(),
        version: grant.version,
      });
      setInviteLink(typeof response.invitationUrl === "string" ? response.invitationUrl : null);
      setMessage(
        response.delivery === "queued"
          ? "The previous access was revoked and the replacement invitation was queued."
          : "The previous access was revoked. Copy the replacement invitation link below.",
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The delegate could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  const changeProfile = async (grant: Grant) => {
    const profileDescription = window.prompt(
      "Description shown to authorised participants after they hover over this delegate:",
      grant.profileDescription ?? "",
    );
    if (profileDescription === null) return;
    const privacyKeywords = window.prompt(
      "Private contact details to redact (one per line or comma separated):",
      grant.privacyKeywords.join("\n"),
    );
    if (privacyKeywords === null) return;
    setBusy(true);
    try {
      await workspaceRequest(`/api/delegations/${grant.id}`, "PATCH", {
        privacyKeywords: privacyKeywordValues(privacyKeywords),
        profileDescription: profileDescription.trim() || null,
        version: grant.version,
      });
      await refresh();
      setMessage("Delegate profile and private redaction terms updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The delegate profile could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  };

  const changeLifecycle = async (userId: string, action: "archive" | "deactivate") => {
    if (!window.confirm(`${action === "archive" ? "Archive" : "Deactivate"} this user now?`))
      return;
    setBusy(true);
    try {
      await workspaceRequest(`/api/users/${userId}/lifecycle`, "PATCH", { action });
      setMessage(action === "archive" ? "User archived." : "User deactivated.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The user could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (user: UserRecord) => {
    const role = user.role === "admin" ? "delegate" : "admin";
    if (!window.confirm(`Change this user's workspace role to ${role}? Their sessions will end.`))
      return;
    setBusy(true);
    try {
      await workspaceRequest(`/api/users/${user.userId}/lifecycle`, "PATCH", {
        action: "set_role",
        role,
      });
      setMessage(`User role changed to ${role}.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The user role could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  const loadPresentation = async (grant: Grant) => {
    setSelectedGrantId(grant.id);
    try {
      const query = new URLSearchParams({
        subjectId: grant.subjectId,
        subjectType: grant.subjectType,
      });
      const response = await workspaceRequest(`/api/delegations/presentation?${query}`, "GET");
      setPresentation((response.presentation as Presentation | null) ?? null);
      if (response.presentation === null) {
        setMessage("Anonymisation is not enabled for this item.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The safe presentation could not load.");
    }
  };

  const savePresentation = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (presentation === null) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await workspaceRequest("/api/delegations/presentation", "PUT", {
        neutralClientLabel: formText(data.get("neutralClientLabel")).trim() || null,
        neutralProjectLabel: formText(data.get("neutralProjectLabel")).trim() || null,
        safeDefinitionOfDone: formText(data.get("safeDefinitionOfDone")).trim() || null,
        safeDescription: formText(data.get("safeDescription")).trim() || null,
        safeNotes: presentation.safeNotes,
        safeTitle: data.get("safeTitle"),
        safeWorkDescription: formText(data.get("safeWorkDescription")).trim() || null,
        status: data.get("status"),
        subjectId: presentation.subjectId,
        subjectType: presentation.subjectType,
        version: presentation.version,
      });
      setPresentation(response.presentation as Presentation);
      setMessage("The delegate-safe presentation was saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The safe presentation could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="collaboration-layout">
      <section className="settings-card" aria-labelledby="new-delegation-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Controlled external access</p>
            <h2 id="new-delegation-heading">New delegation</h2>
          </div>
          <span className="status-pill">Deny by default</span>
        </div>
        <form className="delegation-form" onSubmit={(event) => void create(event)}>
          <label>
            Scope
            <select
              name="subjectType"
              onChange={(event) => {
                setScope(event.target.value as "project" | "task");
              }}
              value={scope}
            >
              <option value="task">Task</option>
              <option value="project">Project</option>
            </select>
          </label>
          <label>
            {scope === "task" ? "Task" : "Project"}
            <select name="subjectId" required>
              <option value="">Select…</option>
              {visibleSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Delegate email
            <input autoComplete="email" name="delegateEmail" required type="email" />
          </label>
          <label>
            <span>
              Role
              <HelpTip label="Delegation role">
                Contributors work on shared items, reviewers validate work, and project
                collaborators can also create project tasks and shared subtasks.
              </HelpTip>
            </span>
            <select name="accessRole" defaultValue="contributor">
              <option value="contributor">Contributor</option>
              {scope === "project" ? (
                <option value="project_collaborator">Project collaborator</option>
              ) : null}
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
          <label>
            Access expires
            <input name="expiresAt" type="datetime-local" />
          </label>
          <label className="checkbox-row">
            <input name="anonymise" type="checkbox" />
            Anonymise delegation
            <HelpTip label="Anonymise delegation">
              Uses stable aliases and blocks protected source content until its safe presentation is
              approved.
            </HelpTip>
          </label>
          <label className="span-two">
            Delegate instruction
            <textarea maxLength={4000} name="delegationNote" rows={3} />
          </label>
          <label className="span-two">
            Public delegate description
            <textarea
              maxLength={1000}
              name="profileDescription"
              placeholder="For example: Senior developer responsible for UAT, fixes, and feature requests."
              rows={2}
            />
          </label>
          <label className="span-two">
            Private redaction keywords
            <textarea
              maxLength={20_000}
              name="privacyKeywords"
              placeholder="Emails, phone numbers, websites, domains, and social handles — one per line"
              rows={3}
            />
            <span className="muted">
              Matches are removed from chatter and flagged in Compliance; delegates never see this
              list.
            </span>
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Creating…" : "Notify"}
          </button>
        </form>
        {inviteLink !== null ? (
          <div className="secure-link-box">
            <label htmlFor="invitation-link">Single-use invitation link</label>
            <div>
              <input id="invitation-link" readOnly value={inviteLink} />
              <button
                className="secondary"
                onClick={() => void navigator.clipboard.writeText(inviteLink)}
                type="button"
              >
                Copy
              </button>
            </div>
          </div>
        ) : null}
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
      </section>

      <section className="settings-card span-full" aria-labelledby="delegations-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Access Grants</p>
            <h2 id="delegations-heading">Delegations</h2>
          </div>
          <span>{grants.length} records</span>
        </div>
        <div className="table-scroll">
          <table className="delegation-table">
            <thead>
              <tr>
                <th>Real user</th>
                <th>Alias</th>
                <th>Subject</th>
                <th>Invited</th>
                <th>Activated</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <tr key={grant.id}>
                  <td>
                    {grant.profileDescription === null ? (
                      (grant.delegateFullName ?? grant.delegateEmail)
                    ) : (
                      <DelayedTooltip
                        content={grant.profileDescription}
                        label={grant.delegateFullName ?? grant.delegateEmail}
                      >
                        <span>{grant.delegateFullName ?? grant.delegateEmail}</span>
                      </DelayedTooltip>
                    )}
                  </td>
                  <td>{grant.alias ?? "—"}</td>
                  <td>
                    <span className="scope-badge">{grant.scope}</span> {grant.subjectTitle}
                  </td>
                  <td>{dateValue(grant.invitedAt)}</td>
                  <td>{dateValue(grant.activatedAt)}</td>
                  <td>
                    {grant.status === "active" || grant.status === "invite_pending" ? (
                      <input
                        aria-label={`Expiry for ${grant.subjectTitle}`}
                        onChange={(event) => {
                          setGrantEdits((current) => ({
                            ...current,
                            [grant.id]: {
                              accessRole: current[grant.id]?.accessRole ?? grant.accessRole,
                              expiresAt: event.target.value,
                            },
                          }));
                        }}
                        type="datetime-local"
                        value={
                          grantEdits[grant.id]?.expiresAt ?? grant.expiresAt?.slice(0, 16) ?? ""
                        }
                      />
                    ) : (
                      dateValue(grant.expiresAt)
                    )}
                  </td>
                  <td>{grant.status.replaceAll("_", " ")}</td>
                  <td>
                    {grant.status === "active" || grant.status === "invite_pending" ? (
                      <select
                        aria-label={`Role for ${grant.subjectTitle}`}
                        onChange={(event) => {
                          setGrantEdits((current) => ({
                            ...current,
                            [grant.id]: {
                              accessRole: event.target.value as Grant["accessRole"],
                              expiresAt:
                                current[grant.id]?.expiresAt ?? grant.expiresAt?.slice(0, 16) ?? "",
                            },
                          }));
                        }}
                        value={grantEdits[grant.id]?.accessRole ?? grant.accessRole}
                      >
                        <option value="contributor">Contributor</option>
                        {grant.subjectType === "project" ? (
                          <option value="project_collaborator">Project collaborator</option>
                        ) : null}
                        <option value="reviewer">Reviewer</option>
                      </select>
                    ) : (
                      grant.accessRole.replaceAll("_", " ")
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      {grant.status === "invite_pending" ? (
                        <button className="secondary compact" onClick={() => void resend(grant.id)}>
                          Resend
                        </button>
                      ) : null}
                      {grant.status === "active" || grant.status === "invite_pending" ? (
                        <>
                          <button
                            className="secondary compact"
                            disabled={busy}
                            onClick={() => void saveGrant(grant)}
                          >
                            Save
                          </button>
                          <button
                            className="secondary compact"
                            disabled={busy}
                            onClick={() => void changeDelegate(grant)}
                          >
                            Change delegate
                          </button>
                          <button
                            className="secondary compact"
                            disabled={busy}
                            onClick={() => void changeProfile(grant)}
                          >
                            Profile & privacy
                          </button>
                        </>
                      ) : null}
                      <button
                        className="secondary compact"
                        onClick={() => void loadPresentation(grant)}
                      >
                        Safe view
                      </button>
                      {grant.status === "active" || grant.status === "invite_pending" ? (
                        <button className="danger compact" onClick={() => void revoke(grant.id)}>
                          Revoke
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {grants.length === 0 ? (
                <tr>
                  <td colSpan={9}>No delegations yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Revoked, declined, and expired grant records are retained for 30 days, then removed.
          Historical timesheets and audit events remain.
        </p>
      </section>

      {selectedGrantId !== null && presentation !== null ? (
        <section className="settings-card span-full" aria-labelledby="safe-presentation-heading">
          <p className="eyebrow">Anonymised release gate</p>
          <h2 id="safe-presentation-heading">Delegate-safe presentation</h2>
          <p>
            Delegates cannot see anonymised work until this version is approved. Source version{" "}
            {presentation.sourceVersion}.
          </p>
          <form className="delegation-form" onSubmit={(event) => void savePresentation(event)}>
            <label>
              Safe title
              <input defaultValue={presentation.safeTitle} name="safeTitle" required />
            </label>
            <label>
              Neutral project label
              <input
                defaultValue={presentation.neutralProjectLabel ?? ""}
                name="neutralProjectLabel"
              />
            </label>
            <label>
              Neutral client label
              <input
                defaultValue={presentation.neutralClientLabel ?? ""}
                name="neutralClientLabel"
              />
            </label>
            <label>
              Release status
              <select
                defaultValue={presentation.status === "stale" ? "draft" : presentation.status}
                name="status"
              >
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label className="span-two">
              Safe description
              <textarea
                defaultValue={presentation.safeDescription ?? ""}
                name="safeDescription"
                rows={3}
              />
            </label>
            <label className="span-two">
              Safe work description
              <textarea
                defaultValue={presentation.safeWorkDescription ?? ""}
                name="safeWorkDescription"
                rows={3}
              />
            </label>
            <label className="span-two">
              Safe definition of done
              <textarea
                defaultValue={presentation.safeDefinitionOfDone ?? ""}
                name="safeDefinitionOfDone"
                rows={3}
              />
            </label>
            <button disabled={busy} type="submit">
              Save safe presentation
            </button>
          </form>
        </section>
      ) : null}

      <section className="settings-card span-full" aria-labelledby="users-heading">
        <p className="eyebrow">Workspace access</p>
        <h2 id="users-heading">Users</h2>
        <div className="table-scroll">
          <table className="delegation-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Active grants</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId}>
                  <td>{user.fullName ?? user.email ?? user.username}</td>
                  <td>{user.role}</td>
                  <td>{user.membershipStatus}</td>
                  <td>{user.activeGrantCount}</td>
                  <td>
                    {user.role === "owner" ? (
                      "Protected owner"
                    ) : (
                      <div className="table-actions">
                        <button
                          className="secondary compact"
                          disabled={busy || user.membershipStatus !== "active"}
                          onClick={() => void changeRole(user)}
                        >
                          {user.role === "admin" ? "Make delegate" : "Make admin"}
                        </button>
                        <button
                          className="secondary compact"
                          onClick={() => void changeLifecycle(user.userId, "deactivate")}
                        >
                          Deactivate
                        </button>
                        <button
                          className="danger compact"
                          onClick={() => void changeLifecycle(user.userId, "archive")}
                        >
                          Archive
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
