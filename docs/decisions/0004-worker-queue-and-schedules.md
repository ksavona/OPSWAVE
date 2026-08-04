# ADR 0004: Worker, Queue, and Schedules

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

AI extraction, retention, planning, reports, and time-zone schedules cannot run reliably inside request lifecycles. The single-owner topology should avoid a second persistence service without evidence.

## Decision

- Run a separate Node.js worker from `apps/worker`.
- Adopt pg-boss (reviewed at `12.27.0`) when durable jobs are implemented, using the same PostgreSQL cluster with a separate schema and least-privilege role where practical.
- Keep job handlers thin; domain services own decisions and can run synchronously in tests.
- Require unique business/idempotency keys, bounded retries with jitter, safe failure categories, minimal secret-free payloads, and inspectable run history.
- Persist workspace-local schedule intent and calculate execution from IANA time zones. Do not rely only on host cron.
- Keep the Phase 0 worker non-operational; do not install or start the queue until a phase implements a tested handler.

## Consequences

### Positive

- No Redis service is required initially.
- Request handling and background work have independent lifecycles.
- Transactional domain logic stays reusable outside the queue.

### Negative

- Queue load shares PostgreSQL resources with application data.
- Long-running jobs require careful connection, concurrency, and shutdown limits.

## Validation

- Worker build and structured startup status test.
- Future phases must add restart, retry, duplicate, concurrency, DST, and missed-run integration tests before enabling jobs.

## References

- [pg-boss repository](https://github.com/timgit/pg-boss)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html)
