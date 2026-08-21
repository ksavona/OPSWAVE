"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { Project, ProjectMetrics, Task } from "./workspace-types";
import type { WorkspaceData } from "./workspace-types";
import { DelegationIndicator, type DelegateTooltipView } from "./delayed-tooltip";
import { workspaceRequest } from "./workspace-api";

type GanttMode = "projects" | "tasks";
type GanttScale = "day" | "week" | "month" | "year" | "period";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const dateValue = (value: string): number => Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
const addDays = (value: number, days: number): number => value + days * DAY_MS;
const utcDate = (value: number): Date => new Date(value);
const startOfWeek = (value: number): number => {
  const date = utcDate(value);
  return addDays(value, -((date.getUTCDay() + 6) % 7));
};
const addCalendarMonths = (value: number, amount: number): number => {
  const date = utcDate(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1);
};
const formatDateTime = (value: number): string =>
  new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(utcDate(value));

interface GanttItem {
  allocatedHours: number | null;
  delegates: readonly DelegateTooltipView[];
  end: number;
  id: string;
  itemType: "project" | "task";
  label: string;
  progress: number;
  start: number;
  version: number;
}

interface TimelineTick {
  label: string;
  left: number;
}

const taskSchedule = (task: Task): Pick<GanttItem, "allocatedHours" | "end" | "start"> | null => {
  const allocatedHours = task.allocatedHours ?? 1;
  const duration = Math.max(0.25, allocatedHours) * HOUR_MS;
  if (task.plannedDate !== null) {
    const plannedDuration = Math.max(0.25, task.hoursLeft || allocatedHours) * HOUR_MS;
    const start = Date.parse(`${task.plannedDate}T${task.plannedStartTime ?? "00:00"}:00.000Z`);
    const end =
      task.plannedEndTime === null
        ? start + plannedDuration
        : Date.parse(`${task.plannedDate}T${task.plannedEndTime}:00.000Z`);
    return {
      allocatedHours: task.hoursLeft,
      end: end > start ? end : start + plannedDuration,
      start,
    };
  }
  const explicitStart =
    task.startDate === null
      ? null
      : Date.parse(`${task.startDate}T${task.startTime ?? "00:00"}:00.000Z`);
  const explicitEnd =
    task.dueDate === null
      ? null
      : task.endTime == null
        ? addDays(dateValue(task.dueDate), 1)
        : Date.parse(`${task.dueDate}T${task.endTime}:00.000Z`);
  if (
    task.startTime != null &&
    task.endTime != null &&
    explicitStart !== null &&
    explicitEnd !== null &&
    explicitEnd > explicitStart
  )
    return { allocatedHours: task.allocatedHours, end: explicitEnd, start: explicitStart };
  if (task.dueDate !== null) {
    const end = explicitEnd ?? addDays(dateValue(task.dueDate), 1);
    return { allocatedHours: task.allocatedHours, end, start: end - duration };
  }
  if (explicitStart !== null) {
    return {
      allocatedHours: task.allocatedHours,
      end: explicitStart + duration,
      start: explicitStart,
    };
  }
  return null;
};

export const GanttChart = ({
  delegations = [],
  initialMode = "tasks",
  onChanged,
  onOpenEntity,
  projectId,
  projectMetrics,
  projects,
  showModeSwitch = true,
  tasks,
  workingDays = [],
}: {
  delegations?: NonNullable<WorkspaceData["delegations"]>;
  initialMode?: GanttMode;
  onChanged?: () => Promise<void>;
  onOpenEntity?: (entity: { id: string; type: "project" | "task" }) => void;
  projectId?: string;
  projectMetrics: Record<string, ProjectMetrics>;
  projects: Project[];
  showModeSwitch?: boolean;
  tasks: Task[];
  workingDays?: {
    endTime: string;
    enabled: boolean;
    startTime: string;
    weekday: string;
  }[];
}) => {
  const today = isoDate(new Date());
  const [mode, setMode] = useState<GanttMode>(initialMode);
  const [periodEnd, setPeriodEnd] = useState(isoDate(utcDate(addDays(dateValue(today), 30))));
  const [periodStart, setPeriodStart] = useState(today);
  const [scale, setScale] = useState<GanttScale>("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [moveMessage, setMoveMessage] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const scrollToStartRequested = useRef(false);
  const drag = useRef<{ clientX: number; item: GanttItem } | null>(null);
  const items = useMemo<GanttItem[]>(() => {
    if (mode === "projects")
      return projects.flatMap((project) => {
        if (projectId !== undefined && project.id !== projectId) return [];
        const metrics = projectMetrics[project.id];
        const schedules = tasks
          .filter((task) => task.projectId === project.id && task.workflowLane !== "cancelled")
          .map(taskSchedule)
          .filter((schedule): schedule is NonNullable<typeof schedule> => schedule !== null);
        if (schedules.length === 0) return [];
        const start = Math.min(...schedules.map((schedule) => schedule.start));
        const end = Math.max(...schedules.map((schedule) => schedule.end));
        return [
          {
            allocatedHours: metrics?.allocatedHours ?? 0,
            delegates:
              delegations.find(
                (item) => item.subjectType === "project" && item.subjectId === project.id,
              )?.delegates ?? [],
            end,
            id: project.id,
            itemType: "project" as const,
            label: project.name,
            progress: metrics?.progressPercent ?? 0,
            start,
            version: project.version,
          },
        ];
      });
    return tasks.flatMap((task) => {
      if (projectId !== undefined && task.projectId !== projectId) return [];
      const schedule = taskSchedule(task);
      if (schedule === null) return [];
      return [
        {
          ...schedule,
          delegates:
            delegations.find((item) => item.subjectType === "task" && item.subjectId === task.id)
              ?.delegates ?? [],
          id: task.id,
          itemType: "task" as const,
          label: task.title,
          progress:
            task.workflowLane === "done"
              ? 100
              : task.checklist.length === 0
                ? 0
                : (task.checklist.filter((item) => item.completed).length / task.checklist.length) *
                  100,
          version: task.version,
        },
      ];
    });
  }, [delegations, mode, projectId, projectMetrics, projects, tasks]);

  const timeline = useMemo(() => {
    const anchor = dateValue(selectedDate);
    let start: number;
    let end: number;
    let pixelsPerMs: number;
    let ticks: TimelineTick[];
    let unitPixels: number;
    if (scale === "day") {
      start = anchor;
      end = addDays(start, 1);
      unitPixels = 52;
      pixelsPerMs = unitPixels / HOUR_MS;
      ticks = Array.from({ length: 25 }, (_, hour) => ({
        label: `${String(hour)}:00`,
        left: hour * unitPixels,
      }));
    } else if (scale === "week") {
      start = startOfWeek(anchor);
      end = addDays(start, 7);
      unitPixels = 160;
      pixelsPerMs = unitPixels / DAY_MS;
      ticks = Array.from({ length: 7 }, (_, day) => {
        const value = addDays(start, day);
        return {
          label: new Intl.DateTimeFormat("en", {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
            weekday: "long",
          }).format(utcDate(value)),
          left: day * unitPixels,
        };
      });
    } else if (scale === "month") {
      const date = utcDate(anchor);
      start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
      end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
      unitPixels = 44;
      pixelsPerMs = unitPixels / DAY_MS;
      const days = Math.round((end - start) / DAY_MS);
      ticks = Array.from({ length: days }, (_, day) => {
        const value = addDays(start, day);
        return {
          label: new Intl.DateTimeFormat("en", {
            day: "numeric",
            timeZone: "UTC",
            weekday: "short",
          }).format(utcDate(value)),
          left: day * unitPixels,
        };
      });
    } else if (scale === "year") {
      const year = utcDate(anchor).getUTCFullYear();
      start = Date.UTC(year, 0, 1);
      end = Date.UTC(year + 1, 0, 1);
      unitPixels = 4;
      pixelsPerMs = unitPixels / DAY_MS;
      ticks = Array.from({ length: 12 }, (_, month) => {
        const value = Date.UTC(year, month, 1);
        return {
          label: new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(
            utcDate(value),
          ),
          left: (value - start) * pixelsPerMs,
        };
      });
    } else {
      start = dateValue(periodStart);
      end = addDays(Math.max(start, dateValue(periodEnd)), 1);
      const days = Math.max(1, Math.round((end - start) / DAY_MS));
      unitPixels = days <= 31 ? 44 : days <= 93 ? 18 : days <= 366 ? 4 : 2;
      pixelsPerMs = unitPixels / DAY_MS;
      const tickStep = days <= 62 ? 1 : days <= 366 ? 7 : 30;
      ticks = Array.from({ length: Math.ceil(days / tickStep) }, (_, index) => {
        const value = addDays(start, index * tickStep);
        return {
          label: new Intl.DateTimeFormat("en", {
            day: "numeric",
            month: "short",
            ...(days > 366 ? { year: "2-digit" } : {}),
            timeZone: "UTC",
          }).format(utcDate(value)),
          left: index * tickStep * unitPixels,
        };
      });
    }
    return {
      end,
      pixelsPerMs,
      start,
      ticks,
      today: dateValue(today),
      unitPixels,
      width: Math.max(760, (end - start) * pixelsPerMs),
    };
  }, [periodEnd, periodStart, scale, selectedDate, today]);
  const visibleItems = items.filter(
    (item) => item.start < timeline.end && item.end > timeline.start,
  );

  useEffect(() => {
    if (!scrollToStartRequested.current || viewport.current === null) return;
    viewport.current.scrollTo({ behavior: "smooth", left: 0 });
    scrollToStartRequested.current = false;
  }, [periodEnd, periodStart, scale, selectedDate, visibleItems.length]);

  const moveItem = async (item: GanttItem, clientX: number) => {
    const started = drag.current;
    drag.current = null;
    if (started === null) return;
    const rawMinutes = (clientX - started.clientX) / timeline.pixelsPerMs / 60_000;
    const increment = scale === "day" ? 15 : scale === "week" ? 60 : 1_440;
    const deltaMinutes = Math.round(rawMinutes / increment) * increment;
    if (deltaMinutes === 0) return;
    setMoveMessage("Updating schedule…");
    try {
      if (item.itemType === "task")
        await workspaceRequest(`/api/tasks/${item.id}/schedule`, "POST", {
          startAt: new Date(item.start + deltaMinutes * 60_000).toISOString(),
          version: item.version,
        });
      else
        await workspaceRequest(`/api/projects/${item.id}/schedule`, "POST", {
          deltaMinutes,
          version: item.version,
        });
      await onChanged?.();
      setMoveMessage("Schedule updated within working hours.");
    } catch (error) {
      setMoveMessage(error instanceof Error ? error.message : "Unable to update the schedule.");
    }
  };

  const navigate = (direction: number) => {
    const value = dateValue(selectedDate);
    const next =
      scale === "day"
        ? addDays(value, direction)
        : scale === "week"
          ? addDays(value, direction * 7)
          : scale === "month"
            ? addCalendarMonths(value, direction)
            : scale === "year"
              ? Date.UTC(utcDate(value).getUTCFullYear() + direction, 0, 1)
              : addDays(
                  value,
                  direction *
                    Math.max(
                      1,
                      Math.round((dateValue(periodEnd) - dateValue(periodStart)) / DAY_MS) + 1,
                    ),
                );
    setSelectedDate(isoDate(utcDate(next)));
    if (scale === "period") {
      const duration = Math.max(
        1,
        Math.round((dateValue(periodEnd) - dateValue(periodStart)) / DAY_MS) + 1,
      );
      setPeriodStart(isoDate(utcDate(addDays(dateValue(periodStart), direction * duration))));
      setPeriodEnd(isoDate(utcDate(addDays(dateValue(periodEnd), direction * duration))));
    }
  };
  const selectToday = () => {
    scrollToStartRequested.current = true;
    setSelectedDate(today);
    if (scale === "period") {
      setPeriodStart(isoDate(utcDate(addDays(dateValue(today), -15))));
      setPeriodEnd(isoDate(utcDate(addDays(dateValue(today), 15))));
    }
    if (viewport.current !== null) {
      viewport.current.scrollTo({ behavior: "smooth", left: 0 });
      scrollToStartRequested.current = false;
    }
  };

  return (
    <div className="gantt">
      <div className="gantt-controls">
        {showModeSwitch ? (
          <div className="segmented-control" aria-label="Gantt items">
            {(["projects", "tasks"] as const).map((value) => (
              <button
                aria-pressed={mode === value}
                className={mode === value ? "compact" : "secondary compact"}
                key={value}
                onClick={() => {
                  setMode(value);
                }}
                type="button"
              >
                {value === "projects" ? "Projects" : "Tasks"}
              </button>
            ))}
          </div>
        ) : null}
        <label className="compact-control">
          Scale
          <select
            value={scale}
            onChange={(event) => {
              setScale(event.target.value as GanttScale);
            }}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
            <option value="period">Time period</option>
          </select>
        </label>
        {scale === "period" ? (
          <>
            <label className="compact-control">
              Period start
              <input
                max={periodEnd}
                onChange={(event) => {
                  if (event.target.value.length > 0) setPeriodStart(event.target.value);
                }}
                type="date"
                value={periodStart}
              />
            </label>
            <label className="compact-control">
              Period end
              <input
                min={periodStart}
                onChange={(event) => {
                  if (event.target.value.length > 0) setPeriodEnd(event.target.value);
                }}
                type="date"
                value={periodEnd}
              />
            </label>
          </>
        ) : (
          <label className="compact-control">
            Selected date
            <input
              onChange={(event) => {
                if (event.target.value.length > 0) setSelectedDate(event.target.value);
              }}
              type="date"
              value={selectedDate}
            />
          </label>
        )}
        <div className="button-row">
          <button
            aria-label="Previous time window"
            className="secondary compact"
            onClick={() => {
              navigate(-1);
            }}
            type="button"
          >
            ←
          </button>
          <button className="secondary compact" onClick={selectToday} type="button">
            Today
          </button>
          <button
            aria-label="Next time window"
            className="secondary compact"
            onClick={() => {
              navigate(1);
            }}
            type="button"
          >
            →
          </button>
        </div>
      </div>
      <p aria-live="polite" className="form-message">
        {moveMessage}
      </p>
      {items.length === 0 ? (
        <p className="muted">No scheduled {mode} to display.</p>
      ) : visibleItems.length === 0 ? (
        <p className="muted">No {mode} fall within this time window.</p>
      ) : (
        <div className="gantt-shell">
          <div className="gantt-labels" aria-hidden="true">
            <div className="gantt-label gantt-label-header">
              {mode === "projects" ? "Project" : "Task"}
            </div>
            {visibleItems.map((item) => (
              <div className="gantt-label" key={item.id} title={item.label}>
                {item.label}
              </div>
            ))}
          </div>
          <div
            aria-label={`${mode === "projects" ? "Project" : "Task"} Gantt timeline`}
            className="gantt-viewport"
            ref={viewport}
            tabIndex={0}
          >
            <div
              className="gantt-canvas"
              style={
                {
                  "--gantt-unit": `${String(timeline.unitPixels)}px`,
                  width: timeline.width,
                } as CSSProperties
              }
            >
              <div className="gantt-axis">
                {timeline.ticks.map((tick) => (
                  <span key={`${tick.label}-${String(tick.left)}`} style={{ left: tick.left }}>
                    {tick.label}
                  </span>
                ))}
              </div>
              {timeline.today >= timeline.start && timeline.today < timeline.end ? (
                <div
                  aria-label="Today"
                  aria-orientation="vertical"
                  className="gantt-today"
                  role="separator"
                  style={{ left: (timeline.today - timeline.start) * timeline.pixelsPerMs }}
                />
              ) : null}
              {visibleItems.map((item) => {
                const start = Math.max(item.start, timeline.start);
                const end = Math.min(item.end, timeline.end);
                const left = (start - timeline.start) * timeline.pixelsPerMs;
                const width = Math.max(4, (end - start) * timeline.pixelsPerMs);
                return (
                  <div className="gantt-track" key={item.id}>
                    <div
                      className="gantt-bar"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ")
                          onOpenEntity?.({ id: item.id, type: item.itemType });
                      }}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        drag.current = { clientX: event.clientX, item };
                      }}
                      onPointerUp={(event) => {
                        if (
                          Math.abs(event.clientX - (drag.current?.clientX ?? event.clientX)) <= 4
                        ) {
                          drag.current = null;
                          onOpenEntity?.({ id: item.id, type: item.itemType });
                        } else void moveItem(item, event.clientX);
                      }}
                      role="button"
                      style={{ left, width }}
                      tabIndex={0}
                      title={`${item.label}: ${formatDateTime(item.start)} to ${formatDateTime(item.end)}${item.allocatedHours === null ? "" : ` · ${String(item.allocatedHours)}h allocated`} · Drag to reschedule within ${String(workingDays.filter((day) => day.enabled).length)} working days`}
                    >
                      <span>{item.label}</span>
                      <DelegationIndicator compact delegates={item.delegates} />
                      <i
                        style={{ width: `${String(Math.max(0, Math.min(100, item.progress)))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
