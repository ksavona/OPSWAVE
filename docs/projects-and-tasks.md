# Projects and Tasks

Phase 2 provides the private workspace for managing projects and tasks. It remains a single-owner product surface; all project and task routes require the owner session.

## Projects and stages

Each workspace begins with `Planned`, `In progress`, `Done`, and `Cancelled` stages. Project configuration lives in Settings, where stages can be created, edited, sequenced, and archived. A project has a title, details, rich notes, Priority level from 1–5, optional LLM link, lifecycle stage, archive state, version, and audit history. The legacy 1–100 project priority no longer exists. The home page uses active stages as its project Kanban columns. Done and Cancelled are collapsed to narrow vertical columns initially, preserving the board's height, and every project column can be expanded or collapsed.

## Tasks and lanes

Tasks have an optional project, title, allocated and spent hours, size, value-add text, work description, definition of done, rich notes, checklist, start and due dates, business-value score/rationale/source, and workflow lane. The nine global lanes are:

- Inbox
- This Week
- Today
- In Focus
- Monitor / Validate
- Waiting
- Delegated
- Done
- Cancelled

The board offers four server-computed display modes. Manual mode preserves stable lane positions. Planning priority orders by due date. Greatest value places scored tasks first, then orders by descending score, earlier due date, creation time, and stable ID. Dependency order topologically places blockers before dependent tasks while preserving the stable manual order where no dependency decides the result. Tasks can be dragged between lanes and projects between stages. Condensed Kanbans keep every card available in a vertically scrollable lane. Each stage header has a `+` action that creates directly into that stage. Compact cards contain summary fields only: a single click filters the workspace to related records, a double click or Enter opens the full-screen editor, and clicking outside a card clears the filter. Active task outlines transition from white through yellow to red during the final 60 days before the deadline. An overdue active task uses a dark-red card background; completed and cancelled tasks are excluded from deadline warnings.

## Scheduled planning

The worker runs timezone-aware, database-idempotent planning automations at midnight. Weekly planning runs on the first configured working day, resets unlocked incomplete Today and This Week work to Inbox, calculates the documented 100-point score, preserves locked commitments, and schedules only work that fits configured capacity after reserve time and 30-minute focus gaps. Daily planning returns unlocked unfinished Today work to This Week, finds the next configured working day, and fills Today using the configured 1-large, 2-medium, and 3-small target scaled by that day's working hours. Locked schedules are never moved automatically. Every run stores selections, deferrals, exclusions, scores, rationales, capacity used, and capacity remaining.

Planning eligibility requires an Inbox or This Week task whose start date has arrived, whose dependencies are cleared, whose status is not On hold, and whose remaining effort is known. Mega tasks and tasks explicitly excluded from planning remain visible but consume no automatic focus capacity. The task editor exposes planning eligibility, schedule lock, planned date/time, score, rationale, and last-planned metadata.

When OpenAI is configured, ranking uses a structured LLM response and then reapplies deterministic quota and capacity constraints. The deterministic fallback uses deadline, business value, Priority level (1–5 only), downstream tasks unblocked, and allocated hours in that order. Dependencies on Done or Cancelled tasks are treated as cleared. Each automation is unique per workspace, kind, and local date so restarts cannot repeat a completed move.

## Integrity and safety

Writes use optimistic versions and return a safe conflict response when a current record has changed. Project ownership is validated before task assignment. An `ai_proposed` score cannot replace an owner-sourced score. Task deletion is a recoverable soft deletion at the data layer and removes the task from active boards and dependency graphs. Task, project, and stage changes emit redacted audit events. Each full-screen task or project editor has a right-side audit timeline showing the actor, time, lifecycle moves, and field-level before/after values. Rich-text changes are identified without duplicating the full notes document into audit metadata.

The browser API boundary is same-origin protected, parses bounded JSON payloads, and validates all inputs with the shared domain schemas. See [security](security.md) and [testing and validation](testing.md).

## Dependencies and timeline

Dependencies are directed blocker edges between tasks and projects: either record type can be blocked by either type. A record cannot block itself, duplicate edges are rejected, and a transaction rejects any cross-type chain that would create a cycle. Dependencies are managed in the full-screen editor with a type-ahead blocker picker. Same-project, pending-state, task/project type, and per-task-stage filters control the available options.

Project progress, allocated/spent hours, and dates are derived live from linked, non-cancelled tasks. Total allocated task hours represent 100%. Active tasks contribute the smaller of spent and allocated hours, while a task in Done contributes its full allocation. A scheduled task stores start/end dates and times; legacy date-only tasks still use the due date plus allocated hours. Day view shows 0:00–24:00 for the selected date, Week shows Monday–Sunday, Month includes every day in the selected month, Year spans the selected calendar year, and Time period accepts explicit inclusive start/end dates. Dragging a task bar reschedules it within enabled work windows. Dragging a project shifts all unfinished linked tasks by the same offset and schedules previously unscheduled active tasks into working time. Selecting a project filters the main task Gantt to that project.

The dependency map renders Mermaid as an interactive diagram, gives every project frame a distinct color, uses rounded nodes and orthogonal connectors, and supports pointer-drag panning, mouse-wheel zoom, keyword search, and successive matches. Clicking a task node, project node, or project frame opens its full-screen editor. Clicking a Gantt bar opens the same editor; dragging it still reschedules the record. Mermaid labels are escaped before rendering; the graph is never the source of truth.
