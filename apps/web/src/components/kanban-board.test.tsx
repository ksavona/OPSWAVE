// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KanbanBoard } from "./kanban-board";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("KanbanBoard", () => {
  it("keeps every card mounted while applying the condensed viewport", () => {
    render(
      <KanbanBoard className="task-board" condensed label="Test board">
        {Array.from({ length: 7 }, (_, index) => (
          <article key={index}>Card {String(index + 1)}</article>
        ))}
      </KanbanBoard>,
    );

    const board = screen.getByLabelText("Test board");
    expect(board).toHaveClass("kanban-board--condensed");
    expect(screen.getAllByText(/Card/iu)).toHaveLength(7);
  });

  it("pans from the empty board surface without intercepting draggable cards", () => {
    render(
      <KanbanBoard className="project-board" condensed={false} label="Test board">
        <div draggable>Card</div>
      </KanbanBoard>,
    );
    const board = screen.getByLabelText("Test board");
    board.scrollLeft = 200;
    board.setPointerCapture = vi.fn();

    fireEvent.pointerDown(board, { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(board, { clientX: 250, pointerId: 1 });
    expect(board.scrollLeft).toBe(250);

    fireEvent.pointerDown(screen.getByText("Card"), {
      button: 0,
      clientX: 200,
      pointerId: 2,
    });
    fireEvent.pointerMove(board, { clientX: 100, pointerId: 2 });
    expect(board.scrollLeft).toBe(250);
  });

  it("auto-scrolls every half second while a card stays at an edge", () => {
    vi.useFakeTimers();
    render(
      <KanbanBoard className="task-board" condensed label="Test board">
        <div>Lane</div>
      </KanbanBoard>,
    );
    const board = screen.getByLabelText("Test board");
    board.getBoundingClientRect = () =>
      ({ bottom: 500, height: 500, left: 100, right: 900, top: 0, width: 800 }) as DOMRect;
    Object.defineProperty(board, "clientWidth", { configurable: true, value: 800 });
    const scrollBy = vi.fn();
    board.scrollBy = scrollBy;

    const dragOver = (clientX: number) => {
      const event = new Event("dragover", { bubbles: true });
      Object.defineProperty(event, "clientX", { value: clientX });
      fireEvent(board, event);
    };
    dragOver(895);
    vi.advanceTimersByTime(500);
    expect(scrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 600 });

    dragOver(500);
    vi.advanceTimersByTime(1_000);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });
});
