# Environment Configuration

Copy `.env.example` to `.env`. The local file is ignored and the repository validation rejects tracked `.env` variants other than `.env.example`.

| Variable                              |                   Required | Secret | Purpose                                                                  |
| ------------------------------------- | -------------------------: | -----: | ------------------------------------------------------------------------ |
| `APP_BASE_URL`                        |                Development |     No | Canonical local web URL                                                  |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` |                   Optional |     No | Use an existing Chromium binary locally                                  |
| `NEXT_TELEMETRY_DISABLED`             |                Recommended |     No | Disable framework telemetry in project commands                          |
| `TRUST_PROXY`                         |                   Optional |     No | Trust validated forwarded client IPs only behind a configured proxy      |
| `AUTH_RATE_LIMIT_PEPPER`              |                    Runtime |    Yes | HMAC pepper for privacy-reduced account/network limiter keys             |
| `POSTGRES_DB`                         |                Development |     No | Local database name                                                      |
| `POSTGRES_USER`                       |                Development |     No | Local database role                                                      |
| `POSTGRES_PASSWORD`                   |                Development |    Yes | Local database password                                                  |
| `DATABASE_URL`                        |         Migrations/runtime |    Yes | PostgreSQL connection string                                             |
| `TEST_DATABASE_URL`                   |          Integration tests |    Yes | Isolated loopback test database on port `55432`                          |
| `OPENAI_API_KEY`                      |                   Optional |    Yes | Read-only environment-managed credential status; no live adapter yet     |
| `OPENAI_DEFAULT_MODEL`                |       Future live provider |     No | Configurable provider model; current documented default is `gpt-5.6-sol` |
| `AI_CREDENTIAL_MASTER_KEY`            | Settings credential writes |    Yes | Base64-encoded 32-byte authenticated-encryption key                      |
| `AI_CREDENTIAL_MASTER_KEY_VERSION`    | Settings credential writes |     No | Positive envelope key version                                            |

## Secret rules

- Never commit `.env`, credentials, connection strings containing real passwords, or master keys.
- Do not use production values in local development or tests.
- Keep the AI master key outside PostgreSQL and back it up separately.
- Generate a separate random rate-limit pepper of at least 32 characters.
- Standard validation uses random or clearly synthetic credentials and a deterministic fake provider.
- A live provider check must be explicit, use synthetic content, and stay outside required CI.

## Master-key generation

Generate 32 random bytes using an approved system tool and store the base64 result in the deployment secret manager or ignored local `.env`. Do not paste the value into issues, logs, screenshots, or command output. Losing the key does not block ordinary settings or operational data, but the stored provider credential must be replaced.
