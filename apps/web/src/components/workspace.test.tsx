// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { taskDeadlineVisual, Workspace } from "./workspace";
import type { Task, WorkspaceData } from "./workspace-types";

const task = {
  allocatedHours: 3,
  businessValueRationale: "Protects the launch date.",
  businessValueScore: 80,
  checklist: [],
  createdAt: "2026-08-05",
  definitionOfDone: null,
  dueDate: "2026-08-14",
  hoursSpent: 2,
  hoursLeft: 1,
  id: "task",
  manualLanePosition: 1,
  lastPlannedAt: null,
  lastPlannedBy: null,
  notes: { content: [], type: "doc" },
  projectId: "project",
  plannedDate: null,
  plannedEndTime: null,
  plannedStartTime: null,
  planningEligible: true,
  planningRationale: null,
  planningScore: null,
  requiresBreakdown: false,
  scheduleLocked: false,
  size: "medium",
  sizeManualOverride: false,
  startDate: "2026-08-10",
  title: "Synthetic task",
  valueAdd: null,
  valueSource: "owner",
  version: 1,
  workDescription: null,
  workflowLane: "inbox",
} satisfies Task;

const unrelatedTask = {
  ...task,
  id: "unrelated",
  projectId: null,
  title: "Unrelated task",
} satisfies Task;

const initial = {
  blockerCounts: {},
  dependencies: [],
  entityDependencies: [],
  projectDependencies: [],
  projectMetrics: {
    project: {
      allocatedHours: 3,
      endDate: "2026-08-14",
      hoursSpent: 2,
      progressPercent: 0,
      startDate: "2026-08-10",
    },
  },
  projects: [
    {
      archivedAt: null,
      createdAt: "2026-08-05",
      description: null,
      id: "project",
      llmLink: null,
      name: "Synthetic project",
      notes: { content: [], type: "doc" },
      priorityLevel: 4,
      stageId: "stage",
      stageName: "Planned",
      version: 1,
    },
  ],
  sort: "manual",
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
  tasks: [task, unrelatedTask],
} satisfies WorkspaceData;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Workspace", () => {
  it("progressively highlights approaching deadlines and darkens overdue work", () => {
    const now = Date.parse("2026-08-11T12:00:00.000Z");
    expect(taskDeadlineVisual({ dueDate: null, workflowLane: "inbox" }, now)).toEqual({
      color: null,
      overdue: false,
    });
    expect(taskDeadlineVisual({ dueDate: "2026-11-01", workflowLane: "inbox" }, now)).toEqual({
      color: "#edf3ef",
      overdue: false,
    });
    expect(taskDeadlineVisual({ dueDate: "2026-08-20", workflowLane: "inbox" }, now).color).toMatch(
      /^hsl/u,
    );
    expect(taskDeadlineVisual({ dueDate: "2026-09-25", workflowLane: "inbox" }, now).color).toMatch(
      /^color-mix/iu,
    );
    expect(taskDeadlineVisual({ dueDate: "2026-08-10", workflowLane: "inbox" }, now)).toEqual({
      color: "#ff453a",
      overdue: true,
    });
    expect(taskDeadlineVisual({ dueDate: "2026-08-10", workflowLane: "done" }, now)).toEqual({
      color: null,
      overdue: false,
    });
    expect(taskDeadlineVisual({ dueDate: "2026-08-10", workflowLane: "cancelled" }, now)).toEqual({
      color: null,
      overdue: false,
    });
  });

  it("renders one Today lane and compact cards with the requested summary fields", () => {
    render(<Workspace initial={initial} />);

    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Today 3" })).not.toBeInTheDocument();
    const taskCard = screen.getByRole("button", { name: "Task: Synthetic task" });
    expect(within(taskCard).getByText("80")).toBeInTheDocument();
    expect(within(taskCard).getByText("2026-08-14")).toBeInTheDocument();
    expect(within(taskCard).getByText("1h left")).toBeInTheDocument();
    expect(within(taskCard).getByText("medium")).toBeInTheDocument();
    expect(within(taskCard).queryByRole("button")).not.toBeInTheDocument();

    const projectCard = screen.getByRole("button", { name: "Project: Synthetic project" });
    expect(within(projectCard).getByText("2h")).toBeInTheDocument();
    expect(within(projectCard).getByText("High priority")).toBeInTheDocument();
  });

  it("starts condensed, collapses completed lanes, and combines project and task searches", async () => {
    const user = userEvent.setup();
    const seedProject = initial.projects[0];
    if (seedProject === undefined) throw new Error("Expected a seed project.");
    const clientProject = {
      ...seedProject,
      clientName: "ACME Ltd",
      id: "client-project",
      name: "Client launch",
      priorityLevel: 4,
      status: "at_risk" as const,
    };
    const clientTask = {
      ...task,
      clientName: "ACME Ltd",
      id: "client-task",
      projectId: clientProject.id,
      priorityLevel: 5,
      size: "large" as const,
      status: "in_progress" as const,
      title: "Large client task",
    };
    const doneTask = {
      ...task,
      id: "done-task",
      title: "Finished work",
      workflowLane: "done" as const,
    };
    render(
      <Workspace
        initial={{
          ...initial,
          clientNames: ["ACME Ltd"],
          projects: [...initial.projects, clientProject],
          tasks: [task, unrelatedTask, clientTask, doneTask],
        }}
      />,
    );

    expect(screen.getByLabelText("Project stages")).toHaveClass("kanban-board--condensed");
    expect(screen.getByLabelText("Global task Kanban")).toHaveClass("kanban-board--condensed");
    expect(screen.queryByRole("button", { name: "Task: Finished work" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Task lane: Done" })).getByRole("button", {
        name: "Done",
      }),
    ).toHaveAttribute("aria-expanded", "false");

    await user.type(screen.getByLabelText("Search projects"), "ACME");
    await user.type(screen.getByLabelText("Search tasks"), "large");
    expect(screen.getByRole("button", { name: "Project: Client launch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Task: Large client task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Task: Synthetic task" })).not.toBeInTheDocument();
  });

  it("filters related cards with one click and clears selection by clicking outside", async () => {
    const user = userEvent.setup();
    render(<Workspace initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Project: Synthetic project" }));
    expect(screen.getByRole("button", { name: "Task: Synthetic task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Task: Unrelated task" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("heading", { name: "Tasks" }));
    expect(screen.getByRole("button", { name: "Task: Unrelated task" })).toBeInTheDocument();
  });

  it("opens task details on double click, saves all card fields, and can delete", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(initial), { status: 200 }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<Workspace initial={initial} />);

    await user.dblClick(screen.getByRole("button", { name: "Task: Synthetic task" }));
    expect(
      screen.getByRole("dialog", { name: "Task details: Synthetic task" }),
    ).toBeInTheDocument();
    const allocated = screen.getByLabelText("Allocated hours");
    await user.clear(allocated);
    await user.type(allocated, "4");
    await user.selectOptions(screen.getByLabelText("Task size"), "large");
    await user.click(screen.getByRole("button", { name: "Save task" }));
    const updateRequest = fetchMock.mock.calls.find(([url]) => url === "/api/tasks/task");
    expect(updateRequest?.[1]).toMatchObject({ method: "PUT" });
    expect(updateRequest?.[1]?.body).toContain('"allocatedHours":4');

    await user.click(screen.getByRole("button", { name: "Delete task" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("creates a task with allocated hours and size and changes board sorting", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ...initial, sort: "greatest_value" }), { status: 200 }),
      );
    const user = userEvent.setup();
    render(<Workspace initial={initial} />);
    await user.click(
      within(screen.getByRole("region", { name: "Task lane: Inbox" })).getByRole("button", {
        name: "Add task to this stage",
      }),
    );
    await user.type(screen.getByLabelText("Task title"), "New task");
    await user.type(screen.getByLabelText("Allocated hours"), "5");
    expect(screen.getByLabelText("Task size")).toHaveValue("mega");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    const createRequest = fetchMock.mock.calls.find(([url]) => url === "/api/tasks");
    expect(createRequest?.[1]).toMatchObject({ method: "POST" });
    expect(createRequest?.[1]?.body).toContain('"allocatedHours":5');
    await user.selectOptions(screen.getByLabelText("Board order"), "greatest_value");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/workspace?sort=greatest_value",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("shows audit history and filters a type-ahead blocker list", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/api/tasks/task/audit"))
        return new Response(
          JSON.stringify([
            {
              action: "task.moved",
              actorName: "Owner",
              createdAt: "2026-08-11T10:00:00.000Z",
              id: "audit",
              metadata: { changes: { workflowLane: { from: "inbox", to: "today" } } },
            },
          ]),
          { status: 200 },
        );
      return new Response(JSON.stringify(initial), { status: 200 });
    });
    const user = userEvent.setup();
    render(<Workspace initial={initial} />);

    await user.dblClick(screen.getByRole("button", { name: "Task: Synthetic task" }));
    expect(await screen.findByText("Inbox → Today")).toBeInTheDocument();
    expect(screen.getByText("by Owner")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dependencies" }));
    expect(screen.queryByLabelText(/Search .* blockers/iu)).not.toBeInTheDocument();
    expect(screen.getByText("2 available blockers match these filters.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Same project only"));
    expect(screen.getByText("1 available blocker matches these filters.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Same project only"));
    const blocker = screen.getByRole("combobox", { name: "Add blocker" });
    await user.type(blocker, "Task · Unrelated task · Inbox");
    await user.click(screen.getByRole("button", { name: "Add dependency" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task/blockers",
      expect.objectContaining({
        body: JSON.stringify({ blockerId: "unrelated", blockerType: "task" }),
        method: "POST",
      }),
    );
  });
});
