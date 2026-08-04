# Environment Configuration

Copy `.env.example` to `.env`. The local file is ignored and the repository validation rejects tracked `.env` variants other than `.env.example`.

| Variable                              |                  Required | Secret | Purpose                                                                  |
| ------------------------------------- | ------------------------: | -----: | ------------------------------------------------------------------------ |
| `APP_BASE_URL`                        |               Development |     No | Canonical local web URL                                                  |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` |                  Optional |     No | Use an existing Chromium binary locally                                  |
| `NEXT_TELEMETRY_DISABLED`             |               Recommended |     No | Disable framework telemetry in project commands                          |
| `POSTGRES_DB`                         |               Development |     No | Local database name                                                      |
| `POSTGRES_USER`                       |               Development |     No | Local database role                                                      |
| `POSTGRES_PASSWORD`                   |               Development |    Yes | Local database password                                                  |
| `DATABASE_URL`                        |        Migrations/runtime |    Yes | PostgreSQL connection string                                             |
| `TEST_DATABASE_URL`                   |         Integration tests |    Yes | Isolated loopback test database on port `55432`                          |
| `OPENAI_API_KEY`                      |          Live checks only |    Yes | Optional environment-managed OpenAI credential                           |
| `OPENAI_DEFAULT_MODEL`                |      Future live provider |     No | Configurable provider model; current documented default is `gpt-5.6-sol` |
| `AI_CREDENTIAL_MASTER_KEY`            | Future credential storage |    Yes | Base64-encoded 32-byte authenticated-encryption key                      |
| `AI_CREDENTIAL_MASTER_KEY_VERSION`    | Future credential storage |     No | Positive version for controlled key rotation                             |

## Secret rules

- Never commit `.env`, credentials, connection strings containing real passwords, or master keys.
- Do not use production values in local development or tests.
- Keep the AI master key outside PostgreSQL and back it up separately.
- Standard validation uses random or clearly synthetic credentials and a deterministic fake provider.
- A live provider check must be explicit, use synthetic content, and stay outside required CI.

## Master-key generation

When Phase 1 begins exercising persisted AI credentials, generate 32 random bytes using an approved system tool and store the base64 result in the deployment secret manager or ignored local `.env`. Do not paste the value into issues, logs, screenshots, or command output.
