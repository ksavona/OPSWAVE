// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsWorkspace } from "./settings-workspace";

const initial = {
  ai: {
    configured: true,
    provider: "fake",
    source: "settings" as const,
    verificationStatus: "unverified",
  },
  general: {
    dateDisplay: "iso" as const,
    defaultKanbanSort: "manual" as const,
    defaultLandingView: "projects" as const,
    displayName: "Synthetic workspace",
    firstDayOfWeek: "monday" as const,
    fullName: null,
    knownAs: [],
    timezone: "UTC",
    version: 1,
  },
  prioritization: {
    aiTieBreakingEnabled: false,
    allowFinalTaskOverflow: false,
    allowMissingSizeSubstitution: true,
    businessValueInfluenceEnabled: false,
    dailyAutomationEnabled: false,
    dailyBufferEnabled: false,
    dailyLargeQuota: 1,
    dailyMediumQuota: 2,
    dailySmallQuota: 3,
    deadlineRiskHorizonDays: 14,
    manualTodayCarryover: true,
    planningBufferPercent: 10,
    version: 1,
    weeklyAutomationEnabled: false,
  },
  workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
    (weekday, index) => ({ availableHours: index < 5 ? 8 : 0, enabled: index < 5, weekday }),
  ),
};

describe("SettingsWorkspace", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("provides six sections and calculates raw/effective weekly capacity", async () => {
    render(<SettingsWorkspace initial={initial} />);
    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Projects" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Working Time" }));
    expect(screen.getByText("40.00h")).toBeInTheDocument();
    expect(screen.getByText("36.00h")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("monday"));
    expect(screen.getByText("32.00h")).toBeInTheDocument();
  });

  it("shows only masked credential status and clears any possibility of server secret hydration", async () => {
    const rendered = render(<SettingsWorkspace initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByLabelText("Synthetic fake-provider credential")).toHaveValue("");
    expect(rendered.container.innerHTML).not.toContain("synthetic-valid-provider-secret");
  });

  it("shows the password-change and other-session controls", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          otherActiveSessionCount: 0,
          passwordChangedAt: new Date().toISOString(),
          username: "Synthetic-Owner",
        }),
        { status: 200 },
      ),
    );
    render(<SettingsWorkspace initial={initial} />);
    await userEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out other sessions" })).toBeInTheDocument();
  });

  it("saves General settings and reports optimistic conflicts safely", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 2 }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Settings changed in another session." }), {
          status: 409,
        }),
      );
    const user = userEvent.setup();
    render(<SettingsWorkspace initial={initial} />);
    await user.clear(screen.getByLabelText("Workspace name"));
    await user.type(screen.getByLabelText("Workspace name"), "Updated workspace");
    await user.selectOptions(screen.getByLabelText("Date display"), "locale");
    await user.type(screen.getByLabelText("Your full name"), "Alexandra Simões");
    await user.type(screen.getByLabelText("People also call you"), "Alex, Sandra");
    expect(screen.getByText("Unsaved changes.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save General settings" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/settings/general",
      expect.objectContaining({ method: "PUT" }),
    );
    await user.click(screen.getByRole("button", { name: "Save General settings" }));
    expect(await screen.findByText("Settings changed in another session.")).toBeInTheDocument();
  });

  it("edits and saves working-time and prioritisation controls", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ version: 2 }), { status: 200 }));
    const user = userEvent.setup();
    render(<SettingsWorkspace initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Working Time" }));
    await user.clear(screen.getByLabelText("monday start time"));
    await user.type(screen.getByLabelText("monday start time"), "08:00");
    await user.clear(screen.getByLabelText("monday end time"));
    await user.type(screen.getByLabelText("monday end time"), "14:30");
    const mondayHours = screen.getByLabelText("monday available hours");
    expect(mondayHours).toHaveTextContent("6.5h");
    await user.click(screen.getByRole("button", { name: "Save Working Time" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Prioritisation" }));
    await user.clear(screen.getByLabelText("Planning buffer (%)"));
    await user.type(screen.getByLabelText("Planning buffer (%)"), "20");
    await user.click(screen.getByLabelText("Enable AI tie-breaking"));
    await user.click(screen.getByRole("button", { name: "Save Prioritisation" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("runs daily and weekly planning manually from Prioritisation settings", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_url, request) => {
      const body = request?.body;
      if (typeof body !== "string") throw new Error("Expected a JSON request body.");
      const kind = JSON.parse(body) as { kind: "daily" | "weekly" };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            completed: true,
            result:
              kind.kind === "daily"
                ? {
                    candidateCount: 0,
                    llmUsed: false,
                    selectedCount: 0,
                    skippedReasonCounts: { blocked: 97, requires_breakdown: 1 },
                  }
                : {
                    candidateCount: 4,
                    llmUsed: true,
                    selectedCount: 2,
                    skippedReasonCounts: { blocked: 3 },
                  },
          }),
          { status: 200 },
        ),
      );
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<SettingsWorkspace initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Prioritisation" }));

    await user.click(screen.getByRole("button", { name: "Run daily planning now" }));
    expect(
      await screen.findByText(/The LLM was not called because there were no eligible candidates/u),
    ).toHaveTextContent("97 blocked by unfinished dependencies");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/planning/run",
      expect.objectContaining({ body: JSON.stringify({ kind: "daily" }), method: "POST" }),
    );

    await user.click(screen.getByRole("button", { name: "Run weekly planning now" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(await screen.findByText(/2 tasks were moved to This Week/u)).toHaveTextContent(
      "The LLM ranked 4 eligible tasks",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/planning/run",
      expect.objectContaining({ body: JSON.stringify({ kind: "weekly" }), method: "POST" }),
    );
  });

  it("explains, edits, and saves collaboration feature gates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          flags: {
            complianceMonitorEnabled: true,
            delegateUploadsEnabled: true,
            invitationEmailEnabled: true,
            multiUserEnabled: true,
          },
        }),
        { status: 200 },
      ),
    );
    const user = userEvent.setup();
    render(
      <SettingsWorkspace
        initial={initial}
        initialCollaboration={{
          complianceMonitorEnabled: false,
          delegateUploadsEnabled: false,
          invitationEmailEnabled: false,
          multiUserEnabled: false,
        }}
        initialCollaborationRuntime={{
          email: {
            configured: false,
            endpoint: null,
            source: "settings",
            tokenConfigured: false,
            updatedAt: null,
          },
          invitationEncryptionReady: true,
          malwareScanner: { configured: true, mode: "clamav" },
          publicBaseUrl: "https://kanban.example.test",
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Collaboration" }));

    expect(screen.getByText("https://kanban.example.test")).toBeInTheDocument();
    expect(screen.getByText("Ready · ClamAV")).toBeInTheDocument();
    expect(screen.getByLabelText("Help: delegate uploads")).toHaveTextContent(
      "rejected if the scanner cannot produce a clean result",
    );
    const gates = screen.getAllByRole("checkbox");
    expect(gates).toHaveLength(4);
    for (const gate of gates) await user.click(gate);
    expect(screen.getByText("Unsaved changes.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save Collaboration settings" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/collaboration",
      expect.objectContaining({
        body: JSON.stringify({
          complianceMonitorEnabled: true,
          delegateUploadsEnabled: true,
          invitationEmailEnabled: true,
          multiUserEnabled: true,
        }),
        method: "PUT",
      }),
    );
  });

  it("stores and removes workspace email delivery without exposing its token", async () => {
    const configuredRuntime = {
      email: {
        configured: true,
        endpoint: "https://mailer.example.test/opsweave",
        source: "settings" as const,
        tokenConfigured: true,
        updatedAt: "2026-08-21T06:00:00.000Z",
      },
      invitationEncryptionReady: true,
      malwareScanner: { configured: true, mode: "webhook" as const },
      publicBaseUrl: "https://kanban.example.test",
    };
    const removedRuntime = {
      ...configuredRuntime,
      email: {
        configured: false,
        endpoint: null,
        source: "settings" as const,
        tokenConfigured: false,
        updatedAt: null,
      },
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(configuredRuntime), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(removedRuntime), { status: 200 }));
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const user = userEvent.setup();
    render(<SettingsWorkspace initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Collaboration" }));

    await user.type(
      screen.getByLabelText("HTTPS delivery endpoint"),
      "https://mailer.example.test/opsweave",
    );
    await user.type(screen.getByLabelText(/Bearer token/u), "synthetic-secret");
    await user.click(screen.getByRole("button", { name: "Save email delivery" }));
    expect(await screen.findByText("Status: configured via settings")).toBeInTheDocument();
    expect(screen.getByLabelText(/Bearer token/u)).toHaveValue("");
    expect(document.body.innerHTML).not.toContain("synthetic-secret");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/settings/collaboration/email",
      expect.objectContaining({
        body: JSON.stringify({
          endpoint: "https://mailer.example.test/opsweave",
          token: "synthetic-secret",
        }),
        method: "PUT",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Remove email delivery" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Remove email delivery" }));
    expect(await screen.findByText("Status: not configured")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/settings/collaboration/email",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("keeps environment-managed email delivery read-only", async () => {
    const user = userEvent.setup();
    render(
      <SettingsWorkspace
        initial={initial}
        initialCollaborationRuntime={{
          email: {
            configured: true,
            endpoint: "https://mailer.example.test/environment",
            source: "environment",
            tokenConfigured: false,
            updatedAt: null,
          },
          invitationEncryptionReady: false,
          malwareScanner: { configured: true, mode: "webhook" },
          publicBaseUrl: null,
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Collaboration" }));

    expect(screen.getByText("Ready · webhook")).toBeInTheDocument();
    expect(screen.getAllByText("Not configured", { selector: "strong" })).toHaveLength(2);
    expect(screen.getByLabelText("HTTPS delivery endpoint")).toBeDisabled();
    expect(screen.getByLabelText(/Bearer token/u)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save email delivery" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Remove email delivery" })).not.toBeInTheDocument();
  });

  it("reports collaboration and email delivery failures safely", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Collaboration service unavailable." }), {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 }));
    const user = userEvent.setup();
    render(<SettingsWorkspace initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Collaboration" }));
    await user.click(screen.getByRole("button", { name: "Save Collaboration settings" }));
    expect(await screen.findByText("Collaboration service unavailable.")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("HTTPS delivery endpoint"),
      "https://mailer.example.test/opsweave",
    );
    await user.click(screen.getByRole("button", { name: "Save email delivery" }));
    expect(await screen.findByText("The request failed.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows when a manual run is waiting for an LLM response", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const user = userEvent.setup();
    render(
      <SettingsWorkspace
        initial={{
          ...initial,
          ai: { ...initial.ai, configured: true, provider: "openai", source: "environment" },
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Prioritisation" }));
    await user.click(screen.getByRole("button", { name: "Run daily planning now" }));
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for LLM response…");
    resolveRequest?.(
      new Response(JSON.stringify({ completed: true, result: null }), { status: 200 }),
    );
    expect(await screen.findByText("Daily planning completed.")).toBeInTheDocument();
  });

  it("requires prioritisation settings to be saved before a manual run", async () => {
    render(<SettingsWorkspace initial={initial} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Prioritisation" }));
    await user.clear(screen.getByLabelText("Planning buffer (%)"));
    await user.type(screen.getByLabelText("Planning buffer (%)"), "15");

    expect(screen.getByRole("button", { name: "Run daily planning now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run weekly planning now" })).toBeDisabled();
    expect(screen.getByText("Save your prioritisation changes before running.")).toBeVisible();
  });

  it("adds, tests, and removes a settings-managed credential without retaining plaintext", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        Promise.resolve(new Response(JSON.stringify({ status: "verified" }), { status: 200 })),
      );
    const user = userEvent.setup();
    const unconfigured = {
      ...initial,
      ai: { ...initial.ai, configured: false, verificationStatus: "unconfigured" },
    };
    render(<SettingsWorkspace initial={unconfigured} />);
    await user.click(screen.getByRole("button", { name: "AI" }));
    const credential = screen.getByLabelText("Synthetic fake-provider credential");
    await user.type(credential, "synthetic-valid-provider-secret");
    await user.click(screen.getByRole("button", { name: "Add credential" }));
    await waitFor(() => {
      expect(credential).toHaveValue("");
    });
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(document.body.innerHTML).not.toContain("synthetic-valid-provider-secret");
  });

  it("renders environment-managed credentials as read-only", async () => {
    render(
      <SettingsWorkspace
        initial={{ ...initial, ai: { ...initial.ai, provider: "openai", source: "environment" } }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByText(/environment-managed credential is read-only/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Synthetic fake-provider credential")).not.toBeInTheDocument();
  });

  it("changes the password and revokes other sessions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (url === "/api/settings/security") {
        return new Response(
          JSON.stringify({
            otherActiveSessionCount: 2,
            passwordChangedAt: "2026-08-04T12:00:00.000Z",
            username: "Synthetic-Owner",
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify(url === "/api/auth/sessions/revoke-others" ? { revokedCount: 2 } : {}),
        { status: 200 },
      );
    });
    const user = userEvent.setup();
    render(<SettingsWorkspace initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Security" }));
    expect(await screen.findByText("Synthetic-Owner")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Current password"), "synthetic old password");
    await user.type(screen.getByLabelText("New password"), "synthetic new password");
    await user.type(screen.getByLabelText("Confirm new password"), "synthetic new password");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log out other sessions" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
