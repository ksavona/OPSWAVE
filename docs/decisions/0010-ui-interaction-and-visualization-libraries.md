# ADR 0010: UI Interaction and Visualization Libraries

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

Later phases require drag-and-drop, Gantt timelines, dependency graphs, and charts. These libraries affect accessibility, licensing, bundle size, maintenance, and exit cost. Installing them before their phases would add unused production code.

## Decision

Adopt these candidates when their first implementation phase begins, after rechecking versions and advisories:

| Capability       | Selected library reviewed in Phase 0 | License | Mandatory accessible alternative                                       |
| ---------------- | ------------------------------------ | ------- | ---------------------------------------------------------------------- |
| Drag-and-drop    | `@dnd-kit/core` `6.3.1`              | MIT     | Keyboard/touch move controls and explicit destination selector         |
| Dependency graph | `@xyflow/react` `12.11.2`            | MIT     | Navigable task/dependency list and safe Mermaid export                 |
| Charts           | `recharts` `3.10.1`                  | MIT     | Equivalent data table and text summary                                 |
| Gantt            | `frappe-gantt` `1.2.2`               | MIT     | Accessible task table with dates/dependencies and non-pointer controls |

Treat libraries as renderers, never sources of truth. Domain/query services calculate order, dates, dependencies, and metrics. Wrap each library behind an application component so it can be replaced.

## Consequences

### Positive

- All selected libraries use permissive licenses and have replaceable boundaries.
- Accessibility does not depend on canvas/SVG or pointer behavior.
- Dependencies enter the lockfile only when used and tested.

### Negative

- Frappe Gantt and graph interactions need substantial accessibility work outside the library.
- Wrappers and alternative views add implementation effort.

## Validation

The implementing phases must recheck maintenance/license/advisories, measure production bundle impact, test keyboard and touch paths, scan with axe, and verify equivalent table/list semantics before acceptance.

## References

- [dnd-kit](https://github.com/clauderic/dnd-kit)
- [React Flow](https://github.com/xyflow/xyflow)
- [Recharts](https://github.com/recharts/recharts)
- [Frappe Gantt](https://github.com/frappe/gantt)
