"use client";

import { useEffect, useRef, type DragEvent, type PointerEvent, type ReactNode } from "react";

const EDGE_SIZE = 44;
const EDGE_INTERVAL_MS = 500;

interface KanbanBoardProps {
  children: ReactNode;
  className: string;
  condensed: boolean;
  label: string;
}

/** Shared horizontal viewport behavior for project and task Kanban boards. */
export const KanbanBoard = ({ children, className, condensed, label }: KanbanBoardProps) => {
  const viewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{ pointerId: number; scrollLeft: number; startX: number } | null>(null);
  const edgeDirection = useRef<-1 | 0 | 1>(0);
  const edgeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopEdgeScroll = () => {
    edgeDirection.current = 0;
    if (edgeTimer.current !== null) clearInterval(edgeTimer.current);
    edgeTimer.current = null;
  };

  useEffect(() => stopEdgeScroll, []);

  const updateEdgeScroll = (event: DragEvent<HTMLDivElement>) => {
    const element = viewport.current;
    if (element === null) return;
    const bounds = element.getBoundingClientRect();
    const nextDirection: -1 | 0 | 1 =
      event.clientX <= bounds.left + EDGE_SIZE
        ? -1
        : event.clientX >= bounds.right - EDGE_SIZE
          ? 1
          : 0;
    if (nextDirection === edgeDirection.current) return;
    stopEdgeScroll();
    if (nextDirection === 0) return;
    edgeDirection.current = nextDirection;
    edgeTimer.current = setInterval(() => {
      element.scrollBy({
        behavior: "smooth",
        left: edgeDirection.current * Math.max(240, element.clientWidth * 0.75),
      });
    }, EDGE_INTERVAL_MS);
  };

  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,a,[draggable='true']") !== null) return;
    pan.current = {
      pointerId: event.pointerId,
      scrollLeft: event.currentTarget.scrollLeft,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.button === 1) event.preventDefault();
  };

  return (
    <div
      aria-label={label}
      className={`${className} kanban-board${condensed ? " kanban-board--condensed" : " kanban-board--expanded"}`}
      onDragEnd={stopEdgeScroll}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) stopEdgeScroll();
      }}
      onDragOver={updateEdgeScroll}
      onDrop={stopEdgeScroll}
      onPointerCancel={() => {
        pan.current = null;
      }}
      onPointerDown={beginPan}
      onPointerMove={(event) => {
        const started = pan.current;
        if (started?.pointerId !== event.pointerId) return;
        event.currentTarget.scrollLeft = started.scrollLeft - (event.clientX - started.startX);
      }}
      onPointerUp={(event) => {
        if (pan.current?.pointerId === event.pointerId) pan.current = null;
      }}
      ref={viewport}
    >
      {children}
    </div>
  );
};
