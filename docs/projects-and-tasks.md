# Projects and Tasks

Phase 2 provides the private workspace for managing projects and tasks. It remains a single-owner product surface; all project and task routes require the owner session.

## Projects and stages

Each workspace begins with `Planned`, `In progress`, and `Done` stages. Stages can be created, edited, sequenced, and archived. A project has a name, optional description, lifecycle stage, archive state, version, and audit history. The home page uses active stages as its project Kanban columns.

## Tasks and lanes

Tasks have an optional project, title, optional allocated hours, size, value-add text, work description, definition of done, checklist, due date, business-value score/rationale/source, and workflow lane. The eleven global lanes are:

- Inbox
- This Week
- Today 1, Today 2, Today 3
- In Focus
- Monitor / Validate
- Waiting
- Delegated
- Done
- Cancelled

The board offers three server-computed display modes. Manual mode persists a position in each lane and exposes accessible earlier/later controls. Planning priority orders by due date. Greatest value places scored tasks first, then orders by descending score, earlier due date, creation time, and stable ID. Moving a task between lanes is available in every mode; only manual mode changes the persisted in-lane order.

## Integrity and safety

Writes use optimistic versions and return a safe conflict response when a current record has changed. Project ownership is validated before task assignment. An `ai_proposed` score cannot replace an owner-sourced score. Task, project, and stage changes emit redacted audit events without sensitive content.

The browser API boundary is same-origin protected, parses bounded JSON payloads, and validates all inputs with the shared domain schemas. See [security](security.md) and [testing and validation](testing.md).

## Dependencies and timeline

Task dependencies are directed blocker edges: a task cannot be its own blocker, duplicate edges are rejected, and a transaction rejects any edge that would create a longer cycle. Deleting a task removes its edges. The workspace presents an accessible task timeline with day, week, month, three-month, six-month, and one-year scale choices; tasks without due dates are listed separately rather than placed on a misleading timeline.

Project progress, allocated hours, and dates are derived from the project’s tasks. Progress is checklist-based and hour-weighted when allocated hours exist. The dependency inspector supports keyboard task selection, direct blocker inspection, add/remove controls, and a read-only Mermaid representation. Mermaid labels are escaped before export; the rendered graph is never the source of truth.
