// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GanttChart } from "./gantt-chart";
import type { Project, Task } from "./workspace-types";

const project = {
  archivedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  description: null,
  id: "project",
  llmLink: null,
  name: "Launch project",
  notes: { content: [], type: "doc" },
  priorityLevel: 4,
  stageId: "stage",
  stageName: "Planned",
  version: 1,
} satisfies Project;

const task = {
  allocatedHours: 4,
  businessValueRationale: null,
  businessValueScore: 70,
  checklist: [{ completed: true, id: "item", label: "Draft", position: 0 }],
  createdAt: "2026-08-01T00:00:00.000Z",
  definitionOfDone: null,
  dueDate: "2026-08-12",
  hoursSpent: 1,
  hoursLeft: 3,
  id: "task",
  manualLanePosition: 1,
  lastPlannedAt: null,
  lastPlannedBy: null,
  notes: { content: [], type: "doc" },
  projectId: project.id,
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
  title: "Prepare launch",
  valueAdd: null,
  valueSource: "owner",
  version: 1,
  workDescription: null,
  workflowLane: "inbox",
} satisfies Task;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GanttChart", () => {
  it("uses allocated hours ending at the due date and renders exact calendar windows", async () => {
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    const user = userEvent.setup();
    render(
      <GanttChart
        projectMetrics={{
          project: {
            allocatedHours: 4,
            endDate: "2026-08-12",
            hoursSpent: 1,
            progressPercent: 50,
            startDate: "2026-08-10",
          },
        }}
        projects={[project]}
        tasks={[
          task,
          {
            ...task,
            allocatedHours: null,
            id: "completed-task",
            title: "Completed task",
            workflowLane: "done",
          },
        ]}
      />,
    );

    expect(screen.getByTitle(/Prepare launch:.*4h allocated/iu)).toHaveStyle({
      width: "7.33333px",
    });
    await user.selectOptions(screen.getByLabelText("Scale"), "day");
    fireEvent.change(screen.getByLabelText("Selected date"), { target: { value: "2026-08-12" } });
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("24:00")).toBeInTheDocument();
    expect(screen.getByTitle(/Prepare launch:.*4h allocated/iu)).toHaveStyle({ width: "208px" });
    await user.click(screen.getByRole("button", { name: "Next time window" }));

    await user.selectOptions(screen.getByLabelText("Scale"), "week");
    expect(screen.getByText(/Monday/iu)).toBeInTheDocument();
    expect(screen.getByText(/Sunday/iu)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous time window" }));

    await user.selectOptions(screen.getByLabelText("Scale"), "month");
    expect(screen.getByText("31 Mon")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next time window" }));

    await user.selectOptions(screen.getByLabelText("Scale"), "year");
    expect(screen.getByText("January")).toBeInTheDocument();
    expect(screen.getByText("December")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous time window" }));

    await user.selectOptions(screen.getByLabelText("Scale"), "period");
    expect(screen.getByLabelText("Period start")).toBeInTheDocument();
    expect(screen.getByLabelText("Period end")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(screen.getByRole("button", { name: "Previous time window" }));
    await user.click(screen.getByRole("button", { name: "Next time window" }));
    expect(scrollTo).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Projects" }));
    expect(screen.getByTitle(/Launch project:/iu)).toBeInTheDocument();
  });

  it("shows an empty schedule when a project has no derived dates", () => {
    render(
      <GanttChart projectMetrics={{}} projects={[project]} tasks={[]} initialMode="projects" />,
    );
    expect(screen.getByText("No scheduled projects to display.")).toBeInTheDocument();
  });

  it("uses a one-day project bar when only a start date exists and filters project tasks", () => {
    const rendered = render(
      <GanttChart
        initialMode="projects"
        projectId={project.id}
        projectMetrics={{
          project: {
            allocatedHours: 0,
            endDate: null,
            hoursSpent: 0,
            progressPercent: 0,
            startDate: "2026-08-10",
          },
        }}
        projects={[project]}
        showModeSwitch={false}
        tasks={[task]}
      />,
    );
    expect(screen.getByTitle(/Launch project:/iu)).toBeInTheDocument();
    expect(rendered.container).not.toHaveTextContent("Tasks");
  });

  it("persists task and project bar drags with explicit times", async () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ moved: true }), { status: 200 })),
      );
    const onChanged = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <GanttChart
        onChanged={onChanged}
        projectMetrics={{
          project: {
            allocatedHours: 4,
            endDate: "2026-08-11",
            hoursSpent: 1,
            progressPercent: 25,
            startDate: "2026-08-11",
          },
        }}
        projects={[project]}
        tasks={[
          {
            ...task,
            dueDate: "2026-08-11",
            endTime: "14:00",
            startDate: "2026-08-11",
            startTime: "10:00",
          },
        ]}
        workingDays={[{ enabled: true, endTime: "17:00", startTime: "09:00", weekday: "monday" }]}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Scale"), "day");
    fireEvent.change(screen.getByLabelText("Selected date"), {
      target: { value: "2026-08-11" },
    });
    const taskBar = screen.getByTitle(/Prepare launch:.*10:00.*14:00/iu);
    fireEvent.pointerDown(taskBar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(taskBar, { clientX: 152, pointerId: 1 });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task/schedule",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await user.selectOptions(screen.getByLabelText("Scale"), "week");
    await user.click(screen.getByRole("button", { name: "Projects" }));
    const projectBar = screen.getByTitle(/Launch project:/iu);
    fireEvent.pointerDown(projectBar, { clientX: 100, pointerId: 2 });
    fireEvent.pointerUp(projectBar, { clientX: 107, pointerId: 2 });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/project/schedule",
        expect.objectContaining({ method: "POST" }),
      );
      expect(onChanged).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("Schedule updated within working hours.")).toBeInTheDocument();
  });

  it("reports a failed drag and ignores a zero-distance drag", async () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Synthetic scheduling failure."));
    render(<GanttChart projectMetrics={{}} projects={[]} tasks={[task]} />);
    const bar = screen.getByTitle(/Prepare launch:/iu);
    fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerDown(bar, { clientX: 100, pointerId: 2 });
    fireEvent.pointerUp(bar, { clientX: 144, pointerId: 2 });
    expect(await screen.findByText("Synthetic scheduling failure.")).toBeInTheDocument();
  });

  it("opens a task bar on click without changing its schedule", () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const onOpenEntity = vi.fn();
    render(
      <GanttChart onOpenEntity={onOpenEntity} projectMetrics={{}} projects={[]} tasks={[task]} />,
    );
    const bar = screen.getByTitle(/Prepare launch:/iu);
    fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 100, pointerId: 1 });
    expect(onOpenEntity).toHaveBeenCalledWith({ id: "task", type: "task" });
    fireEvent.keyDown(bar, { key: "Enter" });
    expect(onOpenEntity).toHaveBeenCalledTimes(2);
  });
});
