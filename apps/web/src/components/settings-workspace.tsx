"use client";

import { useEffect, useMemo, useState, type SyntheticEvent } from "react";

type Section = "general" | "working-time" | "ai" | "prioritization" | "security";
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
    defaultKanbanSort: "greatest_value" | "manual" | "planning_priority";
    defaultLandingView: "projects";
    displayName: string;
    firstDayOfWeek: "monday";
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
  workingDays: { availableHours: number; enabled: boolean; weekday: string }[];
}

const sections: [Section, string][] = [
  ["general", "General"],
  ["working-time", "Working Time"],
  ["ai", "AI"],
  ["prioritization", "Prioritisation"],
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

export const SettingsWorkspace = ({ initial }: { initial: SettingsData }) => {
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
        {active === "ai" ? (
          <AiSection data={data} onChange={setData} setMessage={setMessage} setState={setState} />
        ) : null}
        {active === "prioritization" ? (
          <PrioritizationSection
            data={data}
            onChange={setData}
            onDirty={() => {
              setState("unsaved");
            }}
            onSave={save}
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
      void onSave("/api/settings/general", data.general);
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
      <p>Set available decimal hours independently. Disabled days contribute zero.</p>
      <div className="weekday-grid">
        {data.workingDays.map((day, index) => (
          <div className="weekday-row" key={day.weekday}>
            <label>
              <input
                checked={day.enabled}
                onChange={(event) => {
                  const days = [...data.workingDays];
                  days.splice(index, 1, { ...day, enabled: event.target.checked });
                  onChange({ ...data, workingDays: days });
                  onDirty();
                }}
                type="checkbox"
              />{" "}
              {day.weekday}
            </label>
            <input
              aria-label={`${day.weekday} available hours`}
              disabled={!day.enabled}
              max="24"
              min="0"
              onChange={(event) => {
                const days = [...data.workingDays];
                days.splice(index, 1, { ...day, availableHours: Number(event.target.value) });
                onChange({ ...data, workingDays: days });
                onDirty();
              }}
              step="0.25"
              type="number"
              value={day.availableHours}
            />
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
  onChange,
  onDirty,
  onSave,
}: {
  data: SettingsData;
  onChange: (value: SettingsData) => void;
  onDirty: () => void;
  onSave: (url: string, value: unknown) => Promise<Record<string, unknown> | null>;
}) => {
  const update = (key: keyof SettingsData["prioritization"], value: number | boolean) => {
    onChange({ ...data, prioritization: { ...data.prioritization, [key]: value } });
    onDirty();
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
