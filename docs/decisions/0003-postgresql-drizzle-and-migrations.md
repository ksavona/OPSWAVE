# ADR 0003: PostgreSQL, Drizzle, and Migrations

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

The application requires transactions, relational integrity, auditable migrations, scheduling coordination, JSON metadata, and reliable reporting. The repository had no database or migration convention.

## Decision

- Use PostgreSQL `18.4` as the system of record.
- Use Drizzle ORM `0.45.2`, Drizzle Kit `0.31.10`, and node-postgres `8.22.0`.
- Keep schema definitions in `packages/db/src/schema.ts` and generated migrations in `packages/db/drizzle`.
- Generate migrations from the schema, review their SQL, commit them, and never edit an applied migration.
- Store application tables in the `opsweave` schema and UTC timestamps with time zone.
- Test every migration chain from zero against real isolated PostgreSQL, not an in-memory substitute.

## Consequences

### Positive

- PostgreSQL provides constraints, transactions, indexes, and one durable substrate for later jobs.
- Typed schema and generated SQL remain reviewable.
- Migration tests detect drift and unsupported SQL behavior.

### Negative

- Local/full validation requires Docker or equivalent isolated PostgreSQL.
- Major PostgreSQL and Drizzle upgrades require explicit migration review.

## Validation

- `pnpm db:generate`
- `pnpm test:integration`
- The test refuses non-loopback URLs, non-test database names, and ports other than `55432`.

## References

- [PostgreSQL 18 documentation](https://www.postgresql.org/docs/18/)
- [Drizzle ORM documentation](https://orm.drizzle.team/docs/overview)
- [Official PostgreSQL container](https://hub.docker.com/_/postgres)
