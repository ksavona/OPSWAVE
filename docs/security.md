# Security Architecture and Threat Model

## Status

Phase 0 establishes security decisions, safe primitives, and validation. It does not implement application authentication, authorization, credential persistence, or live AI access. No production-readiness claim is made.

## Protected assets

- Owner password and password hash.
- Session identifiers and security events.
- AI provider credentials and the external master key.
- Intake content, projects, tasks, schedules, reports, and audit history.
- Database backups, logs, traces, browser state, CI artifacts, and screenshots.

## Trust boundaries

| Boundary                  | Primary controls                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Browser to web/server     | Authentication, authorization, origin/CSRF validation, schema validation, bounded inputs                |
| Web/worker to PostgreSQL  | Least-privilege role, parameterized access, workspace scope, migrations, encrypted provider credentials |
| Web/worker to AI provider | Minimal approved context, environment/vault credential boundary, structured output validation, timeouts |
| Job producer to worker    | Durable validated payload, idempotency key, no plaintext credentials, bounded retries                   |
| Host to backup storage    | Encryption, access restriction, retention, restore testing, separate master-key custody                 |

## Threats and planned controls

### Credential theft

- Passwords use Argon2id with versioned parameters and a bounded input length.
- AI credentials use AES-256-GCM authenticated encryption with a random 96-bit nonce and version-bound associated data.
- The AI master key stays outside the database and version control.
- Logs redact known credential fields; tests verify synthetic secrets remain absent.
- Session tokens will be random opaque values stored as server-side digests.

### Authentication abuse

- Initial setup will be a one-time local bootstrap with no default credentials.
- Login responses will not reveal whether a username exists.
- Rate limiting will combine account and network signals without permanently locking out the only owner.
- Password change and local recovery will rotate credentials and revoke sessions.

These controls are architectural decisions only until Phase 1 implements and tests them.

### Prompt injection and unsafe AI output

- Intake content is untrusted and never grants authority.
- Provider output must conform to a versioned schema before persistence.
- Drafts require human approval before publication.
- Provider output cannot execute external actions or bypass deterministic domain rules.
- The standard test path uses a deterministic fake provider.

### Cross-workspace data exposure

- Every persisted record will carry workspace scope even though the first release exposes one owner.
- Authorization checks belong in shared server/domain boundaries, not UI visibility alone.
- Tests will include rejected anonymous and cross-workspace access.

### Injection and unsafe rendering

- Database access uses typed, parameterized queries.
- Markdown and imported content require sanitization before rendering.
- CSV exports require formula-injection protection.
- Mermaid labels, URLs, filenames, and log metadata require escaping and validation.

### Excessive agency

- AI proposes; deterministic code validates and applies approved state changes.
- Consequential external actions require explicit human approval unless a later specification defines a safe exception.
- Background jobs use narrow permissions, bounded retries, idempotency, and inspectable results.

### Denial of service

- Password, intake, upload, model-output, pagination, and graph sizes require explicit bounds.
- Login and provider-test endpoints require rate limits.
- Worker concurrency, retries, and catch-up windows remain bounded.

## Implemented Phase 0 controls

- Strict secret and environment ignore rules.
- High-confidence public-file secret scan.
- Argon2id wrapper with production defaults and test-only lower cost.
- Authenticated credential-encryption wrapper with fail-closed errors.
- Structured logger redaction for known secret fields.
- Exact dependencies, frozen lockfile, release-age policy, reviewed production licenses, and audit gate.
- Pinned CI actions and least-privilege workflow permissions.
- Synthetic-only tests and no required live provider access.

## Residual risk

The web foundation is intentionally unauthenticated because it serves no application data. Adding any owner or operational data before Phase 1 authentication and authorization are complete is prohibited.
