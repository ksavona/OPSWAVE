# Environment Configuration

Copy `.env.example` to `.env`. The local file is ignored and the repository validation rejects tracked `.env` variants other than `.env.example`.

| Variable                              |                   Required | Secret | Purpose                                                             |
| ------------------------------------- | -------------------------: | -----: | ------------------------------------------------------------------- |
| `APP_BASE_URL`                        |                Development |     No | Canonical local web URL                                             |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` |                   Optional |     No | Use an existing Chromium binary locally                             |
| `NEXT_TELEMETRY_DISABLED`             |                Recommended |     No | Disable framework telemetry in project commands                     |
| `TRUST_PROXY`                         |                   Optional |     No | Trust validated forwarded client IPs only behind a configured proxy |
| `AUTH_RATE_LIMIT_PEPPER`              |                    Runtime |    Yes | HMAC pepper for privacy-reduced account/network limiter keys        |
| `POSTGRES_DB`                         |                Development |     No | Local database name                                                 |
| `POSTGRES_USER`                       |                Development |     No | Local database role                                                 |
| `OPSWEAVE_POSTGRES_PORT`              |                   Optional |     No | Loopback host port for local PostgreSQL; defaults to `5432`         |
| `POSTGRES_PASSWORD`                   |                Development |    Yes | Local database password                                             |
| `DATABASE_URL`                        |         Migrations/runtime |    Yes | PostgreSQL connection string                                        |
| `TEST_DATABASE_URL`                   |          Integration tests |    Yes | Isolated loopback test database on port `55432`                     |
| `OPENAI_API_KEY`                      |                   Optional |    Yes | Enables the live OpenAI intake adapter in the trusted worker        |
| `OPENAI_DEFAULT_MODEL`                |     Live intake extraction |     No | Configurable provider model; deployment default is `gpt-5.6-sol`    |
| `OPSWAVE_MEMORY_DIR`                  |                   Optional |     No | Private generated owner-learning Markdown directory                 |
| `ATTACHMENT_STORAGE_PATH`             |           Document uploads |     No | Durable private attachment storage shared with the retention worker |
| `INVITATION_LINK_ENCRYPTION_KEY`      |  Invitation email delivery |    Yes | Shared web/worker AES key for short-lived encrypted link payloads   |
| `EMAIL_DELIVERY_WEBHOOK_URL`          |  Invitation email delivery |     No | Server-side email delivery adapter endpoint                         |
| `EMAIL_DELIVERY_WEBHOOK_TOKEN`        |                   Optional |    Yes | Bearer credential for the email delivery adapter                    |
| `ATTACHMENT_SCANNER_ENDPOINT`         |           Delegate uploads |     No | Fail-closed multipart malware-scanning endpoint                     |
| `ATTACHMENT_SCANNER_TOKEN`            |                   Optional |    Yes | Bearer credential for the malware scanner                           |
| `AI_CREDENTIAL_MASTER_KEY`            | Settings credential writes |    Yes | Base64-encoded 32-byte authenticated-encryption key                 |
| `AI_CREDENTIAL_MASTER_KEY_VERSION`    | Settings credential writes |     No | Positive envelope key version                                       |

## Secret rules

- Never commit `.env`, credentials, connection strings containing real passwords, or master keys.
- Do not use production values in local development or tests.
- Keep the AI master key outside PostgreSQL and back it up separately.
- Keep the invitation encryption key identical in the web and worker secret stores. Do not rotate it while invitation emails are queued.
- Do not enable delegate uploads until a real malware scanner endpoint is configured; missing or failed scans reject the upload before storage.
- Generate a separate random rate-limit pepper of at least 32 characters.
- Standard validation uses random or clearly synthetic credentials and a deterministic fake provider.
- A live provider check must be explicit, use synthetic content, and stay outside required CI.

## Master-key generation

Generate 32 random bytes using an approved system tool and store the base64 result in the deployment secret manager or ignored local `.env`. Do not paste the value into issues, logs, screenshots, or command output. Losing the key does not block ordinary settings or operational data, but the stored provider credential must be replaced.
