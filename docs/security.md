# Security Architecture and Threat Model

## Status

Phases 1–4 implement single-owner authentication, server-side authorization checks, credential persistence, rate limiting, project/task controls, and deterministic reviewed intake. Live AI access and supported production deployment remain absent. No production-readiness claim is made.

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
- Session tokens are random opaque values stored only as server-side SHA-256 digests.

### Authentication abuse

- Initial setup is a one-time local bootstrap with no default credentials or HTTP setup route.
- Login responses do not reveal whether a username exists.
- PostgreSQL-backed rate limiting combines HMAC-reduced account and network signals without permanent lockout.
- Password change and local recovery rotate credentials and revoke sessions.
- Protected endpoints perform authoritative database session checks; proxy redirects are only an optimistic convenience.
- State-changing routes reject missing, malformed, or cross-origin `Origin` values.

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

## Implemented controls

- Strict secret and environment ignore rules.
- High-confidence public-file secret scan.
- Argon2id wrapper with production defaults and test-only lower cost.
- Authenticated credential-encryption wrapper with fail-closed errors.
- Structured logger redaction for known secret fields.
- Exact dependencies, frozen lockfile, release-age policy, reviewed production licenses, and audit gate.
- Pinned CI actions and least-privilege workflow permissions.
- Synthetic-only tests and no required live provider access.
- Twelve-hour idle and seven-day absolute sessions with throttled activity writes and immediate revocation.
- Optimistic settings versions, parameterized repository queries, database range/uniqueness constraints, and workspace scope.
- Environment-managed credential precedence and read-only presentation; settings-managed ciphertext never hydrates browser state.
- Bounded request bodies, generic safe errors, durable login attempt events, and fail-closed sensitive-action limits.
- CSV exports prefix formula-like cells with a single quote before quoting.
- Intake source text remains in the trusted persistence/worker boundary; UI and audit records expose only reviewable derived proposals and safe metadata.

## Residual risk

The implementation remains single-owner and has not had an independent security assessment. A compromised host, application process, database role plus master key, or trusted reverse proxy can defeat important controls. Proxy trust, TLS, least-privilege database roles, retention, key rotation, backup restore, and production hardening remain operator/deployment responsibilities or later-phase work.
