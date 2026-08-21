"use client";

import { useEffect, useState, type SyntheticEvent } from "react";

import { workspaceRequest } from "./workspace-api";
import { DelayedTooltip, HelpTip } from "./delayed-tooltip";

interface GrantView {
  accessRole: "contributor" | "project_collaborator" | "reviewer";
  activatedAt: string | null;
  alias: string | null;
  delegateEmail: string;
  delegateFullName: string | null;
  delegateUserId: string | null;
  delegationNote: string | null;
  expiresAt: string | null;
  id: string;
  invitedAt: string;
  scope: "project" | "task";
  privacyKeywords: string[];
  profileDescription: string | null;
  status: string;
  subjectId: string;
  subjectTitle: string;
  subjectType: "project" | "task";
  version: number;
}

interface ProgressView {
  accessRole: string;
  accessStatus: string;
  alias: string | null;
  delegateDisplay: string;
  expiresAt: string | null;
  grantId: string;
  lastActivityAt: string | null;
  latestUpdate: string | null;
  riskFlagCount: number;
  stageName: string | null;
  totalTimeLogged: number;
}

interface ExistingDelegateView {
  activeGrantCount: number;
  email: string | null;
  fullName: string | null;
  membershipStatus: string;
  role: "admin" | "delegate" | "owner";
  userId: string;
  userStatus: string;
}

interface TaskAssigneeView {
  accessRole: GrantView["accessRole"];
  assigned: boolean;
  clearanceScope: "project" | "task";
  displayName: string;
  profileDescription: string | null;
  userId: string;
}

interface PresentationView {
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
  version: number | null;
}

const date = (value: string | null) =>
  value === null
    ? "—"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
const formText = (value: FormDataEntryValue | null): string =>
  typeof value === "string" ? value : "";
const privacyKeywords = (value: FormDataEntryValue | null): string[] => [
  ...new Set(
    formText(value)
      .split(/[\n,]/u)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
  ),
];

const safeNoteText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(safeNoteText).filter(Boolean).join("\n");
  if (value === null || typeof value !== "object") return "";
  const node = value as { content?: unknown; text?: unknown; type?: unknown };
  if (typeof node.text === "string") return node.text;
  const content = safeNoteText(node.content);
  return ["heading", "paragraph"].includes(String(node.type)) && content.length > 0
    ? `${content}\n`
    : content;
};

export const SubjectDelegationsPanel = ({
  onChanged,
  subjectId,
  subjectTitle,
  subjectType,
}: {
  onChanged: () => Promise<void>;
  subjectId: string;
  subjectTitle: string;
  subjectType: "project" | "task";
}) => {
  const [grants, setGrants] = useState<GrantView[]>([]);
  const [progress, setProgress] = useState<ProgressView[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [existingDelegates, setExistingDelegates] = useState<ExistingDelegateView[]>([]);
  const [taskAssignees, setTaskAssignees] = useState<TaskAssigneeView[]>([]);
  const [anonymisation, setAnonymisation] = useState({
    effective: false,
    inherited: false,
    own: false,
  });
  const [presentation, setPresentation] = useState<PresentationView | null>(null);

  const refresh = async () => {
    const query = new URLSearchParams({ subjectId, subjectType });
    const [
      grantResponse,
      progressResponse,
      userResponse,
      assignmentResponse,
      anonymisationResponse,
      presentationResponse,
    ] = await Promise.all([
      workspaceRequest(`/api/delegations?${query.toString()}`, "GET"),
      subjectType === "task"
        ? workspaceRequest(
            `/api/delegations/progress?taskId=${encodeURIComponent(subjectId)}`,
            "GET",
          )
        : Promise.resolve({ progress: [] }),
      workspaceRequest("/api/users", "GET"),
      subjectType === "task"
        ? workspaceRequest(
            `/api/delegations/task-assignments/${encodeURIComponent(subjectId)}`,
            "GET",
          )
        : Promise.resolve({ assignees: [] }),
      workspaceRequest(
        `/api/delegations/anonymisation?subjectId=${encodeURIComponent(subjectId)}&subjectType=${subjectType}`,
        "GET",
      ),
      workspaceRequest(
        `/api/delegations/presentation?subjectId=${encodeURIComponent(subjectId)}&subjectType=${subjectType}`,
        "GET",
      ),
    ]);
    setGrants(Array.isArray(grantResponse.grants) ? (grantResponse.grants as GrantView[]) : []);
    setProgress(
      Array.isArray(progressResponse.progress) ? (progressResponse.progress as ProgressView[]) : [],
    );
    setExistingDelegates(
      Array.isArray(userResponse.users) ? (userResponse.users as ExistingDelegateView[]) : [],
    );
    setTaskAssignees(
      Array.isArray(assignmentResponse.assignees)
        ? (assignmentResponse.assignees as TaskAssigneeView[])
        : [],
    );
    if (
      anonymisationResponse.anonymisation !== null &&
      typeof anonymisationResponse.anonymisation === "object"
    ) {
      const nextAnonymisation = anonymisationResponse.anonymisation as {
        effective: boolean;
        inherited: boolean;
        own: boolean;
      };
      setAnonymisation(nextAnonymisation);
      const existing = presentationResponse.presentation as PresentationView | null;
      setPresentation(
        nextAnonymisation.effective
          ? (existing ?? {
              neutralClientLabel: null,
              neutralProjectLabel: null,
              safeDefinitionOfDone: null,
              safeDescription: null,
              safeNotes: { content: [], type: "doc" },
              safeTitle: subjectType === "project" ? "Shared project" : "Shared task",
              safeWorkDescription: null,
              sourceVersion: 0,
              status: "draft",
              subjectId,
              subjectType,
              version: null,
            })
          : null,
      );
    }
  };

  useEffect(() => {
    void refresh().catch(() => {
      setMessage("Unable to load delegations.");
    });
  }, [subjectId, subjectType]);

  const create = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    setBusy(true);
    setInvitationUrl(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await workspaceRequest("/api/delegations", "POST", {
        accessRole: data.get("accessRole"),
        anonymise: data.get("anonymise") === "on",
        delegateEmail: data.get("delegateEmail"),
        delegationNote: formText(data.get("delegationNote")).trim() || null,
        privacyKeywords: privacyKeywords(data.get("privacyKeywords")),
        profileDescription: formText(data.get("profileDescription")).trim() || null,
        expiresAt:
          formText(data.get("expiresAt")).length === 0
            ? null
            : new Date(formText(data.get("expiresAt"))).toISOString(),
        subjectId,
        subjectType,
      });
      setInvitationUrl(typeof response.invitationUrl === "string" ? response.invitationUrl : null);
      setMessage(
        response.delivery === "queued"
          ? "Invitation queued for email delivery."
          : "Invitation created. Copy the secure single-use link.",
      );
      event.currentTarget.reset();
      await refresh();
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create the delegation.");
    } finally {
      setBusy(false);
    }
  };

  const grantExisting = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setInvitationUrl(null);
    try {
      await workspaceRequest("/api/delegations/existing", "POST", {
        accessRole: data.get("accessRole"),
        delegateUserId: data.get("delegateUserId"),
        delegationNote: formText(data.get("delegationNote")).trim() || null,
        expiresAt:
          formText(data.get("expiresAt")).length === 0
            ? null
            : new Date(formText(data.get("expiresAt"))).toISOString(),
        subjectId,
        subjectType,
      });
      form.reset();
      await refresh();
      await onChanged();
      setMessage(
        subjectType === "project"
          ? "Project clearance granted immediately. Every linked task is now visible."
          : "Task clearance and assignment granted immediately.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to grant access.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grantId: string) => {
    if (!window.confirm("Revoke this access immediately?")) return;
    setBusy(true);
    try {
      await workspaceRequest(`/api/delegations/${grantId}`, "DELETE");
      await refresh();
      await onChanged();
      setMessage("Access revoked immediately.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke access.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async (grantId: string) => {
    setBusy(true);
    try {
      const response = await workspaceRequest(`/api/delegations/${grantId}/resend`, "POST", {});
      setInvitationUrl(typeof response.invitationUrl === "string" ? response.invitationUrl : null);
      await refresh();
      setMessage("A new invitation was created and the old link was invalidated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to resend the invitation.");
    } finally {
      setBusy(false);
    }
  };

  const updateGrant = async (
    grant: GrantView,
    change: "delegate" | "expiry" | "profile" | "role",
  ) => {
    let payload: Record<string, unknown> = { version: grant.version };
    if (change === "delegate") {
      const delegateEmail = window.prompt("Replacement delegate email address:");
      if (delegateEmail === null || delegateEmail.trim().length === 0) return;
      if (!window.confirm("Revoke the current access and create a replacement invitation?")) return;
      payload = { ...payload, delegateEmail: delegateEmail.trim() };
    } else if (change === "expiry") {
      const expiresAt = window.prompt(
        "New access expiry (for example 2026-09-01T17:00), or leave blank for no expiry:",
        grant.expiresAt?.slice(0, 16) ?? "",
      );
      if (expiresAt === null) return;
      const parsed = expiresAt.trim().length === 0 ? null : new Date(expiresAt);
      if (parsed !== null && Number.isNaN(parsed.getTime())) {
        setMessage("Enter a valid expiry date and time.");
        return;
      }
      payload = { ...payload, expiresAt: parsed === null ? null : parsed.toISOString() };
    } else if (change === "role") {
      const accessRole = window.prompt(
        `Role: contributor${grant.subjectType === "project" ? ", project_collaborator" : ""}, or reviewer`,
        grant.accessRole,
      );
      if (accessRole === null) return;
      const allowed =
        accessRole === "contributor" ||
        accessRole === "reviewer" ||
        (grant.subjectType === "project" && accessRole === "project_collaborator");
      if (!allowed) {
        setMessage("Choose a role available for this delegation scope.");
        return;
      }
      payload = { ...payload, accessRole };
    } else {
      const profileDescription = window.prompt(
        "Short description visible to authorised participants when they hover over this delegate:",
        grant.profileDescription ?? "",
      );
      if (profileDescription === null) return;
      const keywords = window.prompt(
        "Private contact details to redact (one per line or separated by commas). These are never shown to delegates:",
        grant.privacyKeywords.join("\n"),
      );
      if (keywords === null) return;
      payload = {
        ...payload,
        privacyKeywords: privacyKeywords(keywords),
        profileDescription: profileDescription.trim() || null,
      };
    }
    setBusy(true);
    try {
      const response = await workspaceRequest(`/api/delegations/${grant.id}`, "PATCH", payload);
      if (typeof response.invitationUrl === "string") setInvitationUrl(response.invitationUrl);
      await refresh();
      await onChanged();
      setMessage(
        change === "delegate"
          ? "The previous access was revoked and a replacement invitation was created."
          : "The delegation was updated.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the delegation.");
    } finally {
      setBusy(false);
    }
  };

  const saveTaskAssignments = async () => {
    setBusy(true);
    try {
      const response = await workspaceRequest(
        `/api/delegations/task-assignments/${encodeURIComponent(subjectId)}`,
        "PATCH",
        {
          delegateUserIds: taskAssignees
            .filter((candidate) => candidate.assigned)
            .map((candidate) => candidate.userId),
        },
      );
      setTaskAssignees(
        Array.isArray(response.assignees) ? (response.assignees as TaskAssigneeView[]) : [],
      );
      await refresh();
      await onChanged();
      setMessage("Task assignments updated. Clearance was not changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update task assignments.");
    } finally {
      setBusy(false);
    }
  };

  const saveAnonymisation = async (enabled: boolean) => {
    setBusy(true);
    try {
      const query = new URLSearchParams({ subjectId, subjectType });
      await workspaceRequest(`/api/delegations/anonymisation?${query.toString()}`, "PATCH", {
        enabled,
      });
      await refresh();
      await onChanged();
      setMessage(
        enabled
          ? "Anonymisation enabled. Approve the delegate-safe presentation before release."
          : "Anonymisation disabled for this scope.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update anonymisation.");
    } finally {
      setBusy(false);
    }
  };

  const savePresentation = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (presentation === null) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await workspaceRequest("/api/delegations/presentation", "PUT", {
        neutralClientLabel: formText(data.get("neutralClientLabel")).trim() || null,
        neutralProjectLabel: formText(data.get("neutralProjectLabel")).trim() || null,
        safeDefinitionOfDone: formText(data.get("safeDefinitionOfDone")).trim() || null,
        safeDescription: formText(data.get("safeDescription")).trim() || null,
        safeNotes: (() => {
          const text = formText(data.get("safeNotes")).trim();
          return {
            content:
              text.length === 0 ? [] : [{ content: [{ text, type: "text" }], type: "paragraph" }],
            type: "doc",
          };
        })(),
        safeTitle: data.get("safeTitle"),
        safeWorkDescription: formText(data.get("safeWorkDescription")).trim() || null,
        status: data.get("status"),
        subjectId,
        subjectType,
        version: presentation.version,
      });
      setPresentation(response.presentation as PresentationView);
      setMessage("The delegate-safe presentation was saved.");
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the safe presentation.");
    } finally {
      setBusy(false);
    }
  };

  const usersWithLiveClearance = new Set(
    grants
      .filter((grant) => grant.status === "active" || grant.status === "invite_pending")
      .map((grant) => grant.delegateUserId)
      .filter((userId): userId is string => userId !== null),
  );
  const reusableProfiles = existingDelegates.filter(
    (person) =>
      person.role === "delegate" &&
      person.membershipStatus === "active" &&
      person.userStatus === "active" &&
      person.email !== null &&
      !usersWithLiveClearance.has(person.userId),
  );

  return (
    <section className="subject-delegations">
      <div className="section-heading-row">
        <div>
          <h3>Delegations</h3>
          <p className="muted">
            Controlled access to {subjectTitle}. Multiple people can be active.
          </p>
        </div>
        <span className="status-pill">Owner controlled</span>
      </div>
      <div className="anonymisation-control">
        <label className="checkbox-row">
          <input
            checked={anonymisation.inherited ? anonymisation.effective : anonymisation.own}
            disabled={busy || anonymisation.inherited}
            onChange={(event) => void saveAnonymisation(event.target.checked)}
            type="checkbox"
          />
          Anonymise delegation
          <HelpTip label="Anonymise delegation">
            Replaces participant identities with stable aliases for this project and requires an
            approved delegate-safe presentation before protected content is released.
          </HelpTip>
        </label>
        <span className="muted">
          {anonymisation.inherited
            ? "Inherited from the project and cannot be disabled on this task."
            : "Delegate-visible content is blocked until an approved safe presentation exists."}
        </span>
      </div>
      {presentation === null ? null : (
        <details className="safe-presentation-inline" open={presentation.status !== "approved"}>
          <summary>Delegate-safe presentation · {presentation.status.replaceAll("_", " ")}</summary>
          <p className="muted">
            Anonymised work remains unavailable whenever this delegate-safe content needs approval.
          </p>
          <form
            className="delegation-form"
            key={`${presentation.subjectId}:${String(presentation.version ?? "new")}`}
            onSubmit={(event) => void savePresentation(event)}
          >
            <label>
              Safe title
              <input defaultValue={presentation.safeTitle} name="safeTitle" required />
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
            <label className="span-two">
              Safe description
              <textarea
                defaultValue={presentation.safeDescription ?? ""}
                name="safeDescription"
                rows={3}
              />
            </label>
            <label className="span-two">
              Safe notes
              <textarea
                defaultValue={safeNoteText(presentation.safeNotes).trim()}
                name="safeNotes"
                rows={4}
              />
            </label>
            {subjectType === "task" ? (
              <>
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
              </>
            ) : null}
            <button disabled={busy} type="submit">
              Save safe presentation
            </button>
          </form>
        </details>
      )}
      <form
        className="delegation-form existing-profile-grant"
        onSubmit={(event) => void grantExisting(event)}
      >
        <div className="span-two">
          <h4>Grant clearance to an existing profile</h4>
          <p className="muted">
            Project clearance reveals the complete project and every linked task. Task clearance
            reveals and assigns only this task.
          </p>
        </div>
        <label>
          Existing person
          <select disabled={reusableProfiles.length === 0} name="delegateUserId" required>
            <option value="">Select a delegate</option>
            {reusableProfiles.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.fullName ?? person.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Role
          <select defaultValue="contributor" name="accessRole">
            <option value="contributor">Contributor</option>
            {subjectType === "project" ? (
              <option value="project_collaborator">Project collaborator</option>
            ) : null}
            <option value="reviewer">Reviewer</option>
          </select>
        </label>
        <label>
          Expires
          <input name="expiresAt" type="datetime-local" />
        </label>
        <label className="span-two">
          Instruction for this work
          <textarea maxLength={4000} name="delegationNote" rows={2} />
        </label>
        <button disabled={busy || reusableProfiles.length === 0} type="submit">
          Grant access now
        </button>
        {reusableProfiles.length === 0 ? (
          <p className="muted">No additional active delegate profiles are available.</p>
        ) : null}
      </form>
      <h4>Invite a new person</h4>
      <form className="delegation-form" onSubmit={(event) => void create(event)}>
        <label>
          Delegate email
          <input autoComplete="email" name="delegateEmail" required type="email" />
        </label>
        <label>
          <span>
            Role
            <HelpTip label="Delegation role">
              Contributors work on shared items, reviewers validate work, and project collaborators
              can also create project tasks and shared subtasks.
            </HelpTip>
          </span>
          <select defaultValue="contributor" name="accessRole">
            <option value="contributor">Contributor</option>
            {subjectType === "project" ? (
              <option value="project_collaborator">Project collaborator</option>
            ) : null}
            <option value="reviewer">Reviewer</option>
          </select>
        </label>
        <label>
          Expires
          <input name="expiresAt" type="datetime-local" />
        </label>
        <label className="checkbox-row">
          <input name="anonymise" type="checkbox" />
          Anonymise delegation
        </label>
        <label className="span-two">
          Delegate instruction
          <textarea maxLength={4000} name="delegationNote" rows={2} />
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
            placeholder="Emails, phone numbers, domains, websites, social handles — one per line"
            rows={3}
          />
          <span className="muted">
            Never shown to delegates. Matches are removed from chatter and flagged in Compliance.
          </span>
        </label>
        <button disabled={busy} type="submit">
          Notify
        </button>
      </form>
      {invitationUrl === null ? null : (
        <div className="secure-link-box">
          <label>Single-use invitation link</label>
          <div>
            <input readOnly value={invitationUrl} />
            <button
              className="secondary"
              onClick={() => void navigator.clipboard.writeText(invitationUrl)}
              type="button"
            >
              Copy
            </button>
          </div>
        </div>
      )}
      <p aria-live="polite" className="form-message">
        {message}
      </p>
      {subjectType === "task" ? (
        <>
          <h4>Task-level delegates</h4>
          <GrantTable
            busy={busy}
            grants={grants.filter((grant) => grant.scope === "task")}
            onResend={resend}
            onRevoke={revoke}
            onUpdate={updateGrant}
          />
          <h4>Project-level delegates</h4>
          <GrantTable
            busy={busy}
            grants={grants.filter((grant) => grant.scope === "project")}
            onResend={resend}
            onRevoke={revoke}
            onUpdate={updateGrant}
          />
          <div className="task-sharing-control">
            <div>
              <h4>
                Task assignees
                <HelpTip label="Task assignees and clearance">
                  A project Access Pass automatically gives visibility to every project task.
                  Assignment identifies who is responsible for this task without creating another
                  grant. A direct task Access Pass remains limited to this task.
                </HelpTip>
              </h4>
              <p className="muted">
                Select responsible people from those who already have project or task clearance.
              </p>
            </div>
            <fieldset>
              <legend>People with clearance</legend>
              {taskAssignees.map((candidate) => (
                <label className="checkbox-row" key={candidate.userId}>
                  <input
                    checked={candidate.assigned}
                    onChange={(event) => {
                      setTaskAssignees((current) =>
                        current.map((item) =>
                          item.userId === candidate.userId
                            ? { ...item, assigned: event.target.checked }
                            : item,
                        ),
                      );
                    }}
                    type="checkbox"
                  />
                  <span>
                    {candidate.displayName} · {candidate.clearanceScope} clearance ·{" "}
                    {candidate.accessRole.replaceAll("_", " ")}
                  </span>
                </label>
              ))}
              {taskAssignees.length === 0 ? (
                <p className="muted">
                  Grant task clearance or project clearance before assigning this task.
                </p>
              ) : null}
            </fieldset>
            <button
              className="secondary compact"
              disabled={busy || taskAssignees.length === 0}
              onClick={() => void saveTaskAssignments()}
              type="button"
            >
              Save task assignees
            </button>
          </div>
        </>
      ) : (
        <GrantTable
          busy={busy}
          grants={grants}
          onResend={resend}
          onRevoke={revoke}
          onUpdate={updateGrant}
        />
      )}
      {subjectType === "task" && progress.length > 0 ? (
        <div className="delegation-progress-panel">
          <h4>Delegation progress</h4>
          {progress.map((item) => (
            <article key={item.grantId}>
              <strong>{item.alias ?? item.delegateDisplay}</strong>
              <span>
                {item.accessRole.replaceAll("_", " ")} ·{" "}
                {item.stageName ?? item.accessStatus.replaceAll("_", " ")}
              </span>
              <span>
                {item.totalTimeLogged}h logged · expires {date(item.expiresAt)}
              </span>
              <span>Last activity {date(item.lastActivityAt)}</span>
              {item.latestUpdate === null ? null : <p>{item.latestUpdate}</p>}
              {item.riskFlagCount > 0 ? (
                <span className="activity-warning">{item.riskFlagCount} open risk flag(s)</span>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
};

const GrantTable = ({
  busy,
  grants,
  onResend,
  onRevoke,
  onUpdate,
}: {
  busy: boolean;
  grants: GrantView[];
  onResend: (id: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
  onUpdate: (grant: GrantView, change: "delegate" | "expiry" | "profile" | "role") => Promise<void>;
}) => (
  <div className="table-scroll">
    <table className="delegation-table">
      <thead>
        <tr>
          <th>Real user</th>
          <th>Alias</th>
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
            <td>{date(grant.invitedAt)}</td>
            <td>{date(grant.activatedAt)}</td>
            <td>{date(grant.expiresAt)}</td>
            <td>{grant.status.replaceAll("_", " ")}</td>
            <td>{grant.accessRole.replaceAll("_", " ")}</td>
            <td>
              <div className="table-actions">
                {grant.status === "invite_pending" ? (
                  <button
                    className="secondary compact"
                    disabled={busy}
                    onClick={() => void onResend(grant.id)}
                    type="button"
                  >
                    Resend
                  </button>
                ) : null}
                {grant.status === "active" || grant.status === "invite_pending" ? (
                  <button
                    className="secondary compact"
                    disabled={busy}
                    onClick={() => void onUpdate(grant, "profile")}
                    type="button"
                  >
                    Profile & privacy
                  </button>
                ) : null}
                {grant.status === "active" || grant.status === "invite_pending" ? (
                  <button
                    className="secondary compact"
                    disabled={busy}
                    onClick={() => void onUpdate(grant, "delegate")}
                    type="button"
                  >
                    Change delegate
                  </button>
                ) : null}
                {grant.status === "active" || grant.status === "invite_pending" ? (
                  <button
                    className="secondary compact"
                    disabled={busy}
                    onClick={() => void onUpdate(grant, "expiry")}
                    type="button"
                  >
                    Expiry
                  </button>
                ) : null}
                {grant.status === "active" || grant.status === "invite_pending" ? (
                  <button
                    className="secondary compact"
                    disabled={busy}
                    onClick={() => void onUpdate(grant, "role")}
                    type="button"
                  >
                    Role
                  </button>
                ) : null}
                {grant.status === "active" || grant.status === "invite_pending" ? (
                  <button
                    className="danger compact"
                    disabled={busy}
                    onClick={() => void onRevoke(grant.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
        {grants.length === 0 ? (
          <tr>
            <td colSpan={8}>No delegates in this section.</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  </div>
);
