// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const initialize = vi.fn<(configuration: unknown) => void>();
const renderDiagram = vi.fn().mockResolvedValue({ svg: '<svg viewBox="0 0 10 10"></svg>' });

vi.mock("mermaid", () => ({
  default: { initialize, render: renderDiagram },
}));

import { MermaidDiagram } from "./mermaid-diagram";

describe("MermaidDiagram", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders Mermaid source as a strict dark SVG diagram", async () => {
    render(<MermaidDiagram definition={'flowchart LR\n  task_0["Task"]'} />);

    expect(
      await screen.findByRole("region", { name: "Rendered Mermaid dependency diagram" }),
    ).toContainHTML("<svg");
    expect(initialize.mock.calls[0]?.[0]).toMatchObject({
      darkMode: true,
      flowchart: { curve: "stepAfter" },
      securityLevel: "strict",
      theme: "dark",
    });
    expect(renderDiagram).toHaveBeenCalledWith(
      expect.stringMatching(/^opsweave-mermaid-/u),
      'flowchart LR\n  task_0["Task"]',
    );
  });

  it("finds successive matching nodes and changes zoom", async () => {
    renderDiagram.mockResolvedValueOnce({
      svg: '<svg><g class="node"><text>Alpha task</text></g><g class="node"><text>Alpha project</text></g></svg>',
    });
    HTMLElement.prototype.scrollBy = vi.fn();
    const user = userEvent.setup();
    render(<MermaidDiagram definition={'flowchart LR\n  task_0["Alpha task"]'} />);

    await screen.findByRole("region", { name: "Rendered Mermaid dependency diagram" });
    await user.type(screen.getByLabelText("Find in map"), "alpha");
    await user.click(screen.getByRole("button", { name: "Find" }));
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "125%" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByRole("button", { name: "100%" })).toBeInTheDocument();
  });

  it("fits below 100% by default and has no legacy 50–300% zoom clamp", async () => {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 232 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 132,
    });
    renderDiagram.mockResolvedValueOnce({ svg: '<svg viewBox="0 0 400 200"></svg>' });
    const user = userEvent.setup();
    try {
      render(<MermaidDiagram definition={'flowchart LR\n  task_0["Large map"]'} />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "50%" })).toBeInTheDocument();
      });
      for (let index = 0; index < 10; index += 1)
        await user.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(
        Number.parseFloat(screen.getByTitle("Fit diagram to the available space").textContent),
      ).toBeGreaterThan(300);
      for (let index = 0; index < 22; index += 1)
        await user.click(screen.getByRole("button", { name: "Zoom out" }));
      expect(
        Number.parseFloat(screen.getByTitle("Fit diagram to the available space").textContent),
      ).toBeLessThan(50);
    } finally {
      if (width === undefined)
        delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
      else Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
      if (height === undefined)
        delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
      else Object.defineProperty(HTMLElement.prototype, "clientHeight", height);
    }
  });

  it("reports rendering failures without exposing parser details", async () => {
    renderDiagram.mockRejectedValueOnce(new Error("private Mermaid parser detail"));
    render(<MermaidDiagram definition="invalid" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The dependency diagram could not be rendered.",
    );
    expect(document.body).not.toHaveTextContent("private Mermaid parser detail");
  });

  it("handles empty searches, pointer panning, and mouse-wheel zoom", async () => {
    renderDiagram.mockResolvedValueOnce({
      svg: '<svg><g class="node"><text>Only task</text></g></svg>',
    });
    const user = userEvent.setup();
    render(<MermaidDiagram definition={'flowchart LR\n  task_0["Only task"]'} />);
    const diagram = await screen.findByRole("region", {
      name: "Rendered Mermaid dependency diagram",
    });

    await user.click(screen.getByRole("button", { name: "Find" }));
    await user.type(screen.getByLabelText("Find in map"), "missing");
    await user.click(screen.getByRole("button", { name: "Find" }));
    expect(screen.queryByText(/of/iu)).not.toBeInTheDocument();

    fireEvent.pointerDown(diagram, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(diagram, { clientX: 5, clientY: 7, pointerId: 1 });
    expect(diagram.scrollLeft).toBe(15);
    expect(diagram.scrollTop).toBe(13);
    fireEvent.pointerUp(diagram, { pointerId: 1 });
    fireEvent.wheel(diagram, { clientX: 10, clientY: 10, deltaY: -100 });
    expect(screen.getByRole("button", { name: "115%" })).toBeInTheDocument();
  });

  it("opens mapped task nodes and project groups", async () => {
    renderDiagram.mockResolvedValueOnce({
      svg: '<svg><g id="flowchart-task_0-0"><rect/><text>Task</text></g><g id="group_0"><rect/><text>Project frame</text></g></svg>',
    });
    const onEntityOpen = vi.fn();
    const rendered = render(
      <MermaidDiagram
        definition={'flowchart LR\n  task_0["Task"]'}
        entities={[
          { entityId: "task-id", entityType: "task", mermaidId: "task_0" },
          { entityId: "project-id", entityType: "project", mermaidId: "group_0" },
        ]}
        onEntityOpen={onEntityOpen}
      />,
    );
    await screen.findByRole("region", { name: "Rendered Mermaid dependency diagram" });
    await waitFor(() => {
      expect(rendered.container.querySelector("#flowchart-task_0-0")).toHaveAttribute(
        "data-opsweave-entity-id",
        "task-id",
      );
    });
    const taskNode = rendered.container.querySelector("#flowchart-task_0-0 rect");
    const projectGroup = rendered.container.querySelector("#group_0 rect");
    if (taskNode === null || projectGroup === null)
      throw new Error("Expected clickable SVG nodes.");
    fireEvent.click(taskNode);
    fireEvent.click(projectGroup);
    fireEvent.keyDown(projectGroup.parentElement ?? projectGroup, { key: "Enter" });
    expect(onEntityOpen).toHaveBeenNthCalledWith(1, {
      entityId: "task-id",
      entityType: "task",
    });
    expect(onEntityOpen).toHaveBeenNthCalledWith(2, {
      entityId: "project-id",
      entityType: "project",
    });
    expect(onEntityOpen).toHaveBeenNthCalledWith(3, {
      entityId: "project-id",
      entityType: "project",
    });
  });
});
