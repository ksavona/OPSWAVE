# OpsWeave

[![Full validation](https://github.com/ksavona/OPSWAVE/actions/workflows/ci.yml/badge.svg)](https://github.com/ksavona/OPSWAVE/actions/workflows/ci.yml)
[![Repository hygiene](https://github.com/ksavona/OPSWAVE/actions/workflows/repository-hygiene.yml/badge.svg)](https://github.com/ksavona/OPSWAVE/actions/workflows/repository-hygiene.yml)

OpsWeave is an early-stage personal operations workspace intended to turn unstructured work into structured, reviewable projects and tasks. The project is a public example of disciplined AI engineering, operational design, governance, testing, and maintainable software delivery.

> [!IMPORTANT]
> Phase 0 provides an engineering foundation, not a usable operations product. Authentication, project and task management, AI intake, planning, automation, reporting, and deployment are not implemented.

## What exists

- A pinned Node.js and pnpm TypeScript monorepo.
- A minimal Next.js web application and non-sensitive health endpoint.
- A background-worker scaffold with structured, redacted logging and no registered jobs.
- A PostgreSQL 18.4 container and a generated Drizzle migration.
- Argon2id password hashing and authenticated AI-credential encryption wrappers.
- A replaceable AI-provider interface with a deterministic fake provider.
- Unit, component, route, migration, browser, accessibility, secret-leak, license, build, and dependency-audit checks.
- One full validation command shared by local development and CI.

Live AI access is disabled by default and is not required by development, tests, or CI.

## Architecture

```text
apps/web       Web and future protected server boundary (foundation route only)
apps/worker    Durable background-work boundary (no live jobs yet)
packages/ai    Provider and encrypted-credential boundaries
packages/db    PostgreSQL schema, migrations, and connection factory
packages/domain
               Shared business and security rules
packages/testing
               Deterministic synthetic fixtures
```

The repository is a modular monolith. PostgreSQL is the planned system of record, and external AI providers remain replaceable. See the [architecture overview](docs/architecture/overview.md) and [decision index](docs/decisions/README.md).

## Prerequisites

- Node.js `24.19.0` (see `.node-version` or `.nvmrc`)
- pnpm `11.20.0` through Corepack
- Docker Engine with Docker Compose v2

## Local setup

```bash
corepack enable
corepack prepare pnpm@11.20.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
docker compose up --detach --wait postgres
pnpm db:migrate
pnpm dev
```

Before starting PostgreSQL, replace the example database password in `.env` and update `DATABASE_URL` to match. Generate an AI credential master key only when credential storage is exercised. A live `OPENAI_API_KEY` is optional and must remain in the ignored `.env` file or the deployment secret store.

The foundation page is available at `http://localhost:3000`; the health endpoint is `/health`.

## Full validation

```bash
pnpm validate
```

The command starts an isolated PostgreSQL test container, runs every repository quality gate, and removes the test database unless `OPSWAVE_KEEP_TEST_DATABASE=true` is set. It covers:

- repository hygiene and high-confidence secret scanning;
- formatting, Markdown, ESLint, and strict TypeScript checks;
- unit/component/route tests with line and branch coverage thresholds;
- migration tests against PostgreSQL 18.4;
- production builds and browser accessibility smoke tests;
- production dependency license review; and
- a high-severity production dependency audit.

The HTML coverage report is written to `coverage/index.html`. See [testing and validation](docs/testing.md) for focused commands and environment controls.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture overview](docs/architecture/overview.md)
- [Development guide](docs/development.md)
- [Environment configuration](docs/environment.md)
- [Security and threat model](docs/security.md)
- [Testing and validation](docs/testing.md)
- [Deployment assumptions](docs/deployment.md)
- [Backup and recovery](docs/recovery.md)
- [Synthetic data policy](docs/synthetic-data.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Security

Treat intake content, AI output, imported data, and configuration as untrusted. Never commit credentials or production data. Do not report suspected vulnerabilities in a public issue; follow [SECURITY.md](SECURITY.md).

The presence of security primitives and tests is not a claim that the planned application is secure or production-ready.

## License

Licensed under the [Apache License 2.0](LICENSE).
