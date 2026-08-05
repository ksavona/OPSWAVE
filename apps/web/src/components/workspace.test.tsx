// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Workspace } from "./workspace";

const initial = {
  projects: [
    {
      archivedAt: null,
      createdAt: "2026-08-05",
      description: null,
      id: "project",
      name: "Synthetic project",
      stageId: "stage",
      stageName: "Planned",
      version: 1,
    },
  ],
  sort: "manual" as const,
  stages: [
    {
      archivedAt: null,
      description: null,
      id: "stage",
      llmContext: null,
      name: "Planned",
      sequence: 0,
      version: 1,
    },
  ],
  tasks: [
    {
      allocatedHours: null,
      businessValueRationale: null,
      businessValueScore: 80,
      checklist: [],
      definitionOfDone: null,
      dueDate: null,
      id: "task",
      manualLanePosition: 1,
      projectId: "project",
      size: null,
      title: "Synthetic task",
      valueAdd: null,
      valueSource: "owner" as const,
      version: 1,
      workDescription: null,
      workflowLane: "inbox" as const,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Workspace", () => {
  it("renders the complete lane system and explains manual ordering", () => {
    render(<Workspace initial={initial} />);
    expect(screen.getByRole("heading", { name: "Today 3" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Manual order is persisted independently in every lane. Use the earlier/later controls to reorder a task.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Value 80/100")).toBeInTheDocument();
  });

  it("creates a task and changes board sorting through same-origin APIs", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ...initial, sort: "greatest_value" }), { status: 200 }),
      );
    const user = userEvent.setup();
    render(<Workspace initial={initial} />);
    await user.click(screen.getByRole("button", { name: "New task" }));
    await user.type(screen.getByLabelText("Task title"), "New task");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({ method: "POST" }),
    );
    await user.selectOptions(screen.getByLabelText("Board order"), "greatest_value");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/workspace?sort=greatest_value",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
