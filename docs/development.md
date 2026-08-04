# Development Guide

## Toolchain

- Node.js `24.19.0`
- pnpm `11.20.0`
- PostgreSQL `18.4` through the pinned official container image
- Docker Compose v2

Use `.node-version` with a compatible version manager or `.nvmrc` with nvm. Corepack enforces the repository package-manager version.

## Setup

```bash
corepack enable
corepack prepare pnpm@11.20.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
```

Edit `.env` with local-only values. It is ignored by Git and must remain untracked.

## Local services

Start the development database and apply migrations:

```bash
docker compose up --detach --wait postgres
pnpm db:migrate
pnpm owner:bootstrap
```

Start the web process:

```bash
pnpm dev
```

The worker is currently a non-operational scaffold:

```bash
pnpm dev:worker
```

It must not be described as processing jobs until job handlers and durable queueing are implemented and tested.

`pnpm owner:bootstrap` securely prompts for the only owner and refuses replay. It is deliberately local-only: there is no registration or setup route. Use `pnpm owner:recover` from the host if the owner password is lost; recovery preserves workspace data and revokes every session.

## Database changes

1. Change `packages/db/src/schema.ts`.
2. Generate, never hand-number, the migration:

   ```bash
   pnpm db:generate
   ```

3. Review the generated SQL and metadata.
4. Run `pnpm test:integration` against the isolated test database.
5. Include migration, tests, and documentation in the same pull request.

Do not edit an applied migration. Add a new migration.

## Change workflow

1. Update the active private phase tracker to `[~]` before implementation.
2. Create a focused `agent/<scope>` branch from current `main`.
3. Keep changes within the active phase and relevant public issue.
4. Add tests and documentation with executable changes.
5. Run `pnpm validate`.
6. Record validation evidence before marking a phase complete.
7. Push and open a draft pull request; merge only after required checks pass.
