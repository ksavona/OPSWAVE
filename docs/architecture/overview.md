# Architecture Overview

## Status

OpsWeave is a Phase 4 modular monolith. It has single-owner authentication, protected settings, project and task boards, dependency metrics, immutable intake sources, durable extraction runs, and owner-approved AI task proposals.

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
6. An authenticated owner submits an intake source. The web process stores it with a fingerprint and queues a PostgreSQL-backed run without writing source text to audit metadata.
7. The worker claims one queued run with `FOR UPDATE SKIP LOCKED`, validates deterministic provider output against the versioned intake schema, and stores a review-required draft. Source text stays within the worker boundary.
8. Only explicit owner approval creates AI-proposed Inbox tasks; decline is audited. AI output never publishes directly to the board.

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

Delegated access, schedules, live providers, intake retry/restore/purge controls, audit browsing, exercised backups, and production containers remain planned.
