# Architecture Status

## Current state

OpsWeave has no application architecture yet. The repository currently contains public governance, documentation scaffolding, contribution templates, and a repository hygiene check.

The following are not yet selected or implemented:

- application runtime and frameworks;
- package manager and dependency manifests;
- web, API, worker, and persistence boundaries;
- database schema and migrations;
- authentication and authorization;
- AI provider integration;
- testing and coverage tooling;
- deployment and operational infrastructure.

## Provisional system boundaries

Future architecture work is expected to separate these responsibilities, subject to recorded decisions:

- user-facing web experience and protected server endpoints;
- domain rules for projects, tasks, dependencies, prioritisation, and scheduling;
- persistence and transactional data access;
- background jobs and durable schedules;
- replaceable AI provider adapters with schema-validated output; and
- deterministic test support using synthetic fixtures and fake external services.

These boundaries are product direction, not an implemented architecture.

## Design constraints

Architecture decisions must account for:

- untrusted intake content and AI output;
- explicit human approval before consequential external actions;
- least-privilege access and workspace data isolation;
- redaction of credentials and private operational data;
- deterministic behavior when an AI provider is unavailable;
- replaceable external integrations; and
- reproducible local and continuous-integration validation.

Consequential choices must be recorded in [architecture decision records](../decisions/README.md) before dependent implementation is merged.
