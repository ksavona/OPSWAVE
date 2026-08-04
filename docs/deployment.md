# Deployment Assumptions

## Status

No supported production deployment exists in Phase 0. This document records constraints for future deployment work and the environment used for local validation.

## Planned topology

- One Next.js web/server process.
- One continuously running Node.js worker process.
- One PostgreSQL 18 database.
- One external TLS reverse proxy or managed ingress.
- One deployment secret store for database credentials, session secrets, and the AI credential master key.

The processes form a modular monolith and may share a release artifact, but web and worker lifecycles remain independent.

## Current container use

`compose.yaml` provides development and isolated test PostgreSQL services only. The PostgreSQL image is pinned by version and multi-platform digest. It is not a production database configuration.

## Production requirements before release

- Non-root application containers with read-only filesystems where practical.
- TLS and secure proxy/header configuration.
- Private database networking and least-privilege roles.
- Health/readiness checks that do not expose secrets or internal details.
- Durable worker restart policy and idempotent missed-run handling.
- Encrypted, monitored backups with exercised restores.
- Separate storage and custody for the AI credential master key.
- Log redaction, retention, access controls, and correlation identifiers.
- Resource limits, dependency scanning, pinned base images, and documented rollback.
- Migration execution as an explicit release step, not an uncontrolled app-start side effect.

Hosting provider, domains, ingress, persistent volumes, and release automation remain undecided.
