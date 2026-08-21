# Reporting

## Metric version

Reporting uses metric version `2026-08-06`. The database task records are authoritative; AI is not used to calculate numeric metrics.

| Metric               | Definition                                              |
| -------------------- | ------------------------------------------------------- |
| Total tasks          | All tasks visible in the workspace.                     |
| Completed tasks      | Tasks in the `done` lane.                               |
| Value-score coverage | Tasks with a business-value score divided by all tasks. |

The protected JSON endpoint is `GET /api/reports`; `GET /api/reports/tasks.csv` exports the same task records. CSV cells beginning with `=`, `+`, `-`, or `@` are prefixed with a single quote to prevent spreadsheet formula execution.

The initial report intentionally excludes raw intake content, session data, password material, provider credentials, and encrypted credential metadata. Filtering, charts, and print layouts are not yet implemented.
