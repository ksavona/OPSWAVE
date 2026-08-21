# ADR 0011: Deployment and Backup Boundary

- Status: Accepted
- Date: 2026-08-04
- Decision owners: @ksavona
- Supersedes: None
- Superseded by: None

## Context

OpsWeave is self-hostable and processes private operational data. The repository needs deployment constraints before feature code, but no hosting provider has been selected.

## Decision

- Target Linux containers for separate web and worker processes plus PostgreSQL 18.
- Keep TLS termination/ingress external to the app processes and trust forwarded headers only from configured proxies.
- Use deployment-secret injection for database/session/master-key values; never bake secrets into images.
- Execute migrations as an explicit release operation before switching traffic.
- Back up PostgreSQL and the AI master key separately. Encrypt backups, apply documented retention, and exercise restore/rollback before release.
- Pin base images and CI actions by immutable digest/SHA. The current Compose PostgreSQL image is development/test-only.
- Leave provider, domain, storage class, scaling, and release automation open until hosting is chosen.

## Consequences

### Positive

- Deployment responsibilities and secret custody are explicit.
- Web and worker can scale/restart independently.
- Separate key custody reduces database-backup exposure.

### Negative

- Operators must manage at least three processes plus ingress and backups.
- Production support cannot begin until a concrete deployment runbook is implemented and exercised.

## Validation

Phase 7 must test fresh install, migration, health/readiness, backup, restore, key loss/rotation, rollback, least privilege, non-root containers, and representative resource limits.

## References

- [Twelve-Factor configuration](https://12factor.net/config)
- [PostgreSQL backup and restore](https://www.postgresql.org/docs/18/backup.html)
