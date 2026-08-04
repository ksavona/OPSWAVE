# Architecture Overview

## Status

OpsWeave is a Phase 1 modular monolith. Single-owner authentication, protected settings, encrypted fake-provider credential persistence, audit foundations, migration tooling, and automated checks are implemented. Project/task and planning workflows are not.

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

1. A local CLI creates exactly one owner and initial workspace; a separate host-only recovery CLI replaces the password without deleting operational data.
2. Login verifies Argon2id credentials, applies durable privacy-reduced rate limits, and returns an opaque cookie while PostgreSQL stores only its digest.
3. Every protected page and endpoint validates the database session. Mutations also validate origin and optimistic settings versions.
4. Settings persist general preferences, seven working-day rows, prioritisation policy, and an optional AES-256-GCM credential envelope.
5. Provider verification uses only a deterministic fake. The browser receives status, never credential plaintext.
6. Security and settings changes write redacted audit metadata. The worker still has no registered jobs.

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

Project/task behavior, delegated access, queues, schedules, live providers, audit browsing, retention jobs, exercised backups, and production containers remain planned. Schema foundations for some later concepts do not imply usable product behavior.
