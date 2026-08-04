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

  it("provides five sections and calculates raw/effective weekly capacity", async () => {
    render(<SettingsWorkspace initial={initial} />);
    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
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
    const mondayHours = screen.getByLabelText("monday available hours");
    await user.clear(mondayHours);
    await user.type(mondayHours, "6.5");
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
