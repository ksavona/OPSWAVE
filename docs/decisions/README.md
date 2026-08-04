# Architecture Decision Records

Architecture decision records (ADRs) capture consequential or difficult-to-reverse technical choices together with their context and tradeoffs.

## Status values

- **Proposed** — under discussion and not approved for implementation.
- **Accepted** — approved and current.
- **Superseded** — replaced by a later ADR.
- **Deprecated** — retained for history but no longer recommended.
- **Rejected** — considered but not selected.

## Naming

Use a zero-padded sequence and a short kebab-case title:

```text
0001-select-application-runtime.md
0002-define-authentication-boundary.md
```

Copy [0000-template.md](0000-template.md) and complete every section. Do not renumber accepted records. When a decision changes materially, add a new ADR and link both records.

## Decision index

|                                                           ADR | Decision                                        | Status   |
| ------------------------------------------------------------: | ----------------------------------------------- | -------- |
|          [0001](0001-runtime-package-manager-and-monorepo.md) | Runtime, package manager, and monorepo          | Accepted |
|                          [0002](0002-web-and-api-boundary.md) | Web and API boundary                            | Accepted |
|             [0003](0003-postgresql-drizzle-and-migrations.md) | PostgreSQL, Drizzle, and migrations             | Accepted |
|                    [0004](0004-worker-queue-and-schedules.md) | Worker, queue, and schedules                    | Accepted |
| [0005](0005-owner-bootstrap-password-hashing-and-recovery.md) | Owner bootstrap, password hashing, and recovery | Accepted |
|                 [0006](0006-server-side-sessions-and-csrf.md) | Server-side sessions and CSRF                   | Accepted |
|                           [0007](0007-login-rate-limiting.md) | Login and sensitive-action rate limiting        | Accepted |
|          [0008](0008-ai-credential-protection-and-sources.md) | AI credential protection and sources            | Accepted |
|                 [0009](0009-ai-provider-and-responses-api.md) | AI provider and Responses API                   | Accepted |
|    [0010](0010-ui-interaction-and-visualization-libraries.md) | UI interaction and visualization libraries      | Accepted |
|                [0011](0011-deployment-and-backup-boundary.md) | Deployment and backup boundary                  | Accepted |
|                              [0012](0012-apache-2-license.md) | Apache 2.0 license                              | Accepted |
