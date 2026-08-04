# Architecture Overview

## Status

OpsWeave is a Phase 0 modular-monolith foundation. The web page, health route, worker entry point, migration tooling, security primitives, and automated checks are implemented. Product workflows are not.

## Modules

| Module             | Current responsibility                           | May depend on                  |
| ------------------ | ------------------------------------------------ | ------------------------------ |
| `apps/web`         | Next.js UI and server boundary                   | Domain, database, AI packages  |
| `apps/worker`      | Structured worker process and future jobs        | Domain, database, AI packages  |
| `packages/domain`  | Framework-independent rules and security helpers | Small reviewed primitives only |
| `packages/db`      | PostgreSQL schema, connections, and migrations   | Drizzle and PostgreSQL driver  |
| `packages/ai`      | Provider contract and credential vault           | Node platform cryptography     |
| `packages/testing` | Synthetic deterministic fixtures                 | Domain types when needed       |

Applications may compose packages. Packages must not import applications. Provider-specific code must remain behind `packages/ai`; database access must remain behind `packages/db`.

## Runtime topology

The planned first deployment has three long-running processes:

1. Next.js web/server process.
2. Node.js worker process.
3. PostgreSQL database.

A TLS-terminating reverse proxy is outside the repository foundation. The web and worker share no in-memory state; durable state and job coordination use PostgreSQL after the relevant phases implement them.

## Current data flow

Phase 0 exposes only:

1. `GET /` renders a truthful foundation status page.
2. `GET /health` returns bounded service name, version, and health status.
3. The worker writes one structured startup record and exits; no jobs or schedules are registered.
4. Migration tooling creates the `opsweave.system_metadata` foundation table.
5. Unit tests exercise password hashing, credential encryption, redaction, and fake-provider behavior using synthetic values.

No user data, AI request, authentication state, or task record is accepted or persisted.

## Trust boundaries

- Browser input and all future intake content are untrusted.
- The web/server boundary authenticates, authorizes, validates, and redacts before persistence.
- The worker accepts only validated, minimal, secret-free job payloads.
- PostgreSQL is trusted for persistence but not for plaintext AI credentials.
- The external master key remains outside PostgreSQL and version control.
- AI providers receive only the minimum approved context; their output is untrusted until schema validation and human review.

## Dependency direction

```text
apps/web ─────┬──> packages/domain
              ├──> packages/db
              └──> packages/ai

apps/worker ──┬──> packages/domain
              ├──> packages/db
              └──> packages/ai

packages/* must not depend on apps/*
```

## Unimplemented boundaries

Authentication, sessions, workspace scope, project/task data, queues, schedules, live providers, authorization, audit history, retention, backups, and production containers remain planned. Their ADRs constrain future work but do not imply implementation.
