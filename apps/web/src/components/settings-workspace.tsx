"use client";

import { useEffect, useMemo, useState, type SyntheticEvent } from "react";

import { ProjectStageSettings } from "./project-stage-settings";
import { automationRunMessage } from "./workspace-api";
import type { Stage } from "./workspace-types";

type Section =
  "general" | "working-time" | "projects" | "ai" | "prioritization" | "collaboration" | "security";
type SaveState = "idle" | "unsaved" | "saving" | "saved" | "conflict" | "error";

interface SettingsData {
  ai: {
    configured: boolean;
    provider: string;
    source: "environment" | "settings";
    verificationStatus: string;
  };
  general: {
    dateDisplay: "iso" | "locale";
    defaultKanbanSort: "dependency" | "greatest_value" | "manual" | "planning_priority";
    defaultLandingView: "projects";
    displayName: string;
    firstDayOfWeek: "monday";
    fullName?: string | null;
    knownAs?: string[];
    timezone: string;
    version: number;
  };
  prioritization: {
    aiTieBreakingEnabled: boolean;
    allowFinalTaskOverflow: boolean;
    allowMissingSizeSubstitution: boolean;
    businessValueInfluenceEnabled: boolean;
    dailyAutomationEnabled: boolean;
    dailyBufferEnabled: boolean;
    dailyLargeQuota: number;
    dailyMediumQuota: number;
    dailySmallQuota: number;
    deadlineRiskHorizonDays: number;
    manualTodayCarryover: boolean;
    planningBufferPercent: number;
    version: number;
    weeklyAutomationEnabled: boolean;
  };
  workingDays: {
    availableHours: number;
    endTime?: string;
    enabled: boolean;
    startTime?: string;
    weekday: string;
  }[];
}

const sections: [Section, string][] = [
  ["general", "General"],
  ["working-time", "Working Time"],
  ["projects", "Projects"],
  ["ai", "AI"],
  ["prioritization", "Prioritisation"],
  ["collaboration", "Collaboration"],
  ["security", "Security"],
];

const request = async (url: string, method: string, value?: unknown) => {
  const response = await fetch(url, {
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    headers: { "content-type": "application/json" },
    method,
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(
      typeof result.message === "string" ? result.message : "The request failed.",
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return result;
};

const FormStatus = ({ state, message }: { message: string; state: SaveState }) => (
  <p
    className={`form-message ${state === "error" || state === "conflict" ? "error" : ""}`}
    aria-live="polite"
  >
    {state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved."
        : state === "unsaved"
          ? "Unsaved changes."
          : message}
  </p>
);

const workdayHours = (startTime: string, endTime: string): number => {
  const [startHour = 0, startMinute = 0] = startTime.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = endTime.split(":").map(Number);
  return Math.max(
    0,
    Math.round(((endHour * 60 + endMinute - startHour * 60 - startMinute) / 60) * 100) / 100,
  );
};

const nullableOwnerName = (value: string): string | null => (value.length === 0 ? null : value);

export const SettingsWorkspace = ({
  initialCollaboration = {
    complianceMonitorEnabled: false,
    delegateUploadsEnabled: false,
    invitationEmailEnabled: false,
    multiUserEnabled: false,
  },
  initial,
  stages = [],
}: {
  initial: SettingsData;
  initialCollaboration?: CollaborationFlags;
  stages?: Stage[];
}) => {
  const [active, setActive] = useState<Section>("general");
  const [data, setData] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  const save = async (url: string, value: unknown) => {
    setState("saving");
    setMessage("");
    try {
      const result = await request(url, "PUT", value);
      if (typeof result.version === "number") {
        setData((current) => ({
          ...current,
          general: { ...current.general, version: result.version as number },
          prioritization: { ...current.prioritization, version: result.version as number },
        }));
      }
      setState("saved");
      return result;
    } catch (error) {
      setState((error as { status?: number }).status === 409 ? "conflict" : "error");
      setMessage(error instanceof Error ? error.message : "The request failed.");
      return null;
    }
  };

  return (
    <div className="settings-layout">
      <nav aria-label="Settings sections" className="settings-nav">
        {sections.map(([id, label]) => (
          <button
            aria-current={active === id ? "page" : undefined}
            className={active === id ? "active" : "secondary"}
            key={id}
            onClick={() => {
              setActive(id);
              setState("idle");
              setMessage("");
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="settings-panel">
        {active === "general" ? (
          <GeneralSection
            data={data}
            onChange={setData}
            onDirty={() => {
              setState("unsaved");
            }}
            onSave={save}
          />
        ) : null}
        {active === "working-time" ? (
          <WorkingTimeSection
            data={data}
            onChange={setData}
            onDirty={() => {
              setState("unsaved");
            }}
            onSave={save}
          />
        ) : null}
        {active === "projects" ? <ProjectStageSettings initial={stages} /> : null}
        {active === "ai" ? (
          <AiSection data={data} onChange={setData} setMessage={setMessage} setState={setState} />
        ) : null}
        {active === "prioritization" ? (
          <PrioritizationSection
            data={data}
            hasUnsavedChanges={state === "unsaved"}
            onChange={setData}
            onDirty={() => {
              setState("unsaved");
            }}
            onSave={save}
            setMessage={setMessage}
            setState={setState}
          />
        ) : null}
        {active === "collaboration" ? (
          <CollaborationSection
            initial={initialCollaboration}
            setMessage={setMessage}
            setState={setState}
          />
        ) : null}
        {active === "security" ? (
          <SecuritySection setMessage={setMessage} setState={setState} />
        ) : null}
        <FormStatus message={message} state={state} />
      </div>
    </div>
  );
};

interface CollaborationFlags {
  complianceMonitorEnabled: boolean;
  delegateUploadsEnabled: boolean;
  invitationEmailEnabled: boolean;
  multiUserEnabled: boolean;
}

const CollaborationSection = ({
  initial,
  setMessage,
  setState,
}: {
  initial: CollaborationFlags;
  setMessage: (message: string) => void;
  setState: (state: SaveState) => void;
}) => {
  const [flags, setFlags] = useState(initial);
  const toggle = (field: keyof CollaborationFlags, checked: boolean) => {
    setFlags((current) => ({ ...current, [field]: checked }));
    setState("unsaved");
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setState("saving");
        void request("/api/settings/collaboration", "PUT", flags)
          .then((response) => {
            if (response.flags !== null && typeof response.flags === "object")
              setFlags(response.flags as unknown as CollaborationFlags);
            setState("saved");
          })
          .catch((error: unknown) => {
            setMessage(
              error instanceof Error ? error.message : "Unable to save collaboration settings.",
            );
            setState("error");
          });
      }}
    >
      <h2>Collaboration</h2>
      <p>
        Feature gates fail closed. Email and uploads require their deployment services before they
        can operate.
      </p>
      <label className="checkbox-row">
        <input
          checked={flags.multiUserEnabled}
          onChange={(event) => {
            toggle("multiUserEnabled", event.target.checked);
          }}
          type="checkbox"
        />
        Enable delegated user access
      </label>
      <label className="checkbox-row">
        <input
          checked={flags.invitationEmailEnabled}
          onChange={(event) => {
            toggle("invitationEmailEnabled", event.target.checked);
          }}
          type="checkbox"
        />
        Queue invitation emails (requires encryption key and email transport)
      </label>
      <label className="checkbox-row">
        <input
          checked={flags.delegateUploadsEnabled}
          onChange={(event) => {
            toggle("delegateUploadsEnabled", event.target.checked);
          }}
          type="checkbox"
        />
        Allow delegate uploads (requires configured malware scanner)
      </label>
      <label className="checkbox-row">
        <input
          checked={flags.complianceMonitorEnabled}
          onChange={(event) => {
            toggle("complianceMonitorEnabled", event.target.checked);
          }}
          type="checkbox"
        />
        Enable owner-only compliance monitoring
      </label>
      <button type="submit">Save Collaboration settings</button>
    </form>
  );
};

const GeneralSection = ({
  data,
  onChange,
  onDirty,
  onSave,
}: {
  data: SettingsData;
  onChange: (value: SettingsData) => void;
  onDirty: () => void;
  onSave: (url: string, value: unknown) => Promise<Record<string, unknown> | null>;
}) => (
  <form
    onSubmit={(event) => {
      event.preventDefault();
      void onSave("/api/settings/general", {
        ...data.general,
        fullName: data.general.fullName ?? null,
        knownAs: data.general.knownAs ?? [],
      });
    }}
  >
    <h2>General</h2>
    <label htmlFor="display-name">Workspace name</label>
    <input
      id="display-name"
      maxLength={100}
      onChange={(event) => {
        onChange({ ...data, general: { ...data.general, displayName: event.target.value } });
        onDirty();
      }}
      value={data.general.displayName}
    />
    <label htmlFor="owner-full-name">Your full name</label>
    <input
      id="owner-full-name"
      maxLength={200}
      onChange={(event) => {
        onChange({
          ...data,
          general: { ...data.general, fullName: nullableOwnerName(event.target.value) },
        });
        onDirty();
      }}
      placeholder="For example, Alexandra Simões"
      value={data.general.fullName ?? ""}
    />
    <label htmlFor="owner-known-as">People also call you</label>
    <input
      id="owner-known-as"
      onChange={(event) => {
        onChange({
          ...data,
          general: {
            ...data.general,
            knownAs: event.target.value
              .split(",")
              .map((name) => name.trim())
              .filter((name) => name.length > 0)
              .slice(0, 20),
          },
        });
        onDirty();
      }}
      placeholder="For example, Alex, Lex"
      value={(data.general.knownAs ?? []).join(", ")}
    />
    <p className="muted">
      Used only to identify your action items and other participants in meeting transcripts.
    </p>
    <label htmlFor="timezone">IANA timezone</label>
    <input
      id="timezone"
      onChange={(event) => {
        onChange({ ...data, general: { ...data.general, timezone: event.target.value } });
        onDirty();
      }}
      value={data.general.timezone}
    />
    <label htmlFor="date-display">Date display</label>
    <select
      id="date-display"
      onChange={(event) => {
        onChange({
          ...data,
          general: { ...data.general, dateDisplay: event.target.value as "iso" | "locale" },
        });
        onDirty();
      }}
      value={data.general.dateDisplay}
    >
      <option value="iso">ISO (YYYY-MM-DD)</option>
      <option value="locale">Browser locale</option>
    </select>
    <button type="submit">Save General settings</button>
  </form>
);

const WorkingTimeSection = ({
  data,
  onChange,
  onDirty,
  onSave,
}: {
  data: SettingsData;
  onChange: (value: SettingsData) => void;
  onDirty: () => void;
  onSave: (url: string, value: unknown) => Promise<Record<string, unknown> | null>;
}) => {
  const raw = useMemo(
    () => data.workingDays.reduce((sum, day) => sum + (day.enabled ? day.availableHours : 0), 0),
    [data.workingDays],
  );
  const buffer = raw * (data.prioritization.planningBufferPercent / 100);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave("/api/settings/working-time", {
          days: data.workingDays,
          version: data.general.version,
        });
      }}
    >
      <h2>Working Time</h2>
      <p>Set each day’s work window. Available hours are calculated automatically.</p>
      <div className="weekday-grid">
        <div className="weekday-row weekday-heading" aria-hidden="true">
          <span>Day</span>
          <span>Start</span>
          <span>End</span>
          <span>Hours</span>
        </div>
        {data.workingDays.map((day, index) => (
          <div className="weekday-row" key={day.weekday}>
            <label>
              <input
                checked={day.enabled}
                onChange={(event) => {
                  const days = [...data.workingDays];
                  days.splice(index, 1, {
                    ...day,
                    availableHours: event.target.checked
                      ? workdayHours(day.startTime ?? "09:00", day.endTime ?? "17:00")
                      : 0,
                    enabled: event.target.checked,
                  });
                  onChange({ ...data, workingDays: days });
                  onDirty();
                }}
                type="checkbox"
              />{" "}
              {day.weekday}
            </label>
            <input
              aria-label={`${day.weekday} start time`}
              disabled={!day.enabled}
              onChange={(event) => {
                const days = [...data.workingDays];
                const startTime = event.target.value;
                days.splice(index, 1, {
                  ...day,
                  availableHours: workdayHours(startTime, day.endTime ?? "17:00"),
                  startTime,
                });
                onChange({ ...data, workingDays: days });
                onDirty();
              }}
              type="time"
              value={day.startTime ?? "09:00"}
            />
            <input
              aria-label={`${day.weekday} end time`}
              disabled={!day.enabled}
              onChange={(event) => {
                const days = [...data.workingDays];
                const endTime = event.target.value;
                days.splice(index, 1, {
                  ...day,
                  availableHours: workdayHours(day.startTime ?? "09:00", endTime),
                  endTime,
                });
                onChange({ ...data, workingDays: days });
                onDirty();
              }}
              type="time"
              value={day.endTime ?? "17:00"}
            />
            <output aria-label={`${day.weekday} available hours`} className="calculated-hours">
              {day.enabled ? `${String(day.availableHours)}h` : "—"}
            </output>
          </div>
        ))}
      </div>
      <div className="capacity-summary" aria-live="polite">
        <span>
          Raw: <strong>{raw.toFixed(2)}h</strong>
        </span>
        <span>
          Buffer: <strong>{buffer.toFixed(2)}h</strong>
        </span>
        <span>
          Effective: <strong>{Math.max(0, raw - buffer).toFixed(2)}h</strong>
        </span>
        <span>
          Status: <strong>{raw - buffer === 0 ? "No capacity" : "Available"}</strong>
        </span>
      </div>
      <button type="submit">Save Working Time</button>
    </form>
  );
};

const AiSection = ({
  data,
  onChange,
  setMessage,
  setState,
}: {
  data: SettingsData;
  onChange: (value: SettingsData) => void;
  setMessage: (value: string) => void;
  setState: (value: SaveState) => void;
}) => {
  const [credential, setCredential] = useState("");
  const act = async (operation: () => Promise<Record<string, unknown>>, success: string) => {
    setState("saving");
    setMessage("");
    try {
      await operation();
      setCredential("");
      setState("saved");
      setMessage(success);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The request failed.");
    }
  };
  return (
    <section>
      <h2>AI</h2>
      <p>
        Provider: <strong>{data.ai.provider}</strong>
      </p>
      <p>
        Credential source: <strong>{data.ai.source}</strong>
      </p>
      <p>
        Credential status: <strong>{data.ai.configured ? "Configured" : "Not configured"}</strong>
      </p>
      <p>
        Verification: <strong>{data.ai.verificationStatus.replaceAll("_", " ")}</strong>
      </p>
      {data.ai.source === "settings" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              const result = await request("/api/settings/ai/credential", "PUT", { credential });
              onChange({
                ...data,
                ai: { ...data.ai, configured: true, verificationStatus: "unverified" },
              });
              return result;
            }, "Credential saved and cleared from the form.");
          }}
        >
          <label htmlFor="provider-credential">Synthetic fake-provider credential</label>
          <input
            autoComplete="off"
            id="provider-credential"
            onChange={(event) => {
              setCredential(event.target.value);
            }}
            required
            type="password"
            value={credential}
          />
          <div className="button-row">
            <button type="submit">
              {data.ai.configured ? "Replace credential" : "Add credential"}
            </button>
            <button
              className="secondary"
              disabled={!data.ai.configured}
              onClick={() => {
                void act(
                  () => request("/api/settings/ai/test", "POST"),
                  "Fake-provider connection verified.",
                );
              }}
              type="button"
            >
              Test connection
            </button>
            <button
              className="danger"
              disabled={!data.ai.configured}
              onClick={() => {
                void act(async () => {
                  const result = await request("/api/settings/ai/credential", "DELETE");
                  onChange({
                    ...data,
                    ai: { ...data.ai, configured: false, verificationStatus: "unconfigured" },
                  });
                  return result;
                }, "Credential removed.");
              }}
              type="button"
            >
              Remove
            </button>
          </div>
        </form>
      ) : (
        <p>The environment-managed credential is read-only and is never returned to this page.</p>
      )}
    </section>
  );
};

const PrioritizationSection = ({
  data,
  hasUnsavedChanges,
  onChange,
  onDirty,
  onSave,
  setMessage,
  setState,
}: {
  data: SettingsData;
  hasUnsavedChanges: boolean;
  onChange: (value: SettingsData) => void;
  onDirty: () => void;
  onSave: (url: string, value: unknown) => Promise<Record<string, unknown> | null>;
  setMessage: (value: string) => void;
  setState: (value: SaveState) => void;
}) => {
  const [automationRunning, setAutomationRunning] = useState<"daily" | "weekly" | null>(null);
  const update = (key: keyof SettingsData["prioritization"], value: number | boolean) => {
    onChange({ ...data, prioritization: { ...data.prioritization, [key]: value } });
    onDirty();
  };
  const runAutomation = async (kind: "daily" | "weekly") => {
    if (
      kind === "weekly" &&
      !window.confirm(
        "Run weekly planning now? Unlocked incomplete Today and This Week tasks will be re-prioritised.",
      )
    )
      return;
    setAutomationRunning(kind);
    setState("idle");
    setMessage(`${kind === "weekly" ? "Weekly" : "Daily"} planning is running…`);
    try {
      const result = await request("/api/planning/run", "POST", { kind });
      setMessage(automationRunMessage(result, kind));
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to run planning.");
    } finally {
      setAutomationRunning(null);
    }
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave("/api/settings/prioritization", data.prioritization);
      }}
    >
      <h2>Prioritisation</h2>
      <div className="field-grid">
        <label>
          Planning buffer (%)
          <input
            max="50"
            min="0"
            onChange={(e) => {
              update("planningBufferPercent", Number(e.target.value));
            }}
            type="number"
            value={data.prioritization.planningBufferPercent}
          />
        </label>
        <label>
          Deadline horizon (days)
          <input
            max="90"
            min="1"
            onChange={(e) => {
              update("deadlineRiskHorizonDays", Number(e.target.value));
            }}
            type="number"
            value={data.prioritization.deadlineRiskHorizonDays}
          />
        </label>
        <label>
          Large daily quota
          <input
            max="20"
            min="0"
            onChange={(e) => {
              update("dailyLargeQuota", Number(e.target.value));
            }}
            type="number"
            value={data.prioritization.dailyLargeQuota}
          />
        </label>
        <label>
          Medium daily quota
          <input
            max="20"
            min="0"
            onChange={(e) => {
              update("dailyMediumQuota", Number(e.target.value));
            }}
            type="number"
            value={data.prioritization.dailyMediumQuota}
          />
        </label>
        <label>
          Small daily quota
          <input
            max="20"
            min="0"
            onChange={(e) => {
              update("dailySmallQuota", Number(e.target.value));
            }}
            type="number"
            value={data.prioritization.dailySmallQuota}
          />
        </label>
      </div>
      {[
        ["allowMissingSizeSubstitution", "Allow missing-size substitution"],
        ["allowFinalTaskOverflow", "Allow a final weekly overflow task"],
        ["manualTodayCarryover", "Keep manually placed Today tasks"],
        ["dailyBufferEnabled", "Apply buffer to daily capacity"],
        ["aiTieBreakingEnabled", "Enable AI tie-breaking"],
        ["businessValueInfluenceEnabled", "Allow business value in the lowest priority band"],
        ["weeklyAutomationEnabled", "Enable weekly automation"],
        ["dailyAutomationEnabled", "Enable daily automation"],
      ].map(([key, label]) => (
        <label className="check-row" key={key}>
          <input
            checked={Boolean(data.prioritization[key as keyof typeof data.prioritization])}
            onChange={(e) => {
              update(key as keyof typeof data.prioritization, e.target.checked);
            }}
            type="checkbox"
          />
          {label}
        </label>
      ))}
      <button type="submit">Save Prioritisation</button>
      <section aria-labelledby="manual-automation-heading" className="settings-automation">
        <h3 id="manual-automation-heading">Run an automation now</h3>
        <p>
          Run planning immediately using the last saved working-time and prioritisation settings.
        </p>
        <div className="button-row">
          <button
            disabled={automationRunning !== null || hasUnsavedChanges}
            onClick={() => void runAutomation("daily")}
            type="button"
          >
            {automationRunning === "daily" ? "Running daily planning…" : "Run daily planning now"}
          </button>
          <button
            className="secondary"
            disabled={automationRunning !== null || hasUnsavedChanges}
            onClick={() => void runAutomation("weekly")}
            type="button"
          >
            {automationRunning === "weekly"
              ? "Running weekly planning…"
              : "Run weekly planning now"}
          </button>
        </div>
        {automationRunning === null ? null : (
          <p aria-live="assertive" className="automation-progress" role="status">
            {data.ai.configured ? "Waiting for LLM response…" : "Running deterministic planning…"}
          </p>
        )}
        {hasUnsavedChanges ? (
          <p className="interaction-hint">Save your prioritisation changes before running.</p>
        ) : null}
      </section>
    </form>
  );
};

const SecuritySection = ({
  setMessage,
  setState,
}: {
  setMessage: (value: string) => void;
  setState: (value: SaveState) => void;
}) => {
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void request("/api/settings/security", "GET")
      .then(setInfo)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Unable to load security status.");
      });
  }, [setMessage]);
  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    setState("saving");
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await request("/api/auth/password", "POST", {
        currentPassword: values.get("currentPassword"),
        newPassword: values.get("newPassword"),
        newPasswordConfirmation: values.get("newPasswordConfirmation"),
      });
      form.reset();
      setState("saved");
      setMessage("Password changed and all sessions rotated or revoked.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to change password.");
    }
  };
  return (
    <section>
      <h2>Security</h2>
      {info ? (
        <dl className="security-summary">
          <dt>Username</dt>
          <dd>{String(info.username)}</dd>
          <dt>Password changed</dt>
          <dd>{new Date(String(info.passwordChangedAt)).toLocaleString()}</dd>
          <dt>Other active sessions</dt>
          <dd>{String(info.otherActiveSessionCount)}</dd>
        </dl>
      ) : (
        <p>Loading security status…</p>
      )}
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <h3>Change password</h3>
        <label>
          Current password
          <input autoComplete="current-password" name="currentPassword" required type="password" />
        </label>
        <label>
          New password
          <input
            autoComplete="new-password"
            minLength={12}
            name="newPassword"
            required
            type="password"
          />
        </label>
        <label>
          Confirm new password
          <input
            autoComplete="new-password"
            minLength={12}
            name="newPasswordConfirmation"
            required
            type="password"
          />
        </label>
        <button type="submit">Change password</button>
      </form>
      <button
        className="secondary"
        onClick={() => {
          void (async () => {
            setState("saving");
            try {
              const result = await request("/api/auth/sessions/revoke-others", "POST");
              setState("saved");
              setMessage(`${String(result.revokedCount)} other session(s) logged out.`);
            } catch (error) {
              setState("error");
              setMessage(error instanceof Error ? error.message : "Unable to revoke sessions.");
            }
          })();
        }}
        type="button"
      >
        Log out other sessions
      </button>
    </section>
  );
};
